-- ============================================================================
-- TracePay demo data seed script
-- ============================================================================
-- Run this in Supabase Studio -> SQL Editor (or `psql` against your project's
-- connection string). Intended for a DEV/DEMO Supabase project only -- it
-- creates fake login accounts and fake financial history. Do not run this
-- against a database that has real users in it.
--
-- Meant to be run ONCE against a fresh/empty demo project. Most tables here
-- have no natural unique key to upsert against (linked_accounts,
-- analysis_results, transactions, frozen_items, redemptions, regional_stats,
-- audit_logs), so re-running this script will create duplicate rows. See
-- seed_demo_data_cleanup.sql to wipe everything this script creates before
-- re-running it.
--
-- Login accounts created (password for all: TracePayDemo2026!):
--   thabo.demo@tracepay.co.za       individual
--   nomvula.demo@tracepay.co.za     business owner ("Ubuntu Grocers (Pty) Ltd")
--   sipho.demo@tracepay.co.za       invited business team member (Nomvula's business)
--   investor.demo@tracepay.co.za    investor
--   partner.demo@tracepay.co.za     commission partner (linked to the Shoprite offer)
--   admin.demo@tracepay.co.za       TracePay admin
--   pnp.demo@tracepay.co.za         commission partner (linked to the Pick n Pay offer)
--   checkers.demo@tracepay.co.za    commission partner (linked to the Checkers offer)
--   clicks.demo@tracepay.co.za      commission partner (linked to the Clicks offer)
--   mrprice.demo@tracepay.co.za     commission partner (linked to the Mr Price offer)
--   woolworths.demo@tracepay.co.za  commission partner (linked to the Woolworths offer)
-- All 6 partner rows seeded by alembic migration 0010 (shoprite, pnp, checkers,
-- mrprice, clicks, woolworths) get an owner login above and a redemption
-- history in SECTION 9, so none of them show up as "No owner linked" or with
-- zero redemptions on the admin Reward Partners page.
--
-- If direct auth.users/auth.identities seeding below doesn't produce a
-- working login on your Supabase project (the exact auth schema shifts
-- slightly release to release), the fallback is: create these 11 exact
-- emails yourself via Supabase Dashboard -> Authentication -> Users -> Add
-- User (same password), or via your own /dashboard/provision admin page --
-- then just re-run SECTION 2 onward, which only assumes the auth.users row
-- already exists.
--
-- NOTE ON MOBILE: the mobile app only ever reads/writes the `profiles`
-- table directly (full_name, reward_points, recovery_email, daily
-- check-in). Its transaction/leak screens are populated by its own
-- on-device SMS-scan simulation, not from this database -- seeding
-- linked_accounts/analysis_results here will not make anything appear on
-- mobile's Home/Leaks screens. It DOES mean the reward points balance and
-- name shown on mobile will match what's seeded here, since both read the
-- same profiles row.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- SECTION 1: Auth accounts
-- ----------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data,
  is_super_admin, created_at, updated_at,
  confirmation_token, recovery_token, email_change,
  email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token
)
values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'thabo.demo@tracepay.co.za',    crypt('TracePayDemo2026!', gen_salt('bf')), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Thabo Nkosi"}',           false, now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'nomvula.demo@tracepay.co.za',  crypt('TracePayDemo2026!', gen_salt('bf')), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Nomvula Dlamini"}',       false, now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'sipho.demo@tracepay.co.za',    crypt('TracePayDemo2026!', gen_salt('bf')), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Sipho Mahlangu"}',        false, now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'investor.demo@tracepay.co.za', crypt('TracePayDemo2026!', gen_salt('bf')), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Investor Demo"}',         false, now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'partner.demo@tracepay.co.za',  crypt('TracePayDemo2026!', gen_salt('bf')), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Shoprite Partnerships"}', false, now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'admin.demo@tracepay.co.za',    crypt('TracePayDemo2026!', gen_salt('bf')), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"TracePay Admin"}',        false, now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'pnp.demo@tracepay.co.za',        crypt('TracePayDemo2026!', gen_salt('bf')), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Pick n Pay Partnerships"}',   false, now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000008', 'authenticated', 'authenticated', 'checkers.demo@tracepay.co.za',   crypt('TracePayDemo2026!', gen_salt('bf')), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Checkers Partnerships"}',     false, now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000009', 'authenticated', 'authenticated', 'clicks.demo@tracepay.co.za',     crypt('TracePayDemo2026!', gen_salt('bf')), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Clicks Partnerships"}',       false, now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000010', 'authenticated', 'authenticated', 'mrprice.demo@tracepay.co.za',    crypt('TracePayDemo2026!', gen_salt('bf')), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Mr Price Partnerships"}',     false, now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000011', 'authenticated', 'authenticated', 'woolworths.demo@tracepay.co.za', crypt('TracePayDemo2026!', gen_salt('bf')), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Woolworths Partnerships"}',   false, now(), now(), '', '', '', '', '', '', '', '')
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email),
       'email', now(), now(), now()
