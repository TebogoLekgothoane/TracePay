alter table public.transactions
  add column if not exists category_id uuid references public.categories(id) on delete set null,
  add column if not exists category_source text not null default 'automatic',
  add column if not exists category_confidence numeric(3, 2),
  add column if not exists category_rule text,
  add column if not exists categorized_at timestamptz;

alter table public.transactions
  drop constraint if exists transactions_category_source_check;

alter table public.transactions
  add constraint transactions_category_source_check
  check (category_source in ('automatic', 'manual'));

alter table public.transactions
  drop constraint if exists transactions_category_confidence_check;

alter table public.transactions
  add constraint transactions_category_confidence_check
  check (category_confidence is null or (category_confidence >= 0 and category_confidence <= 1));

create index if not exists transactions_category_id_idx on public.transactions(category_id);
create index if not exists transactions_category_source_idx on public.transactions(category_source);
