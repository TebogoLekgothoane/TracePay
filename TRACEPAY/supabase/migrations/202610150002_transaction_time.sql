-- Preserve a source transaction time when the statement provides one.
-- Existing rows remain explicitly time-unknown; no time is inferred from imports.
alter table public.transactions
  add column if not exists transaction_time time without time zone;