from auth.users u
where u.email in (
  'thabo.demo@tracepay.co.za', 'nomvula.demo@tracepay.co.za', 'sipho.demo@tracepay.co.za',
  'investor.demo@tracepay.co.za', 'partner.demo@tracepay.co.za', 'admin.demo@tracepay.co.za',
  'pnp.demo@tracepay.co.za', 'checkers.demo@tracepay.co.za', 'clicks.demo@tracepay.co.za',
  'mrprice.demo@tracepay.co.za', 'woolworths.demo@tracepay.co.za'
)
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- SECTION 2: profiles (role, full_name, reward_points)
-- A trigger on auth.users already created a default profiles row for each of
-- these (role="user") -- upsert to set the real role/name/points.
-- ----------------------------------------------------------------------------
insert into public.profiles (id, role, full_name, reward_points, created_at)
values
  ('a0000000-0000-4000-8000-000000000001', 'user',     'Thabo Nkosi',            850, now() - interval '90 days'),
  ('a0000000-0000-4000-8000-000000000002', 'user',     'Nomvula Dlamini',        120, now() - interval '120 days'),
  ('a0000000-0000-4000-8000-000000000003', 'user',     'Sipho Mahlangu',          40, now() - interval '30 days'),
  ('a0000000-0000-4000-8000-000000000004', 'investor', 'Investor Demo',            0, now() - interval '60 days'),
  ('a0000000-0000-4000-8000-000000000005', 'partner',  'Shoprite Partnerships',    0, now() - interval '60 days'),
  ('a0000000-0000-4000-8000-000000000006', 'admin',    'TracePay Admin',           0, now() - interval '180 days'),
  ('a0000000-0000-4000-8000-000000000007', 'partner',  'Pick n Pay Partnerships',  0, now() - interval '58 days'),
  ('a0000000-0000-4000-8000-000000000008', 'partner',  'Checkers Partnerships',    0, now() - interval '58 days'),
  ('a0000000-0000-4000-8000-000000000009', 'partner',  'Clicks Partnerships',      0, now() - interval '58 days'),
  ('a0000000-0000-4000-8000-000000000010', 'partner',  'Mr Price Partnerships',    0, now() - interval '58 days'),
  ('a0000000-0000-4000-8000-000000000011', 'partner',  'Woolworths Partnerships',  0, now() - interval '58 days')
on conflict (id) do update set
  role = excluded.role,
  full_name = excluded.full_name,
  reward_points = excluded.reward_points;

-- ----------------------------------------------------------------------------
-- SECTION 3: account_settings (individual vs business + onboarded flag)
-- Thabo and Sipho are explicit individuals; Nomvula is the business owner.
-- Giving Thabo/Sipho a row too means the onboarding modal won't interrupt
-- the demo recording.
-- ----------------------------------------------------------------------------
insert into public.account_settings (user_id, account_type, business_name, created_at, updated_at)
values
  ('a0000000-0000-4000-8000-000000000001', 'individual', null,                        now() - interval '90 days', now() - interval '1 day'),
  ('a0000000-0000-4000-8000-000000000002', 'business',   'Ubuntu Grocers (Pty) Ltd',  now() - interval '120 days', now() - interval '2 days'),
  ('a0000000-0000-4000-8000-000000000003', 'individual', null,                        now() - interval '30 days', now() - interval '30 days')
