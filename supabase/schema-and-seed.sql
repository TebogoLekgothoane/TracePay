-- =============================================================================
-- TracePay – Supabase schema + seed (aligned with mobile app)
-- Copy-paste into Supabase SQL Editor and run once.
-- Idempotent: safe to run multiple times.
--
-- COEXISTENCE WITH AUTH SCHEMA
-- This script does NOT touch or conflict with:
--   - users.email, users.password_hash, users.role, users.is_active (auth columns)
--   - linked_accounts, transactions, analysis_results, frozen_items, regional_stats
-- Safe to run before or after the auth migration. Only inserts (id, username, full_name)
-- into users and never overwrites existing rows (ON CONFLICT DO NOTHING).
--
-- OPEN BANKING: Bank linking, transaction sync, and related flows are expected to
-- be provided by a separate Python backend API. This schema holds app state and
-- demo/seed data; open banking data may be synced from that API when available.
-- =============================================================================

-- Enable UUIDs (already enabled on Supabase, but safe)
create extension if not exists "pgcrypto";

-- =========================
-- ENUMS
-- =========================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'loss_severity') then
    create type loss_severity as enum ('critical', 'warning', 'info');
  end if;

  if not exists (select 1 from pg_type where typname = 'account_type') then
    create type account_type as enum ('salary', 'savings', 'highFee');
  end if;

  if not exists (select 1 from pg_type where typname = 'bank_type') then
    create type bank_type as enum ('bank', 'momo');
  end if;

  -- Freeze control: account type for “freeze specific accounts” (BANK_ACCOUNTS)
  if not exists (select 1 from pg_type where typname = 'bank_account_type') then
    create type bank_account_type as enum ('current', 'savings', 'wallet');
  end if;
end$$;

-- =========================
-- CORE USERS
-- (Auth columns email, password_hash, role, is_active are added by the auth
--  migration; this script only ensures the table and demo user exist.)
-- =========================
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  username text unique,
  full_name text,
  created_at timestamptz not null default now()
);

-- Insert demo user only if missing; never overwrite (preserves auth columns if set)
insert into users (id, username, full_name)
values ('00000000-0000-0000-0000-000000000001', 'demo_user', 'Demo User')
on conflict (id) do nothing;

-- =========================
-- USER SETTINGS (language, MoMo toggle, airtime limit)
-- =========================
create table if not exists user_settings (
  user_id uuid primary key references users(id) on delete cascade,
  language text not null default 'en',
  include_momo_data boolean not null default true,
  airtime_limit numeric(10,2) not null default 300,
  updated_at timestamptz not null default now()
);

-- Add airtime_limit if missing (for existing DBs)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_settings' and column_name = 'airtime_limit'
  ) then
    alter table user_settings add column airtime_limit numeric(10,2) not null default 300;
  end if;
end$$;

insert into user_settings (user_id, language, include_momo_data, airtime_limit)
values ('00000000-0000-0000-0000-000000000001', 'en', true, 300)
on conflict (user_id) do update
set language = excluded.language,
    include_momo_data = excluded.include_momo_data,
    airtime_limit = excluded.airtime_limit,
    updated_at = now();

-- =========================
-- ANALYSIS DATA
-- =========================
create table if not exists analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  total_loss numeric(12,2) not null,
  monthly_income numeric(12,2) not null,
  summary_en text,
  summary_xh text,
  momo_total_spent numeric(12,2),
  momo_alternative_cost numeric(12,2),
  momo_potential_savings numeric(12,2),
  momo_breakdown jsonb,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'analyses' and column_name = 'momo_breakdown'
  ) then
    alter table analyses add column momo_breakdown jsonb;
  end if;
end$$;

create table if not exists analysis_categories (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references analyses(id) on delete cascade,
  key text not null,
  name text not null,
  name_xhosa text,
  amount numeric(12,2) not null,
  percentage numeric(6,2) not null,
  severity loss_severity not null,
  created_at timestamptz not null default now()
);

create table if not exists analysis_transactions (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references analysis_categories(id) on delete cascade,
  tx_id text,
  tx_date date not null,
  merchant text not null,
  amount numeric(12,2) not null,
  category_name text not null,
  created_at timestamptz not null default now()
);

