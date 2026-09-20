alter table public.transactions
  add column if not exists transaction_class text,
  add column if not exists classification_confidence numeric,
  add column if not exists classification_reason text;

alter table public.transactions
  drop constraint if exists transactions_transaction_class_check;

alter table public.transactions
  add constraint transactions_transaction_class_check
  check (transaction_class is null or transaction_class in (
    'spending', 'income', 'internal_transfer', 'person_to_person',
    'savings', 'investment', 'bank_fee', 'unknown'
  ));

alter table public.transactions
  drop constraint if exists transactions_classification_confidence_check;

alter table public.transactions
  add constraint transactions_classification_confidence_check
  check (classification_confidence is null or (classification_confidence >= 0 and classification_confidence <= 1));

create index if not exists transactions_transaction_class_idx on public.transactions(transaction_class);