on conflict (user_id) do update set
  account_type = excluded.account_type,
  business_name = excluded.business_name,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- SECTION 4: business_memberships (Sipho works for Nomvula's business)
-- ----------------------------------------------------------------------------
insert into public.business_memberships (owner_user_id, member_user_id, invited_email, created_at)
select 'a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000003',
       'sipho.demo@tracepay.co.za', now() - interval '25 days'
where not exists (
  select 1 from public.business_memberships where member_user_id = 'a0000000-0000-4000-8000-000000000003'
);

-- ----------------------------------------------------------------------------
-- SECTION 5: linked_accounts
-- ----------------------------------------------------------------------------
insert into public.linked_accounts (user_id, bank_name, account_id, status, last_synced_at, created_at, metadata, branch_label)
values
  ('a0000000-0000-4000-8000-000000000001', 'Capitec',       'capitec-thabo-001',    'active', now() - interval '3 hours',  now() - interval '90 days', '{}'::jsonb, null),
  ('a0000000-0000-4000-8000-000000000001', 'MTN MoMo',      'momo-thabo-001',       'active', now() - interval '1 day',    now() - interval '85 days', '{}'::jsonb, null),

  ('a0000000-0000-4000-8000-000000000002', 'FNB',           'fnb-ubuntu-soweto',    'active', now() - interval '4 hours',  now() - interval '120 days', '{}'::jsonb, 'Soweto Branch'),
  ('a0000000-0000-4000-8000-000000000002', 'Standard Bank', 'sb-ubuntu-soweto',     'active', now() - interval '1 day',    now() - interval '118 days', '{}'::jsonb, 'Soweto Branch'),
  ('a0000000-0000-4000-8000-000000000002', 'Nedbank',       'ned-ubuntu-sandton',   'active', now() - interval '6 hours',  now() - interval '95 days',  '{}'::jsonb, 'Sandton HQ'),
  ('a0000000-0000-4000-8000-000000000002', 'Absa',          'absa-ubuntu-sandton',  'active', now() - interval '2 days',   now() - interval '80 days',  '{}'::jsonb, 'Sandton HQ');

-- ----------------------------------------------------------------------------
-- SECTION 6: transactions (a realistic recent slice per account -- these
-- feed admin's total_transactions/data-ingestion stats; the leak lists
-- themselves come from analysis_results.money_leaks below, not from these
-- rows directly)
-- ----------------------------------------------------------------------------
insert into public.transactions (user_id, account_id, transaction_id, "timestamp", amount, currency, description, merchant, category, direction, channel, transaction_data, created_at)
select la.user_id, la.id, gen_random_uuid()::text, t.ts, t.amount, 'ZAR', t.description, t.merchant, t.category, t.direction, 'card', '{}'::jsonb, t.ts
from public.linked_accounts la
join lateral (
  values
    (now() - interval '1 day',  -35.00,  'Airtime top-up',          'MTN',            'airtime',   'debit'),
    (now() - interval '2 days', -450.00, 'Cash Send fee',           'Capitec',        'fee',       'debit'),
    (now() - interval '3 days', -899.00, 'Groceries',               'Shoprite',       'groceries', 'debit'),
    (now() - interval '5 days', -149.00, 'DStv subscription',       'MultiChoice',    'subscription', 'debit'),
    (now() - interval '7 days', 8500.00, 'Salary',                  'Employer',       'income',    'credit'),
    (now() - interval '9 days', -60.00,  'ATM withdrawal fee',      'ATM',            'fee',       'debit'),
    (now() - interval '12 days', -220.00, 'Uber rides',             'Uber',           'transport', 'debit')
) as t(ts, amount, description, merchant, category, direction) on true
where la.user_id = 'a0000000-0000-4000-8000-000000000001'
  and la.bank_name = 'Capitec';

insert into public.transactions (user_id, account_id, transaction_id, "timestamp", amount, currency, description, merchant, category, direction, channel, transaction_data, created_at)
select la.user_id, la.id, gen_random_uuid()::text, t.ts, t.amount, 'ZAR', t.description, t.merchant, t.category, t.direction, 'pos', '{}'::jsonb, t.ts
from public.linked_accounts la
join lateral (
  values
    (now() - interval '1 day',  -3200.00, 'Stock delivery: fresh produce', 'Fruit & Veg Wholesalers', 'stock',      'debit'),
    (now() - interval '2 days', -890.00,  'POS software subscription',     'Yoco',                    'subscription', 'debit'),
    (now() - interval '4 days', -1250.00, 'Cash-in-transit fee',           'Fidelity ADT',            'fee',        'debit'),
    (now() - interval '6 days', 45000.00, 'Daily till takings',            'Till Deposit',            'income',     'credit'),
    (now() - interval '10 days', -610.00, 'Bank service fees',             'FNB',                     'fee',        'debit')
) as t(ts, amount, description, merchant, category, direction) on true
where la.user_id = 'a0000000-0000-4000-8000-000000000002'
  and la.bank_name = 'FNB';

-- ----------------------------------------------------------------------------
-- SECTION 7: analysis_results (financial health history + money_leaks)
-- money_leaks entries match the exact shape the forensic engine produces:
-- {id, detector, title, plain_language_reason, severity, transaction_id,
--  estimated_monthly_cost, evidence}. InclusionScorer/StakeholderMetrics/
-- MailboxEffect entries are the same metadata shape the Open Banking sync
-- path (app/background_jobs.py, app/routers/admin.py) appends -- they power
-- the admin dashboard's inclusion-score/retail-velocity/mailbox-effect
-- stats but are filtered out of what an individual/business actually sees
-- as "their leaks".
-- ----------------------------------------------------------------------------

-- Thabo: three analyses, improving trend (55 -> 68 -> 79)
insert into public.analysis_results (user_id, financial_health_score, health_band, money_leaks, summary_plain_language, transaction_count, created_at)
values (
  'a0000000-0000-4000-8000-000000000001', 55, 'yellow',
  '[
    {"id":"airtime-1","detector":"AirtimeDrains","title":"Airtime is quietly draining your money","plain_language_reason":"You topped up airtime 6 times this month for about R210 total. Small amounts, but they add up fast.","severity":"medium","transaction_id":null,"estimated_monthly_cost":210.00,"evidence":{"count_last_30_days":6,"sum_last_30_days":210.00}},
    {"id":"fee-leakage","detector":"FeeLeakage","title":"Fees are eating your balance","plain_language_reason":"You paid about R145 in fees recently (cash send / ATM withdrawal fees). That is money leaving without helping your household.","severity":"medium","transaction_id":null,"estimated_monthly_cost":145.00,"evidence":{"count_last_30_days":4,"sum_last_30_days":145.00}},
    {"id":"inclusion-metadata","detector":"InclusionScorer","title":"Inclusion Metrics","score":58,"level":"Medium","mno_consistency":true},
    {"id":"stakeholder-metadata","detector":"StakeholderMetrics","inclusion_delta":12,"retail_velocity":266.25}
  ]'::jsonb,
  'Your finances are under pressure. Biggest issue: Airtime is quietly draining your money. Small changes can help fast.',
  34, now() - interval '60 days'
);

