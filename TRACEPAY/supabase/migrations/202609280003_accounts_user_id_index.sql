-- Align fresh environments with live: accounts lookups by owner.
CREATE INDEX IF NOT EXISTS idx_accounts_user_id
  ON public.accounts (user_id);
