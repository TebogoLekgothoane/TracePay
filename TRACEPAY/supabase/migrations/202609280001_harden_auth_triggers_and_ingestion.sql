-- Trigger functions must not be callable over the Data API.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Latest statement balance per account. SECURITY INVOKER so RLS still applies.
CREATE OR REPLACE FUNCTION public.latest_account_balances(account_ids uuid[])
RETURNS TABLE(account_id uuid, balance numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT DISTINCT ON (si.account_id)
    si.account_id,
    t.balance
  FROM public.statement_imports AS si
  JOIN public.transactions AS t ON t.statement_id = si.id
  WHERE si.account_id = ANY(account_ids)
    AND si.status = 'processed'
    AND t.balance IS NOT NULL
  ORDER BY si.account_id, t.date DESC, t.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.latest_account_balances(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.latest_account_balances(uuid[]) TO authenticated;

-- Device SMS/notification ingestion is written only by the Node service role.
CREATE TABLE IF NOT EXISTS public.ingestion_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id text NOT NULL CHECK (char_length(client_id) BETWEEN 1 AND 128),
  source text NOT NULL CHECK (source IN ('sms', 'notification')),
  received_at timestamptz NOT NULL,
  sender text,
  app_identifier text,
  title text,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source, client_id)
);

CREATE TABLE IF NOT EXISTS public.parsed_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id text NOT NULL CHECK (char_length(client_id) BETWEEN 1 AND 128),
  bank text NOT NULL,
  type text NOT NULL CHECK (type IN ('debit', 'credit', 'reversal', 'unknown')),
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'ZAR' CHECK (char_length(currency) = 3),
  merchant text,
  summary text,
  category text NOT NULL CHECK (category IN ('groceries','fuel','dining','entertainment','utilities','transfer','atm','online','medical','other')),
  occurred_at timestamptz NOT NULL,
  parsed_at timestamptz NOT NULL,
  confidence text NOT NULL CHECK (confidence IN ('high','medium','low')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL CHECK (source IN ('sms_parse','notification_parse')),
  transaction_id text NOT NULL,
  merchant_key text,
  normalisation_version integer NOT NULL DEFAULT 1,
  normalised_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source, client_id)
);

CREATE INDEX IF NOT EXISTS ingestion_readings_user_id_idx
  ON public.ingestion_readings (user_id, received_at DESC);

CREATE INDEX IF NOT EXISTS parsed_transactions_user_id_idx
  ON public.parsed_transactions (user_id, occurred_at DESC);

DROP TRIGGER IF EXISTS ingestion_readings_updated_at ON public.ingestion_readings;
CREATE TRIGGER ingestion_readings_updated_at
  BEFORE UPDATE ON public.ingestion_readings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.ingestion_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parsed_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestion_readings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.parsed_transactions FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ingestion_readings FROM anon, authenticated;
REVOKE ALL ON TABLE public.parsed_transactions FROM anon, authenticated;
GRANT ALL ON TABLE public.ingestion_readings TO service_role;
GRANT ALL ON TABLE public.parsed_transactions TO service_role;