insert into public.analysis_results (user_id, financial_health_score, health_band, money_leaks, summary_plain_language, transaction_count, created_at)
values (
  'a0000000-0000-4000-8000-000000000001', 68, 'yellow',
  '[
    {"id":"fee-leakage","detector":"FeeLeakage","title":"Fees are eating your balance","plain_language_reason":"You paid about R90 in fees recently (cash send / ATM withdrawal fees). That is money leaving without helping your household.","severity":"low","transaction_id":null,"estimated_monthly_cost":90.00,"evidence":{"count_last_30_days":2,"sum_last_30_days":90.00}},
    {"id":"weekend-spending","detector":"WeekendSpending","title":"Weekend spending is much higher than weekdays","plain_language_reason":"Your weekend spending is running about 2.4x higher than weekdays -- mostly social spending.","severity":"low","transaction_id":null,"estimated_monthly_cost":180.00,"evidence":{"weekday_avg":95.00,"weekend_avg":228.00}},
    {"id":"inclusion-metadata","detector":"InclusionScorer","title":"Inclusion Metrics","score":66,"level":"Medium","mno_consistency":true},
    {"id":"stakeholder-metadata","detector":"StakeholderMetrics","inclusion_delta":14,"retail_velocity":202.50}
  ]'::jsonb,
  'Looking good overall. Still, watch out for: Fees are eating your balance.',
  29, now() - interval '30 days'
);

insert into public.analysis_results (user_id, financial_health_score, health_band, money_leaks, summary_plain_language, transaction_count, created_at)
values (
  'a0000000-0000-4000-8000-000000000001', 79, 'green',
  '[
    {"id":"subscription-traps","detector":"SubscriptionTraps","title":"Recurring charge: MultiChoice","plain_language_reason":"A R149.00 recurring charge from MultiChoice hits your account every month -- worth checking you still use it.","severity":"low","transaction_id":null,"estimated_monthly_cost":149.00,"evidence":{"merchant":"MultiChoice","count_last_90_days":3}},
    {"id":"inclusion-metadata","detector":"InclusionScorer","title":"Inclusion Metrics","score":77,"level":"High","mno_consistency":true},
    {"id":"stakeholder-metadata","detector":"StakeholderMetrics","inclusion_delta":18,"retail_velocity":111.75}
  ]'::jsonb,
  'No big money leaks found. Keep tracking your spending and check again after a few days.',
  31, now() - interval '3 days'
);

