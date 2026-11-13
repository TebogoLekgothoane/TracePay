-- Multi-statement, multi-account consolidation.
--
-- Safe on an existing project: every change is additive (ADD COLUMN IF NOT
-- EXISTS, CREATE ... IF NOT EXISTS, CREATE OR REPLACE) except two deliberate
-- behaviour changes, both explained where they happen:
--   1. The one-statement-per-bank unique slot is removed. A user must be able to
--      upload many statements per bank and per account.
--   2. link_internal_transfers() no longer pairs transactions on amount alone.
--      Transfer pairing is decided by the backend matcher from documented
--      evidence and persisted through apply_transfer_links().
-- Existing rows keep their data; new provenance columns are NULL ("unknown")
-- for rows imported before this migration rather than being guessed.

------------------------------------------------------------------------------
-- 1. Columns the application already writes but earlier migrations never
--    declared (schema drift). IF NOT EXISTS makes this a no-op where they exist.
------------------------------------------------------------------------------

ALTER TABLE public.statement_imports
  ADD COLUMN IF NOT EXISTS statement_start_date date,
  ADD COLUMN IF NOT EXISTS statement_end_date date,
  ADD COLUMN IF NOT EXISTS opening_balance numeric(14, 2),
  ADD COLUMN IF NOT EXISTS closing_balance numeric(14, 2),
  ADD COLUMN IF NOT EXISTS extracted_bank text,
  ADD COLUMN IF NOT EXISTS extracted_last4 text,
  ADD COLUMN IF NOT EXISTS balance_as_of date,
  ADD COLUMN IF NOT EXISTS balance_source text,
  ADD COLUMN IF NOT EXISTS balance_reconciliation text,
  ADD COLUMN IF NOT EXISTS extraction_confidence numeric,
  ADD COLUMN IF NOT EXISTS rows_detected integer,
  ADD COLUMN IF NOT EXISTS rows_rejected integer;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS merchant_name text,
  ADD COLUMN IF NOT EXISTS reference text,
  ADD COLUMN IF NOT EXISTS extraction_method text;

------------------------------------------------------------------------------
-- 2. Statement coverage provenance.
------------------------------------------------------------------------------

ALTER TABLE public.statement_imports
  ADD COLUMN IF NOT EXISTS period_source text,
  ADD COLUMN IF NOT EXISTS opening_closing_reconciliation text,
  ADD COLUMN IF NOT EXISTS reconciliation_difference numeric(14, 2),
  ADD COLUMN IF NOT EXISTS extraction_warnings text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.statement_imports
  DROP CONSTRAINT IF EXISTS statement_imports_period_source_check;
ALTER TABLE public.statement_imports
  ADD CONSTRAINT statement_imports_period_source_check
  CHECK (period_source IS NULL OR period_source IN ('declared', 'inferred', 'unknown'));

ALTER TABLE public.statement_imports
  DROP CONSTRAINT IF EXISTS statement_imports_opening_closing_check;
ALTER TABLE public.statement_imports
  ADD CONSTRAINT statement_imports_opening_closing_check
  CHECK (
    opening_closing_reconciliation IS NULL
    OR opening_closing_reconciliation IN ('verified', 'not_available', 'mismatch')
  );

-- NOT VALID: enforced for new and updated rows without failing on history.
ALTER TABLE public.statement_imports
  DROP CONSTRAINT IF EXISTS statement_imports_period_order_check;
ALTER TABLE public.statement_imports
  ADD CONSTRAINT statement_imports_period_order_check
  CHECK (
    statement_start_date IS NULL
    OR statement_end_date IS NULL
    OR statement_start_date <= statement_end_date
  ) NOT VALID;

CREATE INDEX IF NOT EXISTS statement_imports_user_account_period_idx
  ON public.statement_imports (user_id, account_id, statement_start_date, statement_end_date)
  WHERE status = 'processed';

------------------------------------------------------------------------------
-- 3. Account identity: a normalised bank key and a fingerprint that never holds
--    more than the last four digits.
------------------------------------------------------------------------------

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS bank_key text,
  ADD COLUMN IF NOT EXISTS account_fingerprint text;

