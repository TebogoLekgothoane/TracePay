-- Multi-account identity, canonical transactions, dedupe, and unified analytics.

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS last_four_digits text
    CHECK (last_four_digits IS NULL OR last_four_digits ~ '^\d{4}$');

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS connection_source text NOT NULL DEFAULT 'manual'
    CHECK (connection_source IN ('manual', 'statement_import', 'open_banking'));

ALTER TABLE public.statement_imports
  ADD COLUMN IF NOT EXISTS content_hash text;

ALTER TABLE public.statement_imports
  ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'pdf'
    CHECK (format IN ('pdf', 'csv'));

CREATE UNIQUE INDEX IF NOT EXISTS statement_imports_user_content_hash_processed_key
  ON public.statement_imports (user_id, content_hash)
  WHERE content_hash IS NOT NULL AND status = 'processed';

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS dedupe_key text;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS is_duplicate boolean NOT NULL DEFAULT false;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS duplicate_of uuid REFERENCES public.transactions(id) ON DELETE SET NULL;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS transfer_pair_id uuid;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS external_id text;

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_source_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_source_check
  CHECK (source IN ('pdf', 'csv', 'open_banking', 'manual'));

UPDATE public.transactions AS t
SET account_id = si.account_id
FROM public.statement_imports AS si
WHERE t.statement_id = si.id
  AND t.account_id IS NULL
  AND si.account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS transactions_account_id_date_idx
  ON public.transactions (account_id, date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS transactions_user_active_dedupe_idx
  ON public.transactions (user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL AND is_duplicate = false;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_user_canonical_dedupe_key
  ON public.transactions (user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL AND is_duplicate = false;

CREATE OR REPLACE FUNCTION public.account_statement_stats(p_account_ids uuid[])
RETURNS TABLE(
  account_id uuid,
  statement_count bigint,
  transaction_count bigint,
  latest_statement_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    a.id AS account_id,
    COUNT(DISTINCT si.id) FILTER (WHERE si.status = 'processed') AS statement_count,
    COUNT(t.id) FILTER (WHERE NOT t.is_duplicate) AS transaction_count,
    MAX(si.processed_at) FILTER (WHERE si.status = 'processed') AS latest_statement_at
  FROM public.accounts AS a
  LEFT JOIN public.statement_imports AS si ON si.account_id = a.id
  LEFT JOIN public.transactions AS t ON t.statement_id = si.id
  WHERE a.id = ANY(p_account_ids)
    AND a.user_id = auth.uid()
  GROUP BY a.id;
$$;

REVOKE ALL ON FUNCTION public.account_statement_stats(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.account_statement_stats(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.financial_overview(p_account_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'money_in',
      COALESCE(SUM(
        CASE
          WHEN t.type = 'credit'
            AND NOT t.is_duplicate
            AND COALESCE(t.transaction_class, 'unknown') NOT IN ('internal_transfer')
          THEN ABS(t.amount)
        END
      ), 0),
    'money_out',
      COALESCE(SUM(
        CASE
          WHEN t.type = 'debit'
            AND NOT t.is_duplicate
            AND COALESCE(t.transaction_class, 'unknown') NOT IN ('internal_transfer')
          THEN ABS(t.amount)
        END
      ), 0),
    'transfer_volume',
      COALESCE(SUM(
        CASE
          WHEN NOT t.is_duplicate
            AND COALESCE(t.transaction_class, 'unknown') = 'internal_transfer'
          THEN ABS(t.amount)
        END
      ), 0),
    'leak_spend',
      COALESCE(SUM(
        CASE
          WHEN t.type = 'debit'
            AND NOT t.is_duplicate
            AND COALESCE(t.transaction_class, 'unknown') IN ('spending', 'bank_fee', 'unknown')
          THEN ABS(t.amount)
        END
      ), 0),
    'duplicate_count',
      COALESCE(SUM(CASE WHEN t.is_duplicate THEN 1 ELSE 0 END), 0),
    'transaction_count',
      COALESCE(SUM(CASE WHEN NOT t.is_duplicate THEN 1 ELSE 0 END), 0)
  )
  FROM public.transactions AS t
  WHERE t.user_id = auth.uid()
    AND (p_account_id IS NULL OR t.account_id = p_account_id);
$$;

REVOKE ALL ON FUNCTION public.financial_overview(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.financial_overview(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.link_internal_transfers()
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  linked integer := 0;
BEGIN
  WITH pairs AS (
    SELECT
      d.id AS debit_id,
      c.id AS credit_id,
      gen_random_uuid() AS pair_id
    FROM public.transactions AS d
    INNER JOIN public.transactions AS c
      ON c.user_id = d.user_id
      AND c.account_id IS NOT NULL
      AND d.account_id IS NOT NULL
      AND c.account_id <> d.account_id
      AND c.type = 'credit'
      AND d.type = 'debit'
      AND ABS(c.amount) = ABS(d.amount)
      AND ABS(c.date - d.date) <= 3
    WHERE d.user_id = auth.uid()
      AND NOT d.is_duplicate
      AND NOT c.is_duplicate
      AND d.transfer_pair_id IS NULL
      AND c.transfer_pair_id IS NULL
  ),
  updated_debits AS (
    UPDATE public.transactions AS t
    SET
      transaction_class = 'internal_transfer',
      transfer_pair_id = pairs.pair_id
    FROM pairs
    WHERE t.id = pairs.debit_id
    RETURNING t.id
  ),
  updated_credits AS (
    UPDATE public.transactions AS t
    SET
      transaction_class = 'internal_transfer',
      transfer_pair_id = pairs.pair_id
    FROM pairs
    WHERE t.id = pairs.credit_id
    RETURNING t.id
  )
  SELECT COUNT(*) INTO linked FROM updated_debits;

  RETURN linked;
END;
$$;

REVOKE ALL ON FUNCTION public.link_internal_transfers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_internal_transfers() TO authenticated;