-- Nomvula's business: three analyses, business-flavoured leaks
insert into public.analysis_results (user_id, financial_health_score, health_band, money_leaks, summary_plain_language, transaction_count, created_at)
values (
  'a0000000-0000-4000-8000-000000000002', 61, 'yellow',
  '[
    {"id":"fee-leakage","detector":"FeeLeakage","title":"Fees are eating your balance","plain_language_reason":"You paid about R1,250 in fees recently (cash-in-transit / bank service fees). That is money leaving without helping your business.","severity":"high","transaction_id":null,"estimated_monthly_cost":1250.00,"evidence":{"count_last_30_days":5,"sum_last_30_days":1250.00}},
    {"id":"debit-orders","detector":"DebitOrders","title":"Multiple debit orders detected","plain_language_reason":"7 debit orders came off your account this month, including a couple of similar-looking software subscriptions -- worth auditing for duplicates.","severity":"medium","transaction_id":null,"estimated_monthly_cost":890.00,"evidence":{"count_last_30_days":7}},
    {"id":"inclusion-metadata","detector":"InclusionScorer","title":"Inclusion Metrics","score":55,"level":"Medium","mno_consistency":true},
    {"id":"stakeholder-metadata","detector":"StakeholderMetrics","inclusion_delta":9,"retail_velocity":1605.00}
  ]'::jsonb,
  'Your finances are under pressure. Biggest issue: Fees are eating your balance. Small changes can help fast.',
  58, now() - interval '45 days'
);

insert into public.analysis_results (user_id, financial_health_score, health_band, money_leaks, summary_plain_language, transaction_count, created_at)
values (
  'a0000000-0000-4000-8000-000000000002', 70, 'yellow',
  '[
    {"id":"vas-charges","detector":"VASCharges","title":"Value-added service charges are adding up","plain_language_reason":"SMS/USSD value-added service charges are adding up to about R310 a month across your linked lines.","severity":"medium","transaction_id":null,"estimated_monthly_cost":310.00,"evidence":{"count_last_30_days":9,"sum_last_30_days":310.00}},
    {"id":"inclusion-metadata","detector":"InclusionScorer","title":"Inclusion Metrics","score":68,"level":"Medium","mno_consistency":true},
    {"id":"stakeholder-metadata","detector":"StakeholderMetrics","inclusion_delta":13,"retail_velocity":232.50}
  ]'::jsonb,
  'Looking good overall. Still, watch out for: Value-added service charges are adding up.',
  62, now() - interval '18 days'
);

insert into public.analysis_results (user_id, financial_health_score, health_band, money_leaks, summary_plain_language, transaction_count, created_at)
values (
  'a0000000-0000-4000-8000-000000000002', 74, 'green',
  '[
    {"id":"fee-leakage","detector":"FeeLeakage","title":"Fees are eating your balance","plain_language_reason":"You paid about R480 in fees recently (bank service fees). Worth a quick review with your bank.","severity":"low","transaction_id":null,"estimated_monthly_cost":480.00,"evidence":{"count_last_30_days":3,"sum_last_30_days":480.00}},
    {"id":"inclusion-metadata","detector":"InclusionScorer","title":"Inclusion Metrics","score":73,"level":"High","mno_consistency":true},
    {"id":"stakeholder-metadata","detector":"StakeholderMetrics","inclusion_delta":16,"retail_velocity":360.00}
  ]'::jsonb,
  'Looking good overall. Still, watch out for: Fees are eating your balance.',
  55, now() - interval '2 days'
);

-- ----------------------------------------------------------------------------
-- SECTION 8: frozen_items
-- ----------------------------------------------------------------------------
insert into public.frozen_items (user_id, leak_id, transaction_id, consent_id, reason, frozen_at, status)
values
  ('a0000000-0000-4000-8000-000000000001', 'fee-leakage', null, null, 'Freeze: Fees are eating your balance', now() - interval '25 days', 'frozen'),
  ('a0000000-0000-4000-8000-000000000002', 'debit-orders', null, null, 'Freeze: Multiple debit orders detected', now() - interval '40 days', 'frozen');

-- ----------------------------------------------------------------------------
-- SECTION 9: reward partners + redemptions
-- Links each of the 6 partner demo logins to its already-seeded partner row
-- (created by alembic migration 0010: shoprite, pnp, checkers, mrprice,
-- clicks, woolworths) and backfills a redemption history for every one of
-- them so none show up as "No owner linked" or with zero redemptions on the
-- admin Reward Partners page. commission_amount = partner's commission_rate
-- (0.025) * estimated_value_rand, same math the app uses at redemption time.
-- ----------------------------------------------------------------------------
update public.partners set owner_user_id = 'a0000000-0000-4000-8000-000000000005' where id = 'shoprite';
update public.partners set owner_user_id = 'a0000000-0000-4000-8000-000000000007' where id = 'pnp';
update public.partners set owner_user_id = 'a0000000-0000-4000-8000-000000000008' where id = 'checkers';
update public.partners set owner_user_id = 'a0000000-0000-4000-8000-000000000009' where id = 'clicks';
update public.partners set owner_user_id = 'a0000000-0000-4000-8000-000000000010' where id = 'mrprice';
update public.partners set owner_user_id = 'a0000000-0000-4000-8000-000000000011' where id = 'woolworths';