CREATE OR REPLACE FUNCTION public.accounts_identity_sync()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.bank_key := public.normalize_statement_bank_key(NEW.institution);
  NEW.account_fingerprint := CASE
    WHEN NEW.bank_key IS NOT NULL AND NEW.last_four_digits IS NOT NULL
      THEN md5(NEW.bank_key || '|' || NEW.last_four_digits)
    ELSE NULL
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS accounts_identity_sync ON public.accounts;
CREATE TRIGGER accounts_identity_sync
  BEFORE INSERT OR UPDATE OF institution, last_four_digits ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.accounts_identity_sync();

UPDATE public.accounts
SET
  bank_key = public.normalize_statement_bank_key(institution),
  account_fingerprint = CASE
    WHEN public.normalize_statement_bank_key(institution) IS NOT NULL
      AND last_four_digits IS NOT NULL
    THEN md5(public.normalize_statement_bank_key(institution) || '|' || last_four_digits)
  END
WHERE bank_key IS NULL OR account_fingerprint IS NULL;

CREATE INDEX IF NOT EXISTS accounts_user_fingerprint_idx
  ON public.accounts (user_id, account_fingerprint)
  WHERE account_fingerprint IS NOT NULL;

------------------------------------------------------------------------------
-- 4. Canonical transaction provenance. Nothing here overwrites a source value:
--    description, date and amount keep their original columns, and the new
--    columns record how they were read.
------------------------------------------------------------------------------

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS original_description text,
  ADD COLUMN IF NOT EXISTS original_date_text text,
  ADD COLUMN IF NOT EXISTS original_signed_amount numeric(14, 2),
  ADD COLUMN IF NOT EXISTS date_confidence text,
  ADD COLUMN IF NOT EXISTS date_warnings text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS booking_date date,
  ADD COLUMN IF NOT EXISTS value_date date,
  ADD COLUMN IF NOT EXISTS source_row integer,
  ADD COLUMN IF NOT EXISTS extraction_warnings text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS bank_key text,
  ADD COLUMN IF NOT EXISTS account_fingerprint text,
  ADD COLUMN IF NOT EXISTS classification_source text,
  ADD COLUMN IF NOT EXISTS dedupe_status text NOT NULL DEFAULT 'unique',
  ADD COLUMN IF NOT EXISTS dedupe_evidence jsonb,
  ADD COLUMN IF NOT EXISTS transfer_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS transfer_confidence numeric,
  ADD COLUMN IF NOT EXISTS transfer_evidence jsonb,
  ADD COLUMN IF NOT EXISTS transfer_fee_for uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversal_of uuid REFERENCES public.transactions(id) ON DELETE SET NULL;

-- Historical rows: preserve what is known, leave the rest unknown (NULL).
UPDATE public.transactions
SET original_description = description
WHERE original_description IS NULL;

UPDATE public.transactions AS t
SET
  bank_key = a.bank_key,
  account_fingerprint = a.account_fingerprint
FROM public.accounts AS a
WHERE t.account_id = a.id
  AND t.bank_key IS NULL;

UPDATE public.transactions
SET dedupe_status = 'overlap_duplicate'
WHERE is_duplicate AND dedupe_status = 'unique';

-- Pairs the old amount-only matcher created have no recorded evidence. They
-- are marked candidates so the evidence-based matcher re-decides each one.
UPDATE public.transactions
SET transfer_status = 'candidate'
WHERE transfer_pair_id IS NOT NULL AND transfer_status = 'none';

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_source_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_source_check
  CHECK (source IN ('pdf', 'csv', 'open_banking', 'manual', 'statement'));

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_date_confidence_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_date_confidence_check
  CHECK (date_confidence IS NULL OR date_confidence IN ('high', 'medium', 'low'));

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_dedupe_status_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_dedupe_status_check
  CHECK (dedupe_status IN ('unique', 'overlap_duplicate', 'possible_duplicate'));

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_transfer_status_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_transfer_status_check
  CHECK (transfer_status IN ('none', 'candidate', 'confirmed'));