-- Seed main analysis (mockAnalysisDataWithMomo) + momo_breakdown
with base as (
  insert into analyses (
    id, user_id,
    total_loss, monthly_income,
    summary_en, summary_xh,
    momo_total_spent, momo_alternative_cost, momo_potential_savings,
    momo_breakdown
  )
  values (
    '11111111-1111-1111-1111-111111111111',
    '00000000-0000-0000-0000-000000000001',
    1993.50,
    8500,
    'This month your money went heavily to airtime and MoMo fees. You spent R496 on airtime & data using MoMo. If you bought monthly bundles directly, you could have spent R350 and saved R146. Hidden bank fees also took R430 from your account. Consider freezing unnecessary deductions to take control.',
    'Kule nyanga imali yakho iphume kakhulu kwi-airtime neemali ze-MoMo. Usebenzise i-R496 kwi-airtime ne-data usebenzisa i-MoMo. Ukuba wathenga ii-bundle zenyanga ngqo, ubunokusebenzisa i-R350 uze ugcine i-R146. Iimali zebhanki ezifihlakeleyo zithathe i-R430 kwi-akhawunti yakho. Cinga ngokumisa ukutsalwa okungeyomfuneko uze ulawule.',
    496, 350, 146,
    '{"airtime": {"momoSpent": 300, "alternativeCost": 220}, "data": {"momoSpent": 196, "alternativeCost": 130}}'::jsonb
  )
  on conflict (id) do update
  set total_loss = excluded.total_loss,
      monthly_income = excluded.monthly_income,
      summary_en = excluded.summary_en,
      summary_xh = excluded.summary_xh,
      momo_total_spent = excluded.momo_total_spent,
      momo_alternative_cost = excluded.momo_alternative_cost,
      momo_potential_savings = excluded.momo_potential_savings,
      momo_breakdown = excluded.momo_breakdown
  returning id
),
cats as (
  insert into analysis_categories (
    id, analysis_id, key, name, name_xhosa, amount, percentage, severity
  )
  values
    ('20000000-0000-0000-0000-000000000001', (select id from base), 'hidden-fees', 'Hidden Fees', 'Iimali Ezifihlakeleyo', 430, 5.1, 'critical'),
    ('20000000-0000-0000-0000-000000000002', (select id from base), 'mashonisa', 'Mashonisa Interest', 'Inzala yeMashonisa', 520, 6.1, 'critical'),
    ('20000000-0000-0000-0000-000000000003', (select id from base), 'airtime', 'Airtime Drains', 'Ukuphela kwe-Airtime', 320, 3.8, 'warning'),
    ('20000000-0000-0000-0000-000000000004', (select id from base), 'subscriptions', 'Subscriptions', 'Izabhaliso', 289.50, 3.4, 'warning'),
    ('20000000-0000-0000-0000-000000000005', (select id from base), 'bank-charges', 'Bank Charges', 'Iintlawulo zeBhanki', 188, 2.2, 'info'),
    ('20000000-0000-0000-0000-000000000006', (select id from base), 'other', 'Other Losses', 'Ezinye Ilahleko', 100, 1.2, 'info'),
    ('20000000-0000-0000-0000-000000000007', (select id from base), 'momo-fees', 'MoMo Fees', 'Iimali ze-MoMo', 146, 1.7, 'warning')
  on conflict (id) do update
  set amount = excluded.amount,
      percentage = excluded.percentage,
      severity = excluded.severity
  returning id
)
select 1;

-- Sample analysis_transactions (app generates dynamically; these mirror mock categories)
delete from analysis_transactions
where category_id in (select id from analysis_categories where analysis_id = '11111111-1111-1111-1111-111111111111');

insert into analysis_transactions (category_id, tx_id, tx_date, merchant, amount, category_name)
select id, 'hf-1', date '2026-01-12', 'FNB Service Fee', 45.00, name from analysis_categories where analysis_id = '11111111-1111-1111-1111-111111111111' and key = 'hidden-fees'
union all select id, 'hf-2', date '2026-01-07', 'Capitec Monthly Fee', 5.00, name from analysis_categories where analysis_id = '11111111-1111-1111-1111-111111111111' and key = 'hidden-fees'
union all select id, 'ms-1', date '2025-12-30', 'Cash Loan Interest', 130.00, name from analysis_categories where analysis_id = '11111111-1111-1111-1111-111111111111' and key = 'mashonisa'
union all select id, 'at-1', date '2026-01-26', 'Vodacom Airtime', 50.00, name from analysis_categories where analysis_id = '11111111-1111-1111-1111-111111111111' and key = 'airtime'
union all select id, 'sub-1', date '2026-01-15', 'Netflix SA', 159.00, name from analysis_categories where analysis_id = '11111111-1111-1111-1111-111111111111' and key = 'subscriptions'
union all select id, 'bc-1', date '2026-01-10', 'ATM Withdrawal Fee', 11.00, name from analysis_categories where analysis_id = '11111111-1111-1111-1111-111111111111' and key = 'bank-charges'
union all select id, 'momo-1', date '2026-01-20', 'MoMo Airtime Purchase', 25.00, name from analysis_categories where analysis_id = '11111111-1111-1111-1111-111111111111' and key = 'momo-fees';