insert into public.redemptions (user_id, partner_id, points_spent, commission_amount, status, redeemed_at)
values
  -- shoprite: 5% off groceries, R200 est value -> R5.00 commission
  ('a0000000-0000-4000-8000-000000000001', 'shoprite', 150, 5.00, 'completed', now() - interval '2 days'),
  ('a0000000-0000-4000-8000-000000000001', 'shoprite', 150, 5.00, 'completed', now() - interval '9 days'),
  ('a0000000-0000-4000-8000-000000000002', 'shoprite', 150, 5.00, 'completed', now() - interval '20 days'),
  -- pnp: R20 voucher, R20 est value -> R0.50 commission
  ('a0000000-0000-4000-8000-000000000001', 'pnp', 200, 0.50, 'completed', now() - interval '16 days'),
  ('a0000000-0000-4000-8000-000000000003', 'pnp', 200, 0.50, 'completed', now() - interval '11 days'),
  ('a0000000-0000-4000-8000-000000000002', 'pnp', 200, 0.50, 'completed', now() - interval '27 days'),
  -- checkers: 3% cashback, R150 est value -> R3.75 commission
  ('a0000000-0000-4000-8000-000000000001', 'checkers', 180, 3.75, 'completed', now() - interval '5 days'),
  ('a0000000-0000-4000-8000-000000000002', 'checkers', 180, 3.75, 'completed', now() - interval '14 days'),
  ('a0000000-0000-4000-8000-000000000003', 'checkers', 180, 3.75, 'completed', now() - interval '22 days'),
  -- mrprice: 10% off clothing, R100 est value -> R2.50 commission
  ('a0000000-0000-4000-8000-000000000001', 'mrprice', 120, 2.50, 'completed', now() - interval '8 days'),
  ('a0000000-0000-4000-8000-000000000002', 'mrprice', 120, 2.50, 'completed', now() - interval '31 days'),
  -- clicks: R15 off pharmacy, R15 est value -> R0.38 commission
  ('a0000000-0000-4000-8000-000000000001', 'clicks', 100, 0.38, 'completed', now() - interval '3 days'),
  ('a0000000-0000-4000-8000-000000000003', 'clicks', 100, 0.38, 'completed', now() - interval '18 days'),
  -- woolworths: 8% off food, R180 est value -> R4.50 commission
  ('a0000000-0000-4000-8000-000000000001', 'woolworths', 160, 4.50, 'completed', now() - interval '6 days'),
  ('a0000000-0000-4000-8000-000000000002', 'woolworths', 160, 4.50, 'completed', now() - interval '17 days'),
  ('a0000000-0000-4000-8000-000000000003', 'woolworths', 160, 4.50, 'completed', now() - interval '25 days');

