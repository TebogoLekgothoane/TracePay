-- Figures a statement prints outside its transaction rows (interest rates, overdraft facility,
-- account-summary totals), kept per statement as read, never estimated. The statement report
-- uses them to check the rows against the bank's own totals and to state a rate or a limit
-- exactly as printed. Additive and safe on an existing project: the column is nullable, and
-- older statements simply have none.
ALTER TABLE public.statement_imports
  ADD COLUMN IF NOT EXISTS printed_figures jsonb;