-- =========================
-- SUBSCRIPTIONS (Opt-out / FreezeControl)
-- =========================
create table if not exists subscriptions (
  id text primary key,
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  amount numeric(12,2) not null,
  is_opted_out boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into subscriptions (id, user_id, name, amount, is_opted_out)
values
  ('netflix', '00000000-0000-0000-0000-000000000001', 'Netflix SA', 159, false),
  ('showmax', '00000000-0000-0000-0000-000000000001', 'Showmax', 99, false),
  ('spotify', '00000000-0000-0000-0000-000000000001', 'Spotify', 59.99, false),
  ('dstv', '00000000-0000-0000-0000-000000000001', 'DSTV Now', 29, false),
  ('youtube', '00000000-0000-0000-0000-000000000001', 'YouTube Premium', 71.99, false)
on conflict (id) do update
set name = excluded.name,
    amount = excluded.amount,
    is_opted_out = excluded.is_opted_out,
    updated_at = now();

-- =========================
-- FREEZE SETTINGS
-- =========================
create table if not exists freeze_settings (
  user_id uuid primary key references users(id) on delete cascade,
  pause_debit_orders boolean not null default false,
  block_fee_accounts boolean not null default false,
  set_airtime_limit boolean not null default false,
  cancel_subscriptions boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into freeze_settings (
  user_id, pause_debit_orders, block_fee_accounts, set_airtime_limit, cancel_subscriptions
)
values (
  '00000000-0000-0000-0000-000000000001',
  false, false, false, false
)
on conflict (user_id) do nothing;

-- =========================
-- USER BANK ACCOUNTS (Freeze “specific accounts” – BANK_ACCOUNTS in app)
-- =========================
create table if not exists user_bank_accounts (
  id text not null,
  user_id uuid not null references users(id) on delete cascade,
  bank text not null,
  name text not null,
  type bank_account_type not null,
  is_frozen boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (id, user_id)
);

insert into user_bank_accounts (id, user_id, bank, name, type, is_frozen)
values
  ('capitec-main', '00000000-0000-0000-0000-000000000001', 'Capitec', 'Everyday Account', 'current', false),
  ('capitec-save', '00000000-0000-0000-0000-000000000001', 'Capitec', 'Savings Pocket', 'savings', false),
  ('standard-main', '00000000-0000-0000-0000-000000000001', 'Standard Bank', 'Cheque Account', 'current', false),
  ('absa-fee', '00000000-0000-0000-0000-000000000001', 'Absa', 'High-fee Account', 'current', false),
  ('mtn-momo', '00000000-0000-0000-0000-000000000001', 'MTN MoMo', 'MoMo Wallet', 'wallet', false)
on conflict (id, user_id) do update
set bank = excluded.bank,
    name = excluded.name,
    type = excluded.type,
    is_frozen = excluded.is_frozen;

-- =========================
-- PAUSE CONTROL (Debit orders)
-- =========================
create table if not exists debit_orders (
  id text primary key,
  user_id uuid not null references users(id) on delete cascade,
  posted_date date not null,
  description text not null,
  reference text,
  amount numeric(12,2) not null,
  is_paused boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into debit_orders (id, user_id, posted_date, description, reference, amount, is_paused)
values
  ('1', '00000000-0000-0000-0000-000000000001', date '2026-01-03', 'MTN SP DEBIT ORDER', 'MTNSP/1234567890', 499.00, false),
  ('2', '00000000-0000-0000-0000-000000000001', date '2026-01-05', 'INSURANCE PREMIUM DEBIT', 'INSURECO/987654321', 320.50, false),
  ('3', '00000000-0000-0000-0000-000000000001', date '2026-01-09', 'GYM MEMBERSHIP', 'FITGYM/135792468', 299.00, false),
  ('4', '00000000-0000-0000-0000-000000000001', date '2026-01-12', 'STREAMING SERVICE', 'STREAMCO/246813579', 189.99, false)
on conflict (id) do update
set posted_date = excluded.posted_date,
    description = excluded.description,
    reference = excluded.reference,
    amount = excluded.amount,
    is_paused = excluded.is_paused,
    updated_at = now();

-- =========================
-- CATEGORY ACCOUNTS (per-category account autopsy – category/[category] screen)
-- category: banks | telcos | loans | insurance | subscriptions
-- =========================
create table if not exists category_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  category text not null,
  account_id text not null,
  name text not null,
  spent numeric(12,2) not null default 0,
  fees numeric(12,2) not null default 0,
  debits numeric(12,2) not null default 0,
  other numeric(12,2) not null default 0,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, category, account_id)
);

create index if not exists idx_category_accounts_user_category
  on category_accounts (user_id, category);

-- Seed category_accounts for demo user (matches former client-side arrays)
delete from category_accounts where user_id = '00000000-0000-0000-0000-000000000001';

insert into category_accounts (user_id, category, account_id, name, spent, fees, debits, other, display_order)
values
  ('00000000-0000-0000-0000-000000000001', 'banks', 'absa', 'Absa Account', 8250, 225, 3000, 5025, 1),
  ('00000000-0000-0000-0000-000000000001', 'banks', 'standard', 'Standard Bank', 3650, 180, 2100, 1370, 2),
  ('00000000-0000-0000-0000-000000000001', 'banks', 'capitec', 'Capitec', 1450, 95, 830, 525, 3),
  ('00000000-0000-0000-0000-000000000001', 'telcos', 'vodacom', 'Vodacom Wallet', 1590, 130, 875, 585, 1),
  ('00000000-0000-0000-0000-000000000001', 'telcos', 'mtn-momo', 'MTN MoMo', 496, 90, 280, 126, 2),
  ('00000000-0000-0000-0000-000000000001', 'loans', 'mashonisa', 'Mashonisa Loan', 1600, 0, 1600, 0, 1),
  ('00000000-0000-0000-0000-000000000001', 'insurance', 'funeral', 'Funeral Cover', 320, 0, 320, 0, 1),
  ('00000000-0000-0000-0000-000000000001', 'insurance', 'device', 'Device Insurance', 200, 0, 200, 0, 2),
  ('00000000-0000-0000-0000-000000000001', 'subscriptions', 'streaming', 'Streaming Services', 210, 0, 210, 0, 1),
  ('00000000-0000-0000-0000-000000000001', 'subscriptions', 'gym', 'Gym Membership', 100, 0, 100, 0, 2);

-- =========================
-- BANKS & AUTOPSY
-- =========================
create table if not exists banks (
  id text primary key,
  name text not null,
  type bank_type not null,
  total_lost numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

insert into banks (id, name, type, total_lost)
values
  ('capitec', 'Capitec', 'bank', 1193.5),
  ('standard-bank', 'Standard Bank', 'bank', 530.2),
  ('mtn-momo', 'MTN MoMo', 'momo', 496.0)
on conflict (id) do update
set name = excluded.name,
    type = excluded.type,
    total_lost = excluded.total_lost;

create table if not exists bank_autopsy_causes (
  id text primary key,
  bank_id text not null references banks(id) on delete cascade,
  title text not null,
  amount numeric(12,2) not null,
  percent_of_income numeric(6,2) not null,
  created_at timestamptz not null default now()
);

insert into bank_autopsy_causes (id, bank_id, title, amount, percent_of_income)
values
  ('hidden-fees', 'capitec', 'Hidden Fees', 320, 4.2),
  ('mashonisa', 'capitec', 'Mashonisa Interest', 780, 10.3),
  ('airtime', 'capitec', 'Airtime Drains', 210, 2.8)
on conflict (id) do update
set bank_id = excluded.bank_id,
    title = excluded.title,
    amount = excluded.amount,
    percent_of_income = excluded.percent_of_income;

-- =========================
-- BANK AUTOPSY LEAKS (Raw leaks per cause – LEAKS_BY_CAUSE in app)
-- =========================
create table if not exists bank_autopsy_leaks (
  id text primary key,
  cause_id text not null references bank_autopsy_causes(id) on delete cascade,
  bank_id text not null references banks(id) on delete cascade,
  leak_date date not null,
  merchant text not null,
  description text not null,
  channel text not null,
  tag text not null,
  amount numeric(12,2) not null,
  created_at timestamptz not null default now()
);

insert into bank_autopsy_leaks (id, cause_id, bank_id, leak_date, merchant, description, channel, tag, amount)
values
  ('hf-1', 'hidden-fees', 'capitec', date '2026-01-12', 'Bank A', 'Withdrawal Fee', 'bank_fee', 'hidden_fee', 2.5),
  ('hf-2', 'hidden-fees', 'capitec', date '2026-01-07', 'Bank A', 'SMS Notification Fee', 'bank_fee', 'hidden_fee', 1.2),
  ('hf-3', 'hidden-fees', 'capitec', date '2026-01-02', 'Bank A', 'Monthly Service Fee', 'bank_fee', 'hidden_fee', 5.5),
  ('ms-1', 'mashonisa', 'capitec', date '2025-12-30', 'Informal', 'Mr Dlamini Repayment', 'loan', 'loan_shark', 1500),
  ('at-1', 'airtime', 'capitec', date '2026-01-26', 'Telco B', 'Airtime Bundle', 'airtime', 'airtime_drain', 29),
  ('at-2', 'airtime', 'capitec', date '2026-01-25', 'Telco B', 'Data Bundle', 'airtime', 'airtime_drain', 5),
  ('at-3', 'airtime', 'capitec', date '2026-01-24', 'Telco B', 'WASP Subscription - Games', 'airtime', 'airtime_drain', 12),
  ('at-4', 'airtime', 'capitec', date '2026-01-17', 'Telco B', 'Airtime Advance Repayment', 'airtime', 'airtime_drain', 50)
on conflict (id) do update
set cause_id = excluded.cause_id,
    bank_id = excluded.bank_id,
    leak_date = excluded.leak_date,
    merchant = excluded.merchant,
    description = excluded.description,
    channel = excluded.channel,
    tag = excluded.tag,
    amount = excluded.amount;

-- =========================
-- INCOME ROUTING (RerouteControl)
-- =========================
create table if not exists income_accounts (
  id text primary key,
  user_id uuid not null references users(id) on delete cascade,
  bank_name text not null,
  nickname text not null,
  type account_type not null,
  current_income_share int not null,
  suggested_income_share int not null,
  created_at timestamptz not null default now()
);

insert into income_accounts (
  id, user_id, bank_name, nickname, type, current_income_share, suggested_income_share
)
values
  ('1', '00000000-0000-0000-0000-000000000001', 'Absa', 'High‑fee current account', 'highFee', 100, 10),
  ('2', '00000000-0000-0000-0000-000000000001', 'Capitec', 'Everyday account', 'salary', 0, 40),
  ('3', '00000000-0000-0000-0000-000000000001', 'Nedbank', 'Low‑fee savings pocket', 'savings', 0, 50)
on conflict (id) do update
set bank_name = excluded.bank_name,
    nickname = excluded.nickname,
    type = excluded.type,
    current_income_share = excluded.current_income_share,
    suggested_income_share = excluded.suggested_income_share;

create table if not exists reroute_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  is_applied boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists reroute_plan_accounts (
  plan_id uuid not null references reroute_plans(id) on delete cascade,
  account_id text not null references income_accounts(id) on delete cascade,
  enabled boolean not null,
  primary key (plan_id, account_id)
);

with plan as (
  insert into reroute_plans (id, user_id, is_applied)
  values (
    '33333333-3333-3333-3333-333333333333',
    '00000000-0000-0000-0000-000000000001',
    false
  )
  on conflict (id) do update
  set is_applied = excluded.is_applied,
      updated_at = now()
  returning id
)
insert into reroute_plan_accounts (plan_id, account_id, enabled)
values
  ((select id from plan), '1', false),
  ((select id from plan), '2', false),
  ((select id from plan), '3', false)
on conflict (plan_id, account_id) do update
set enabled = excluded.enabled;

-- =========================
-- REWARDS / DISCOUNTS (retailer offers – more app usage = more rewards)
-- =========================
create table if not exists discounts (
  id text primary key,
  retailer text not null,
  title text not null,
  description text not null,
  discount_value text not null,
  code text,
  tier text not null check (tier in ('bronze', 'silver', 'gold')),
  earned_from text not null,
  expires_days int not null default 30,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

insert into discounts (id, retailer, title, description, discount_value, code, tier, earned_from, expires_days, display_order)
values
  ('checkers-10', 'Checkers', '10% off your next shop', 'Save on groceries when you spend R200 or more.', '10% off', 'TRACEPAY10', 'bronze', 'Unlocked after your first analysis', 30, 1),
  ('takealot-50', 'Takealot', 'R50 off electronics & home', 'Minimum spend R500. Excludes certain categories.', 'R50 off', 'TRACEPAY50', 'bronze', 'Unlocked after linking 1 bank', 30, 2),
  ('pick-n-pay-15', 'Pick n Pay', '15% off Smart Shopper deal', 'Use at till or online. One use per account.', '15% off', 'TRACEPAY15', 'silver', 'Unlocked after 2 analyses', 30, 3),
  ('woolworths-20', 'Woolworths', 'R20 off fresh food', 'Fresh fruit, veg & bakery. Min spend R150.', 'R20 off', 'TRACEPAY20', 'silver', 'Unlocked after freezing a leak', 30, 4),
  ('mtn-airtime', 'MTN', 'R5 off airtime or data', 'Any recharge or bundle. In-store or app.', 'R5 off', null, 'silver', 'Unlocked after 3 analyses', 30, 5),
  ('dischem-25', 'Dis-Chem', '25% off selected health & beauty', 'In-store only. Show code at till.', '25% off', 'TRACEPAY25', 'gold', 'Unlocked after 5 analyses', 30, 6),
  ('makro-100', 'Makro', 'R100 off when you spend R1 000', 'Valid on bulk and general merchandise.', 'R100 off', 'TRACEPAY100', 'gold', 'Unlocked after linking 2+ banks', 30, 7)
on conflict (id) do update
set retailer = excluded.retailer,
    title = excluded.title,
    description = excluded.description,
    discount_value = excluded.discount_value,
    code = excluded.code,
    tier = excluded.tier,
    earned_from = excluded.earned_from,
    expires_days = excluded.expires_days,
    display_order = excluded.display_order;

-- Which discounts a user has unlocked (optional: filter rewards by usage later)
create table if not exists user_discounts (
  user_id uuid not null references users(id) on delete cascade,
  discount_id text not null references discounts(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  expires_at date,
  primary key (user_id, discount_id)
);

-- =========================
-- PARTNER RECOMMENDATIONS (rerouting – better savings based on user data)
-- Partners: local retailers, telcos. Shown in reroute flow; matched to spending category.
-- =========================
create table if not exists partner_recommendations (
  id text primary key,
  partner_type text not null check (partner_type in ('retailer', 'telco')),
  partner_name text not null,
  title text not null,
  description text not null,
  savings_estimate text not null,
  category text not null,
  discount_id text references discounts(id) on delete set null,
  cta_label text not null default 'See offer',
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

insert into partner_recommendations (id, partner_type, partner_name, title, description, savings_estimate, category, discount_id, cta_label, display_order)
values
  ('mtn-bundle-telco', 'telco', 'MTN', 'Switch to a monthly data bundle', 'You spend on airtime and data. A monthly bundle is cheaper than ad‑hoc top‑ups.', 'Save up to R146/mo', 'telcos', 'mtn-airtime', 'Get MTN offer', 1),
  ('vodacom-telco', 'telco', 'Vodacom', 'Vodacom bundle for data & airtime', 'Bundle your airtime and data to avoid per‑use fees.', 'Save up to R80/mo', 'telcos', null, 'Compare bundles', 2),
  ('checkers-groceries', 'retailer', 'Checkers', 'Shop groceries at Checkers', 'Use your TracePay reward for 10% off. Better than ad‑hoc spending.', '10% off your shop', 'subscriptions', 'checkers-10', 'Use discount', 3),
  ('pnp-groceries', 'retailer', 'Pick n Pay', 'Pick n Pay Smart Shopper', 'Stack Smart Shopper with TracePay for 15% off.', '15% off', 'subscriptions', 'pick-n-pay-15', 'See offer', 4),
  ('lowfee-banks', 'retailer', 'TracePay partners', 'Move salary to a low‑fee account', 'You lose money to bank fees. Reroute income to accounts that leak less.', 'Cut fee drain', 'banks', null, 'Reroute income above', 5),
  ('streaming-partner', 'retailer', 'Partners', 'Review subscriptions', 'You spend on streaming and gym. Pause what you don’t use and use partner discounts.', 'Save on unused subs', 'subscriptions', null, 'Check subscriptions', 6)
on conflict (id) do update
set partner_type = excluded.partner_type,
    partner_name = excluded.partner_name,
    title = excluded.title,
    description = excluded.description,
    savings_estimate = excluded.savings_estimate,
    category = excluded.category,
    discount_id = excluded.discount_id,
    cta_label = excluded.cta_label,
    display_order = excluded.display_order;

-- =========================
-- DONE
-- =========================