-- ----------------------------------------------------------------------------
-- SECTION 10: regional_stats (drives the investor + admin regional views --
-- this table has no FK to individual users, it's a standalone aggregate)
-- ----------------------------------------------------------------------------
insert into public.regional_stats (region, metric_name, value, period, created_at)
values
  ('Gauteng',         'average_health_score', 64.2, 'current', now()),
  ('Gauteng',         'total_leaks',          812,  'current', now()),
  ('Gauteng',         'total_users',          1180, 'current', now()),
  ('Western Cape',    'average_health_score', 69.8, 'current', now()),
  ('Western Cape',    'total_leaks',          430,  'current', now()),
  ('Western Cape',    'total_users',          640,  'current', now()),
  ('KwaZulu-Natal',   'average_health_score', 58.4, 'current', now()),
  ('KwaZulu-Natal',   'total_leaks',          705,  'current', now()),
  ('KwaZulu-Natal',   'total_users',          890,  'current', now()),
  ('Eastern Cape',    'average_health_score', 52.1, 'current', now()),
  ('Eastern Cape',    'total_leaks',          560,  'current', now()),
  ('Eastern Cape',    'total_users',          510,  'current', now()),
  ('Free State',      'average_health_score', 55.6, 'current', now()),
  ('Free State',       'total_leaks',         210,  'current', now()),
  ('Free State',      'total_users',          240,  'current', now()),
  ('Limpopo',         'average_health_score', 49.3, 'current', now()),
  ('Limpopo',         'total_leaks',          295,  'current', now()),
  ('Limpopo',         'total_users',          310,  'current', now()),
  ('Mpumalanga',      'average_health_score', 57.9, 'current', now()),
  ('Mpumalanga',      'total_leaks',          188,  'current', now()),
  ('Mpumalanga',      'total_users',          205,  'current', now()),
  ('North West',      'average_health_score', 53.4, 'current', now()),
  ('North West',      'total_leaks',          162,  'current', now()),
  ('North West',      'total_users',          175,  'current', now());

-- ----------------------------------------------------------------------------
-- SECTION 11: background filler users
-- Bulks up total_users/total_analyses/average_health_score for the investor
-- and admin overview dashboards, since those are computed live across every
-- profile/analysis in the database. Real SA names, no login needed (no
-- auth.identities row), but a real auth.users row is still required because
-- profiles.id has a hard FK to auth.users.id. 400 filler users, and leak
-- costs pushed up into the R150-R800/month range, so that
-- total_capital_protected/total_retail_velocity (summed across every
-- analysis in the database, see app/stats.py) clear the threshold needed
-- to render as a non-zero "RX.XM" on the admin/investor overview -- those
-- two cards divide by 1,000,000 and round to one decimal, so a handful of
-- demo accounts alone will always display as R0.0M.
-- ----------------------------------------------------------------------------
do $$
declare
  first_names text[] := array['Lindiwe','Bongani','Precious','Karabo','Ayanda','Kagiso','Zanele','Tshepo','Nomsa','Sizwe','Palesa','Vusi','Thandeka','Mandla','Nokuthula','Refilwe','Themba','Ntombi','Andile','Lerato'];
  last_names  text[] := array['Zulu','Khumalo','Mokoena','Sithole','Ndlovu','Molefe','Mbeki','Radebe','Cele','Ngcobo','Motaung','Maseko','Buthelezi','Zwane','Gumede','Tshabalala','Mabaso','Nkosi','Dube','Mahlangu'];
  merchants   text[] := array['Shoprite','Pick n Pay','Checkers','Boxer','Spar','Woolworths','Clicks','Engen','Sasol','Uber','Bolt','MTN','Vodacom','Cell C','Telkom','MultiChoice','Mr D Food','Takealot'];
  banks       text[] := array['FNB','Standard Bank','Absa','Nedbank','Capitec','MTN MoMo','TymeBank'];
  detectors   text[] := array['AirtimeDrains','FeeLeakage','SubscriptionTraps','WeekendSpending','VASCharges','DebitOrders'];
  titles      text[] := array['Airtime is quietly draining your money','Fees are eating your balance','Recurring charge adding up','Weekend spending is much higher than weekdays','Value-added service charges are adding up','Multiple debit orders detected'];
  i int;
  new_id uuid;
  full_name text;
  score int;
  leak_cost numeric;
  detector_idx int;
  leaks jsonb;
  include_mailbox boolean;
begin
  for i in 1..400 loop
    new_id := gen_random_uuid();
    full_name := first_names[1 + (i % array_length(first_names, 1))] || ' ' || last_names[1 + ((i * 7) % array_length(last_names, 1))];
    score := 35 + floor(random() * 55)::int;          -- 35-90
    leak_cost := round((150 + random() * 650)::numeric, 2); -- R150 - R800
    detector_idx := 1 + (i % array_length(detectors, 1));
    include_mailbox := (i % 5 = 0);                    -- ~20% prevalence

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, created_at, updated_at,
      confirmation_token, recovery_token, email_change,
      email_change_token_new, email_change_token_current,
      phone_change, phone_change_token, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000', new_id, 'authenticated', 'authenticated',
      'demo-filler-' || i::text || '@tracepay.co.za',
      crypt('TracePayDemo2026!', gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}',
      jsonb_build_object('full_name', full_name),
      false, now() - (i::text || ' days')::interval, now(),
      '', '', '', '', '', '', '', ''
    );

    insert into public.profiles (id, role, full_name, reward_points, created_at)
    values (new_id, 'user', full_name, floor(random() * 500)::int, now() - (i::text || ' days')::interval)
    on conflict (id) do update set full_name = excluded.full_name;

    leaks := jsonb_build_array(
      jsonb_build_object(
        'id', 'filler-leak-' || i::text,
        'detector', detectors[detector_idx],
        'title', titles[detector_idx],
        'plain_language_reason', 'Recent activity from ' || merchants[1 + (i % array_length(merchants, 1))] || ' is adding up to a noticeable monthly cost.',
        'severity', case when leak_cost > 250 then 'high' when leak_cost > 120 then 'medium' else 'low' end,
        'transaction_id', null,
        'estimated_monthly_cost', leak_cost,
        'evidence', jsonb_build_object('count_last_30_days', 2 + (i % 6), 'sum_last_30_days', leak_cost)
      ),
      jsonb_build_object('id', 'inclusion-metadata', 'detector', 'InclusionScorer', 'title', 'Inclusion Metrics',
        'score', score, 'level', case when score >= 75 then 'High' when score >= 40 then 'Medium' else 'Low' end, 'mno_consistency', true),
      jsonb_build_object('id', 'stakeholder-metadata', 'detector', 'StakeholderMetrics',
        'inclusion_delta', 8 + (i % 12), 'retail_velocity', round((leak_cost * 0.75)::numeric, 2))
    );

    if include_mailbox then
      leaks := leaks || jsonb_build_array(jsonb_build_object(
        'id', 'mailbox-effect', 'detector', 'MailboxEffect', 'title', 'Passing through: Mailbox Effect detected',
        'plain_language_reason', 'Money seems to pass through this account rather than stay -- a common pattern for informal remittance hubs.',
        'severity', 'medium', 'transaction_id', null, 'estimated_monthly_cost', round((50 + random() * 150)::numeric, 2),
        'evidence', jsonb_build_object('pass_through_ratio', round((0.6 + random() * 0.3)::numeric, 2))
      ));
    end if;

    insert into public.analysis_results (user_id, financial_health_score, health_band, money_leaks, summary_plain_language, transaction_count, created_at)
    values (
      new_id, score,
      case when score >= 75 then 'green' when score >= 50 then 'yellow' else 'red' end,
      leaks,
      case when score >= 75 then 'No big money leaks found. Keep tracking your spending and check again after a few days.'
           when score >= 50 then 'Looking good overall. Still, watch out for: ' || titles[detector_idx] || '.'
           else 'Warning: your money is leaking. Biggest issue: ' || titles[detector_idx] || '. Tap Freeze to simulate stopping it.' end,
      15 + (i % 40),
      now() - (i::text || ' days')::interval
    );

    if i % 3 = 0 then
      insert into public.linked_accounts (user_id, bank_name, account_id, status, last_synced_at, created_at, metadata, branch_label)
      values (new_id, banks[1 + (i % array_length(banks, 1))], 'filler-acct-' || i::text, 'active', now() - (i::text || ' hours')::interval, now() - (i::text || ' days')::interval, '{}'::jsonb, null);
    end if;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- SECTION 12: audit_logs (sample entries for the admin Audit Log page)