-- A confirmed transfer is always one half of a recorded pair.
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_confirmed_transfer_pair_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_confirmed_transfer_pair_check
  CHECK (transfer_status <> 'confirmed' OR transfer_pair_id IS NOT NULL) NOT VALID;

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_transfer_confidence_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_transfer_confidence_check
  CHECK (transfer_confidence IS NULL OR (transfer_confidence >= 0 AND transfer_confidence <= 1));

-- Lookup indexes: consolidated timeline, per-account windows, overlap checks,
-- transfer candidates, merchant analysis and statement scans.
CREATE INDEX IF NOT EXISTS transactions_user_date_idx
  ON public.transactions (user_id, date DESC, id)
  WHERE is_duplicate = false;

CREATE INDEX IF NOT EXISTS transactions_user_account_date_idx
  ON public.transactions (user_id, account_id, date)
  WHERE is_duplicate = false;

CREATE INDEX IF NOT EXISTS transactions_overlap_lookup_idx
  ON public.transactions (user_id, account_id, date, type, amount)
  WHERE is_duplicate = false;

CREATE INDEX IF NOT EXISTS transactions_transfer_candidates_idx
  ON public.transactions (user_id, date, type, amount)
  WHERE is_duplicate = false AND transfer_status <> 'confirmed';

CREATE INDEX IF NOT EXISTS transactions_user_merchant_idx
  ON public.transactions (user_id, merchant_name)
  WHERE is_duplicate = false AND merchant_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS transactions_transfer_pair_idx
  ON public.transactions (transfer_pair_id)
  WHERE transfer_pair_id IS NOT NULL;

------------------------------------------------------------------------------
-- 5. Ownership integrity. RLS already checks that a transaction's user owns its
--    statement; this also guarantees the account belongs to that user and
--    matches the statement's account, whichever role performs the write.
------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.transactions_ownership_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_statement_user uuid;
  v_statement_account uuid;
  v_account_user uuid;
BEGIN
  SELECT user_id, account_id
    INTO v_statement_user, v_statement_account
  FROM public.statement_imports
  WHERE id = NEW.statement_id;

  IF v_statement_user IS NULL OR v_statement_user <> NEW.user_id THEN
    RAISE EXCEPTION 'transaction statement does not belong to the transaction user'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.account_id IS NOT NULL THEN
    SELECT user_id INTO v_account_user FROM public.accounts WHERE id = NEW.account_id;
    IF v_account_user IS NULL OR v_account_user <> NEW.user_id THEN
      RAISE EXCEPTION 'transaction account does not belong to the transaction user'
        USING ERRCODE = '42501';
    END IF;
    IF v_statement_account IS NOT NULL AND v_statement_account <> NEW.account_id THEN
      RAISE EXCEPTION 'transaction account does not match its statement account'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transactions_ownership_guard ON public.transactions;
CREATE TRIGGER transactions_ownership_guard
  BEFORE INSERT OR UPDATE OF user_id, account_id, statement_id ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.transactions_ownership_guard();

------------------------------------------------------------------------------
-- 6. Many statements per bank and per account.
--    The unique "bank slot" index allowed a single active statement per bank.
--    Duplicate protection now rests on (user, content_hash) for processed files
--    and on transaction-level deduplication.
------------------------------------------------------------------------------

DROP INDEX IF EXISTS public.statement_imports_user_bank_slot_active_key;

