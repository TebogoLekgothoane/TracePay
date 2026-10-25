-- Statement imports store `source = 'statement'`, the value the application
-- has always written. Production carries a transactions_source_identity_check
-- constraint (not declared in any earlier repository migration) that rejects
-- the 'pdf'/'csv' values the first version of import_statement_transactions()
-- used, so every import failed with SQLSTATE 23514. The format of the file is
-- still recorded on statement_imports.format.

CREATE OR REPLACE FUNCTION public.import_statement_transactions(
  p_statement_id uuid,
  p_rows jsonb,
  p_statement jsonb DEFAULT '{}'::jsonb,
  p_replace boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_account uuid;
  v_format text;
  v_bank_key text;
  v_fingerprint text;
  v_inserted integer := 0;
  v_overlap integer := 0;
  v_possible integer := 0;
  v_already integer := 0;
  v_canonical integer;
  v_total integer;
  v_orphan_pairs uuid[] := '{}';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array' USING ERRCODE = '22023';
  END IF;

  SELECT account_id, format INTO v_account, v_format
  FROM public.statement_imports
  WHERE id = p_statement_id AND user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'statement not found' USING ERRCODE = '42501';
  END IF;
  IF v_account IS NULL THEN
    RAISE EXCEPTION 'statement has no account; choose the account before importing'
      USING ERRCODE = '23514';
  END IF;

  SELECT bank_key, account_fingerprint INTO v_bank_key, v_fingerprint
  FROM public.accounts WHERE id = v_account AND user_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'account not found' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_account::text, 0));

  IF p_replace THEN
    WITH removed AS (
      DELETE FROM public.transactions
      WHERE statement_id = p_statement_id AND user_id = v_uid
      RETURNING transfer_pair_id
    )
    SELECT coalesce(array_agg(DISTINCT transfer_pair_id) FILTER (WHERE transfer_pair_id IS NOT NULL), '{}')
    INTO v_orphan_pairs FROM removed;

    -- The surviving half of a deleted transfer pair is no longer confirmed.
    UPDATE public.transactions
    SET transfer_pair_id = NULL, transfer_status = 'none', transfer_confidence = NULL,
        transfer_evidence = NULL,
        transaction_class = CASE WHEN classification_source = 'transfer_match' THEN 'unknown' ELSE transaction_class END,
        classification_source = CASE WHEN classification_source = 'transfer_match' THEN NULL ELSE classification_source END
    WHERE user_id = v_uid AND transfer_pair_id = ANY(v_orphan_pairs);

    -- Rows that were duplicates of the deleted ones lost their canonical copy
    -- (duplicate_of was set NULL). Promote the earliest duplicate of each key.
    UPDATE public.transactions AS t
    SET is_duplicate = false, dedupe_status = 'unique', duplicate_of = NULL, dedupe_evidence = NULL
    FROM (
      SELECT DISTINCT ON (dedupe_key) id
      FROM public.transactions
      WHERE user_id = v_uid
        AND account_id = v_account
        AND is_duplicate = true
        AND duplicate_of IS NULL
        AND dedupe_key IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.transactions AS c
          WHERE c.user_id = v_uid
            AND c.dedupe_key = transactions.dedupe_key
            AND c.is_duplicate = false
        )
      ORDER BY dedupe_key, created_at, id
    ) AS promote
    WHERE t.id = promote.id;
  END IF;

  WITH src AS (
    SELECT
      t.ord::integer AS ord,
      (t.e ->> 'date')::date AS d,
      nullif(t.e ->> 'transaction_time', '')::time AS tm,
      t.e ->> 'description' AS descr,
      (t.e ->> 'amount')::numeric(14, 2) AS amount,
      t.e ->> 'type' AS typ,
      nullif(t.e ->> 'balance', '')::numeric(14, 2) AS balance,
      nullif(t.e ->> 'currency', '') AS currency,
      v_account::text || '|' || (t.e ->> 'date') || '|' || (t.e ->> 'type') || '|'
        || to_char(abs((t.e ->> 'amount')::numeric(14, 2)), 'FM999999999990.00') || '|'
        || public.normalize_transaction_description(t.e ->> 'description') AS base_key,
      t.e AS j
    FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS t(e, ord)
  ),
  keyed AS (
    SELECT
      src.*,
      gen_random_uuid() AS new_id,
      CASE
        WHEN row_number() OVER (PARTITION BY base_key ORDER BY ord) = 1 THEN base_key
        ELSE base_key || '|#' || row_number() OVER (PARTITION BY base_key ORDER BY ord)
      END AS dedupe_key
    FROM src
  ),
  by_key AS (
    SELECT DISTINCT ON (k.ord) k.ord, c.id, c.statement_id
    FROM keyed AS k
    JOIN public.transactions AS c
      ON c.user_id = v_uid AND c.dedupe_key = k.dedupe_key AND c.is_duplicate = false
    ORDER BY k.ord, c.created_at, c.id
  ),
  by_balance AS (
    SELECT DISTINCT ON (k.ord) k.ord, t.id
    FROM keyed AS k
    JOIN public.transactions AS t
      ON t.user_id = v_uid
     AND t.account_id = v_account
     AND t.is_duplicate = false
     AND t.statement_id <> p_statement_id
     AND t.date = k.d
     AND t.type = k.typ
     AND abs(t.amount) = abs(k.amount)
     AND t.balance IS NOT NULL
     AND k.balance IS NOT NULL
     AND t.balance = k.balance
    WHERE NOT EXISTS (SELECT 1 FROM by_key WHERE by_key.ord = k.ord)
    ORDER BY k.ord, t.created_at, t.id
  ),
  by_similarity AS (
    SELECT DISTINCT ON (k.ord) k.ord, t.id,
      CASE
        WHEN nullif(btrim(k.j ->> 'reference'), '') IS NOT NULL
          AND lower(btrim(t.reference)) = lower(btrim(k.j ->> 'reference'))
        THEN 'reference'
        ELSE 'description_containment'
      END AS reason
    FROM keyed AS k
    JOIN public.transactions AS t
      ON t.user_id = v_uid
     AND t.account_id = v_account
     AND t.is_duplicate = false
     AND t.statement_id <> p_statement_id
     AND t.date = k.d
     AND t.type = k.typ
     AND abs(t.amount) = abs(k.amount)
     AND (
       (nullif(btrim(k.j ->> 'reference'), '') IS NOT NULL
         AND lower(btrim(t.reference)) = lower(btrim(k.j ->> 'reference')))
       OR (
         length(public.normalize_transaction_description(k.descr)) >= 6
         AND length(public.normalize_transaction_description(t.description)) >= 6
         AND (
           public.normalize_transaction_description(t.description)
             LIKE '%' || public.normalize_transaction_description(k.descr) || '%'
           OR public.normalize_transaction_description(k.descr)
             LIKE '%' || public.normalize_transaction_description(t.description) || '%'
         )
       )
     )
    WHERE NOT EXISTS (SELECT 1 FROM by_key WHERE by_key.ord = k.ord)
      AND NOT EXISTS (SELECT 1 FROM by_balance WHERE by_balance.ord = k.ord)
    ORDER BY k.ord, t.created_at, t.id
  ),
  decided AS (
    SELECT
      k.*,
      CASE
        WHEN bk.statement_id = p_statement_id THEN 'already_present'
        WHEN bk.id IS NOT NULL OR bb.id IS NOT NULL THEN 'overlap_duplicate'
        WHEN bs.id IS NOT NULL THEN 'possible_duplicate'
        ELSE 'unique'
      END AS verdict,
      coalesce(bk.id, bb.id) AS canonical_id,
      CASE
        WHEN bk.id IS NOT NULL THEN
          jsonb_build_object('matched_on', 'dedupe_key', 'canonical_id', bk.id)
        WHEN bb.id IS NOT NULL THEN
          jsonb_build_object('matched_on', 'running_balance', 'canonical_id', bb.id)
        WHEN bs.id IS NOT NULL THEN
          jsonb_build_object(
            'matched_on', bs.reason,
            'candidate_id', bs.id,
            'note', 'Same account, date, direction and amount in another statement; not enough evidence to merge.'
          )
      END AS evidence
    FROM keyed AS k
    LEFT JOIN by_key AS bk ON bk.ord = k.ord
    LEFT JOIN by_balance AS bb ON bb.ord = k.ord
    LEFT JOIN by_similarity AS bs ON bs.ord = k.ord
  ),
  inserted AS (
    INSERT INTO public.transactions (
      id, user_id, account_id, statement_id, date, transaction_time, description,
      original_description, amount, original_signed_amount, type, balance, currency,
      source, dedupe_key, is_duplicate, duplicate_of, dedupe_status, dedupe_evidence,
      category_id, category_source, category_confidence, category_rule, categorized_at,
      transaction_class, classification_confidence, classification_reason, classification_source,
      merchant_name, reference, extraction_method, original_date_text, date_confidence,
      date_warnings, booking_date, value_date, source_row, extraction_warnings,
      bank_key, account_fingerprint
    )
    SELECT
      r.new_id, v_uid, v_account, p_statement_id, r.d, r.tm, r.descr,
      r.descr, r.amount, r.amount, r.typ, r.balance, r.currency,
      'statement',
      r.dedupe_key,
      r.verdict = 'overlap_duplicate',
      CASE WHEN r.verdict = 'overlap_duplicate' THEN r.canonical_id END,
      r.verdict,
      r.evidence,
      nullif(r.j ->> 'category_id', '')::uuid,
      'automatic',
      coalesce((r.j ->> 'category_confidence')::numeric, 0),
      nullif(r.j ->> 'category_rule', ''),
      CASE WHEN nullif(r.j ->> 'category_id', '') IS NOT NULL THEN now() END,
      coalesce(nullif(r.j ->> 'transaction_class', ''), 'unknown'),
      coalesce((r.j ->> 'classification_confidence')::numeric, 0),
      nullif(r.j ->> 'classification_reason', ''),
      nullif(r.j ->> 'classification_source', ''),
      nullif(r.j ->> 'merchant_name', ''),
      nullif(r.j ->> 'reference', ''),
      nullif(r.j ->> 'extraction_method', ''),
      nullif(r.j ->> 'date_text', ''),
      nullif(r.j ->> 'date_confidence', ''),
      coalesce(ARRAY(SELECT jsonb_array_elements_text(r.j -> 'date_warnings')), '{}'),
      nullif(r.j ->> 'booking_date', '')::date,
      nullif(r.j ->> 'value_date', '')::date,
      nullif(r.j ->> 'source_row', '')::integer,
      coalesce(ARRAY(SELECT jsonb_array_elements_text(r.j -> 'warnings')), '{}'),
      v_bank_key, v_fingerprint
    FROM decided AS r
    WHERE r.verdict <> 'already_present'
    ORDER BY r.ord
    RETURNING id
  )
  SELECT
    (SELECT count(*) FROM inserted),
    count(*) FILTER (WHERE verdict = 'overlap_duplicate'),
    count(*) FILTER (WHERE verdict = 'possible_duplicate'),
    count(*) FILTER (WHERE verdict = 'already_present'),
    count(*)
  INTO v_inserted, v_overlap, v_possible, v_already, v_total
  FROM decided;

  SELECT count(*) INTO v_canonical
  FROM public.transactions
  WHERE statement_id = p_statement_id AND user_id = v_uid AND is_duplicate = false;

  UPDATE public.statement_imports
  SET
    status = 'processed',
    error_message = NULL,
    processed_at = now(),
    transaction_count = v_canonical,
    extraction_method = coalesce(nullif(p_statement ->> 'extraction_method', ''), extraction_method),
    statement_start_date = nullif(p_statement ->> 'statement_start_date', '')::date,
    statement_end_date = nullif(p_statement ->> 'statement_end_date', '')::date,
    period_source = nullif(p_statement ->> 'period_source', ''),
    opening_balance = nullif(p_statement ->> 'opening_balance', '')::numeric,
    closing_balance = nullif(p_statement ->> 'closing_balance', '')::numeric,
    extracted_bank = nullif(p_statement ->> 'extracted_bank', ''),
    extracted_last4 = nullif(p_statement ->> 'extracted_last4', ''),
    balance_as_of = nullif(p_statement ->> 'balance_as_of', '')::date,
    balance_source = nullif(p_statement ->> 'balance_source', ''),
    balance_reconciliation = nullif(p_statement ->> 'balance_reconciliation', ''),
    opening_closing_reconciliation = nullif(p_statement ->> 'opening_closing_reconciliation', ''),
    reconciliation_difference = nullif(p_statement ->> 'reconciliation_difference', '')::numeric,
    extraction_confidence = nullif(p_statement ->> 'extraction_confidence', '')::numeric,
    rows_detected = nullif(p_statement ->> 'rows_detected', '')::integer,
    rows_rejected = nullif(p_statement ->> 'rows_rejected', '')::integer,
    extraction_warnings = coalesce(ARRAY(SELECT jsonb_array_elements_text(p_statement -> 'warnings')), '{}')
  WHERE id = p_statement_id AND user_id = v_uid;

  RETURN jsonb_build_object(
    'statement_id', p_statement_id,
    'rows_received', v_total,
    'inserted', v_inserted,
    'overlap_duplicates', v_overlap,
    'possible_duplicates', v_possible,
    'already_present', v_already,
    'canonical_transactions', v_canonical
  );
END;
$$;

REVOKE ALL ON FUNCTION public.import_statement_transactions(uuid, jsonb, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_statement_transactions(uuid, jsonb, jsonb, boolean) TO authenticated;