-- ----------------------------------------------------------------------------
insert into public.audit_logs (event_type, actor_user_id, target_user_id, ip_address, user_agent, metadata, created_at)
values
  ('freeze_created',      'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', '102.132.10.4',  'Mozilla/5.0 (demo)', '{"leak_id":"fee-leakage"}'::jsonb, now() - interval '25 days'),
  ('freeze_created',      'a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', '105.28.40.11',  'Mozilla/5.0 (demo)', '{"leak_id":"debit-orders"}'::jsonb, now() - interval '40 days'),
  ('consent_changed',     'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', '102.132.10.4',  'Mozilla/5.0 (demo)', '{"action":"account_linked","bank_name":"Capitec"}'::jsonb, now() - interval '90 days'),
  ('user_provisioned',    'a0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000005', '196.25.1.2',    'Mozilla/5.0 (demo)', '{"email":"partner.demo@tracepay.co.za","role":"partner"}'::jsonb, now() - interval '55 days'),
  ('user_provisioned',    'a0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000004', '196.25.1.2',    'Mozilla/5.0 (demo)', '{"email":"investor.demo@tracepay.co.za","role":"investor"}'::jsonb, now() - interval '58 days'),
  ('business_member_removed', 'a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000003', '105.28.40.11', 'Mozilla/5.0 (demo)', '{"invited_email":"sipho.demo@tracepay.co.za","note":"demo-only, no-op"}'::jsonb, now() - interval '1 day');

-- ----------------------------------------------------------------------------
-- Done. Login credentials:
-- ----------------------------------------------------------------------------
select email, 'TracePayDemo2026!' as password
from auth.users
where email in (
  'thabo.demo@tracepay.co.za','nomvula.demo@tracepay.co.za','sipho.demo@tracepay.co.za',
  'investor.demo@tracepay.co.za','partner.demo@tracepay.co.za','admin.demo@tracepay.co.za',
  'pnp.demo@tracepay.co.za','checkers.demo@tracepay.co.za','clicks.demo@tracepay.co.za',
  'mrprice.demo@tracepay.co.za','woolworths.demo@tracepay.co.za'
)
order by email;