-- Old behaviour failed every other in-flight import for the bank, which would
-- kill a parallel multi-file upload. Kept as a no-op so older app builds that
-- still call it keep working.
CREATE OR REPLACE FUNCTION public.release_stale_statement_bank_slots(
  p_bank_key text,
  p_keep_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$ SELECT 0; $$;

-- Releases only abandoned attempts for one account (older than the interval).
CREATE OR REPLACE FUNCTION public.release_stale_statement_attempts(
  p_account_id uuid,
  p_keep_id uuid DEFAULT NULL,
  p_older_than interval DEFAULT interval '30 minutes'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  updated_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  UPDATE public.statement_imports
  SET
    status = 'failed',
    error_message = 'Abandoned import attempt.',
    bank_slot_active = false
  WHERE user_id = auth.uid()
    AND account_id = p_account_id
    AND status IN ('uploaded', 'processing')
    AND created_at < now() - p_older_than
    AND (p_keep_id IS NULL OR id <> p_keep_id);

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

REVOKE ALL ON FUNCTION public.release_stale_statement_attempts(uuid, uuid, interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_stale_statement_attempts(uuid, uuid, interval) TO authenticated;

------------------------------------------------------------------------------
-- 7. Transactional, idempotent, concurrency-safe statement import.
------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.normalize_transaction_description(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT btrim(regexp_replace(regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', ' ', 'g'), '\s+', ' ', 'g'));
$$;

-- Imports one statement's extracted rows and finalises the statement in a
-- single transaction.
--
--   * Serialised per (user, account) with an advisory lock, so two concurrent
--     uploads cannot both decide a row is new.
--   * Dedupe keys are built here, not trusted from the client. Identical rows
--     inside one statement are told apart by occurrence (#n), so two genuine
--     payments with the same merchant, amount and day are both kept, while the
--     same rows arriving again from an overlapping statement match one by one.
--   * A row already present from the SAME statement is skipped, which makes
--     re-running an import a no-op rather than a second copy.
--   * Same account + date + type + amount + running balance means the same
--     ledger position even when the description text differs between
--     statements; that is a definite overlap duplicate. A shared reference or a
--     contained description without a matching balance is only a
--     possible_duplicate: the row is kept and flagged, never deleted.
--   * If marking the statement processed fails (for example the same file was
--     already imported by a concurrent request) the inserted rows roll back.
--
-- p_replace = true deletes this statement's previous rows first (re-extraction)
-- and re-promotes any overlapping duplicate that depended on them.
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
      CASE WHEN v_format = 'csv' THEN 'csv' ELSE 'pdf' END,
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

------------------------------------------------------------------------------
-- 8. Evidence-based internal transfers.
--
-- The previous link_internal_transfers() paired any debit and credit of equal
-- amount within three days on different accounts. That treats a coincidence
-- (rent R5,000 out of one account, an unrelated R5,000 payment into another)
-- as the user's own money moving, and drops both from spending and income.
-- Matching is now done by the backend from documented evidence and persisted
-- here. The database validates every invariant a pair must satisfy.
------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.link_internal_transfers()
RETURNS integer
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$ SELECT 0; $$;

COMMENT ON FUNCTION public.link_internal_transfers() IS
  'Deprecated no-op. Transfer pairing needs evidence; use apply_transfer_links() via the backend reconcile endpoint.';

-- p_links: [{debit_id, credit_id, confidence, evidence, fee_ids?: []}]
-- p_candidates: [{ids: [uuid, uuid], confidence, evidence}] preserved, unconfirmed.
-- p_unlink: transaction ids whose earlier transfer decision is withdrawn.
-- p_reversals: [{reversal_id, original_id}]
CREATE OR REPLACE FUNCTION public.apply_transfer_links(
  p_links jsonb DEFAULT '[]'::jsonb,
  p_candidates jsonb DEFAULT '[]'::jsonb,
  p_unlink uuid[] DEFAULT '{}',
  p_reversals jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_link jsonb;
  v_cand jsonb;
  v_rev jsonb;
  v_debit public.transactions%ROWTYPE;
  v_credit public.transactions%ROWTYPE;
  v_pair uuid;
  v_linked integer := 0;
  v_candidates integer := 0;
  v_unlinked integer := 0;
  v_reversed integer := 0;
  v_fee text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text || ':transfers', 0));

  -- Withdraw earlier decisions. Rows the classifier itself called transfers
  -- (rule-based) keep their class; only pair-derived state is cleared.
  WITH cleared AS (
    UPDATE public.transactions AS t
    SET
      transfer_pair_id = NULL,
      transfer_status = 'none',
      transfer_confidence = NULL,
      transfer_evidence = NULL,
      -- Demote only classes this pairing created: a confirmed match, or a
      -- legacy amount-only pair that never had evidence. A class the
      -- classifier itself assigned from the description is left alone.
      transaction_class = CASE
        WHEN t.classification_source = 'transfer_match'
          OR (t.transfer_pair_id IS NOT NULL
              AND t.transfer_status = 'candidate'
              AND t.transfer_evidence IS NULL
              AND t.transaction_class = 'internal_transfer')
          THEN 'unknown'
        ELSE t.transaction_class
      END,
      classification_source = CASE
        WHEN t.classification_source = 'transfer_match' THEN NULL ELSE t.classification_source
      END
    WHERE t.user_id = v_uid AND t.id = ANY(p_unlink)
    RETURNING t.id
  )
  SELECT count(*) INTO v_unlinked FROM cleared;

  FOR v_link IN SELECT * FROM jsonb_array_elements(p_links)
  LOOP
    SELECT * INTO v_debit FROM public.transactions
      WHERE id = (v_link ->> 'debit_id')::uuid AND user_id = v_uid FOR UPDATE;
    SELECT * INTO v_credit FROM public.transactions
      WHERE id = (v_link ->> 'credit_id')::uuid AND user_id = v_uid FOR UPDATE;

    IF v_debit.id IS NULL OR v_credit.id IS NULL THEN
      RAISE EXCEPTION 'transfer link references a transaction that is not yours'
        USING ERRCODE = '42501';
    END IF;
    IF v_debit.type <> 'debit' OR v_credit.type <> 'credit' THEN
      RAISE EXCEPTION 'a transfer pairs one debit with one credit' USING ERRCODE = '23514';
    END IF;
    IF v_debit.account_id IS NULL OR v_credit.account_id IS NULL
       OR v_debit.account_id = v_credit.account_id THEN
      RAISE EXCEPTION 'a transfer pairs transactions on two different accounts'
        USING ERRCODE = '23514';
    END IF;
    IF abs(v_debit.amount) <> abs(v_credit.amount)
       OR coalesce(v_debit.currency, 'ZAR') <> coalesce(v_credit.currency, 'ZAR') THEN
      RAISE EXCEPTION 'a transfer pairs equal amounts in one currency' USING ERRCODE = '23514';
    END IF;
    IF v_debit.is_duplicate OR v_credit.is_duplicate THEN
      RAISE EXCEPTION 'overlap duplicates cannot be paired' USING ERRCODE = '23514';
    END IF;
    IF (v_debit.transfer_status = 'confirmed' AND v_debit.transfer_pair_id IS NOT NULL
          AND v_debit.transfer_pair_id <> md5(least(v_debit.id::text, v_credit.id::text)
                                              || greatest(v_debit.id::text, v_credit.id::text))::uuid)
       OR (v_credit.transfer_status = 'confirmed' AND v_credit.transfer_pair_id IS NOT NULL
          AND v_credit.transfer_pair_id <> md5(least(v_debit.id::text, v_credit.id::text)
                                               || greatest(v_debit.id::text, v_credit.id::text))::uuid) THEN
      RAISE EXCEPTION 'a transaction already belongs to a different confirmed transfer'
        USING ERRCODE = '23505';
    END IF;

    -- Deterministic id: applying the same decision twice changes nothing.
    v_pair := md5(least(v_debit.id::text, v_credit.id::text)
                  || greatest(v_debit.id::text, v_credit.id::text))::uuid;

    UPDATE public.transactions
    SET
      transfer_pair_id = v_pair,
      transfer_status = 'confirmed',
      transfer_confidence = (v_link ->> 'confidence')::numeric,
      transfer_evidence = v_link -> 'evidence',
      transaction_class = 'internal_transfer',
      classification_source = coalesce(classification_source, 'transfer_match')
    WHERE id IN (v_debit.id, v_credit.id) AND user_id = v_uid;

    IF jsonb_typeof(v_link -> 'fee_ids') = 'array' THEN
      FOR v_fee IN SELECT jsonb_array_elements_text(v_link -> 'fee_ids')
      LOOP
        UPDATE public.transactions
        SET transfer_fee_for = v_debit.id
        WHERE id = v_fee::uuid AND user_id = v_uid AND is_duplicate = false;
      END LOOP;
    END IF;

    v_linked := v_linked + 1;
  END LOOP;

  FOR v_cand IN SELECT * FROM jsonb_array_elements(p_candidates)
  LOOP
    UPDATE public.transactions
    SET
      transfer_status = 'candidate',
      transfer_confidence = (v_cand ->> 'confidence')::numeric,
      transfer_evidence = v_cand -> 'evidence'
    WHERE user_id = v_uid
      AND transfer_status <> 'confirmed'
      AND id IN (SELECT (jsonb_array_elements_text(v_cand -> 'ids'))::uuid);
    v_candidates := v_candidates + 1;
  END LOOP;

  FOR v_rev IN SELECT * FROM jsonb_array_elements(p_reversals)
  LOOP
    UPDATE public.transactions AS r
    SET reversal_of = (v_rev ->> 'original_id')::uuid
    WHERE r.id = (v_rev ->> 'reversal_id')::uuid
      AND r.user_id = v_uid
      AND r.type = 'credit'
      AND EXISTS (
        SELECT 1 FROM public.transactions AS o
        WHERE o.id = (v_rev ->> 'original_id')::uuid
          AND o.user_id = v_uid
          AND o.type = 'debit'
          AND o.date <= r.date
      );
    v_reversed := v_reversed + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'linked_pairs', v_linked,
    'candidates', v_candidates,
    'unlinked', v_unlinked,
    'reversals', v_reversed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_transfer_links(jsonb, jsonb, uuid[], jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_transfer_links(jsonb, jsonb, uuid[], jsonb) TO authenticated;

------------------------------------------------------------------------------
-- 9. Consolidated totals. Same keys as before plus the figures needed to avoid
--    counting refunds as income or unconfirmed transfers as settled.
------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.financial_overview(p_account_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      t.*,
      (
        t.type = 'credit'
        AND (
          t.reversal_of IS NOT NULL
          OR coalesce(t.category_rule = 'description:purchase-reversal', false)
          OR t.description ~* '(refund|reversal|reversed|cancelled|canceled|correction)'
        )
        AND COALESCE(t.transaction_class, 'unknown') <> 'internal_transfer'
      ) AS is_refund
    FROM public.transactions AS t
    WHERE t.user_id = auth.uid()
      AND NOT t.is_duplicate
      AND (p_account_id IS NULL OR t.account_id = p_account_id)
  )
  SELECT jsonb_build_object(
    'money_in',
      COALESCE(SUM(CASE
        WHEN type = 'credit' AND NOT is_refund
          AND COALESCE(transaction_class, 'unknown') <> 'internal_transfer'
        THEN ABS(amount) END), 0),
    'money_out',
      COALESCE(SUM(CASE
        WHEN type = 'debit'
          AND COALESCE(transaction_class, 'unknown') <> 'internal_transfer'
        THEN ABS(amount) END), 0),
    'refunds',
      COALESCE(SUM(CASE WHEN is_refund THEN ABS(amount) END), 0),
    'net_money_out',
      COALESCE(SUM(CASE
        WHEN type = 'debit' AND COALESCE(transaction_class, 'unknown') <> 'internal_transfer'
        THEN ABS(amount)
        WHEN is_refund THEN -ABS(amount) END), 0),
    'transfer_volume',
      COALESCE(SUM(CASE
        WHEN type = 'debit' AND COALESCE(transaction_class, 'unknown') = 'internal_transfer'
        THEN ABS(amount) END), 0),
    'unconfirmed_transfer_volume',
      COALESCE(SUM(CASE
        WHEN type = 'debit' AND transfer_status = 'candidate'
          AND COALESCE(transaction_class, 'unknown') <> 'internal_transfer'
        THEN ABS(amount) END), 0),
    'leak_spend',
      COALESCE(SUM(CASE
        WHEN type = 'debit'
          AND COALESCE(transaction_class, 'unknown') IN ('spending', 'bank_fee', 'unknown')
        THEN ABS(amount) END), 0),
    'duplicate_count',
      (SELECT count(*) FROM public.transactions AS d
        WHERE d.user_id = auth.uid() AND d.is_duplicate
          AND (p_account_id IS NULL OR d.account_id = p_account_id)),
    'possible_duplicate_count',
      COALESCE(SUM(CASE WHEN dedupe_status = 'possible_duplicate' THEN 1 ELSE 0 END), 0),
    'transaction_count',
      COUNT(*)
  )
  FROM base;
$$;

REVOKE ALL ON FUNCTION public.financial_overview(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.financial_overview(uuid) TO authenticated;
