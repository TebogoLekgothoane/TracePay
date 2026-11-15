-- Shared merchant profiles: payee name -> kind of business, identified once by the optional AI
-- step and reused for every user (categoriser and leak analysis). Holds no user data (no amounts,
-- dates, user ids or transaction ids) and never people. Written and read only by the backend with
-- the service role.
create table if not exists public.merchant_profiles (
  pattern_key text primary key
    check (char_length(pattern_key) between 3 and 80),
  business_type text not null check (business_type in (
    'trading_broker', 'crypto_exchange', 'gambling', 'loan_provider', 'insurance',
    'subscription_service', 'retailer', 'food_and_drink', 'telecom_or_utility', 'transport',
    'bank_or_fintech', 'education', 'other_business'
  )),
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  source text not null default 'ai',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.merchant_profiles enable row level security;
revoke all on table public.merchant_profiles from public, anon, authenticated;
