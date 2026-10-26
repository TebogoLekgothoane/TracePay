-- Paid entitlements. Clients may read their own rows; only the backend (service role,
-- after verifying with the payment provider) may write them.

create table public.billing_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product text not null,
  analysis_key text not null default 'primary',
  reference text not null,
  status text not null default 'pending',
  amount_cents integer not null,
  currency text not null default 'ZAR',
  authorization_url text,
  provider_transaction_id text,
  failure_reason text,
  paid_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_purchases_reference_key unique (reference),
  constraint billing_purchases_product_check check (
    product in ('full_analysis', 'annual_monitoring')
  ),
  constraint billing_purchases_status_check check (
    status in ('pending', 'succeeded', 'failed', 'abandoned', 'refunded')
  ),
  constraint billing_purchases_amount_check check (amount_cents > 0),
  constraint billing_purchases_analysis_key_len check (
    char_length(analysis_key) between 1 and 80
  )
);

-- A user can have at most one open or paid purchase per product and analysis, which
-- makes checkout idempotent even under concurrent requests.
create unique index billing_purchases_one_live_per_analysis
  on public.billing_purchases (user_id, product, analysis_key)
  where status in ('pending', 'succeeded');

create index billing_purchases_user_idx
  on public.billing_purchases (user_id, created_at desc);

create table public.monitoring_subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  status text not null,
  provider_subscription_code text,
  provider_customer_code text,
  -- Needed to cancel at the provider. Never exposed to clients (see column grants).
  provider_email_token text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  last_payment_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monitoring_subscriptions_status_check check (
    status in ('pending', 'active', 'non_renewing', 'attention', 'cancelled', 'expired')
  )
);

-- Provider webhook deliveries already handled, so retries are no-ops.
create table public.billing_webhook_events (
  event_key text primary key,
  event_type text not null,
  received_at timestamptz not null default now()
);

alter table public.billing_purchases enable row level security;
alter table public.monitoring_subscriptions enable row level security;
alter table public.billing_webhook_events enable row level security;

revoke all on table public.billing_purchases from public, anon, authenticated;
revoke all on table public.monitoring_subscriptions from public, anon, authenticated;
revoke all on table public.billing_webhook_events from public, anon, authenticated;

grant select (
  id, user_id, product, analysis_key, reference, status, amount_cents, currency,
  paid_at, refunded_at, created_at
) on table public.billing_purchases to authenticated;

grant select (
  user_id, status, current_period_start, current_period_end, cancel_at_period_end,
  last_payment_status, created_at, updated_at
) on table public.monitoring_subscriptions to authenticated;

create policy "billing purchases select own"
  on public.billing_purchases
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "monitoring subscriptions select own"
  on public.monitoring_subscriptions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);
