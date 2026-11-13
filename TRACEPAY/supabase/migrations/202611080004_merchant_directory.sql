-- Shared merchant directory: statement description -> merchant and category, learned once by the
-- optional AI categoriser and reused for every user. Holds no user data (no amounts, dates, user
-- ids or transaction ids). Written and read only by the backend with the service role.
create table public.merchant_directory (
  pattern_key text primary key
    check (char_length(pattern_key) between 3 and 80),
  merchant_name text not null check (char_length(merchant_name) between 1 and 120),
  category_name text not null check (char_length(category_name) between 1 and 80),
  transaction_class text not null default 'spending' check (transaction_class = 'spending'),
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  source text not null default 'ai',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.merchant_directory enable row level security;
revoke all on table public.merchant_directory from public, anon, authenticated;
