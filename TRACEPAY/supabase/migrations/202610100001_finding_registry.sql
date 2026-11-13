-- Persistent identity for financial-intelligence findings.
-- detected_amount is the report's detected amount. It is not recovered or verified savings.

create table public.finding_registry (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  fingerprint text not null,
  leak_type text not null,
  detector_version text not null,
  account_id uuid references public.accounts (id) on delete set null,
  status text not null default 'open',
  material_signature text not null,
  signature_generation integer not null default 1,
  finding_focus text,
  root_cause_type text not null,
  analysis_status text not null,
  persistence text not null,
  detected_amount numeric(14, 2) not null,
  impact_kind text not null,
  impact_label text,
  period_start date,
  period_end date,
  evidence_highlights jsonb not null default '[]'::jsonb,
  first_detected_at timestamptz not null,
  last_seen_at timestamptz not null,
  last_absent_at timestamptz,
  last_statement_import_id uuid references public.statement_imports (id) on delete set null,
  -- Version-independent identity so a detector-version change updates the row in place.
  identity_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finding_registry_user_fingerprint_key unique (user_id, fingerprint),
  constraint finding_registry_user_identity_key unique (user_id, identity_key),
  constraint finding_registry_fingerprint_hex check (fingerprint ~ '^[0-9a-f]{16,64}$'),
  constraint finding_registry_identity_hex check (identity_key ~ '^[0-9a-f]{16,64}$'),
  constraint finding_registry_signature_hex check (material_signature ~ '^[0-9a-f]{16,64}$'),
  constraint finding_registry_detector_version_len check (
    char_length(detector_version) between 1 and 32
  ),
  constraint finding_registry_generation_positive check (signature_generation >= 1),
  constraint finding_registry_amount_nonnegative check (detected_amount >= 0),
  constraint finding_registry_period_order check (
    period_start is null or period_end is null or period_end >= period_start
  ),
  constraint finding_registry_focus_slug check (
    finding_focus is null or finding_focus ~ '^[a-z0-9_]{1,80}$'
  ),
  constraint finding_registry_status_check check (
    status in (
      'open',
      'explained',
      'action_recorded',
      'monitoring',
      'dismissed',
      'not_observed'
    )
  ),
  constraint finding_registry_leak_type_check check (
    leak_type in (
      'bank_fee_leak',
      'subscription_leak',
      'recurring_payment_leak',
      'spending_escalation_leak',
      'duplicate_payment_leak',
      'cash_usage_leak',
      'airtime_data_leak',
      'food_spending_leak',
      'transport_spending_leak',
      'unknown_recurring_payment'
    )
  ),
  constraint finding_registry_root_cause_check check (
    root_cause_type in (
      'frequency_increase',
      'amount_increase',
      'price_increase',
      'recurring_commitment',
      'fee_accumulation',
      'potential_duplicate',
      'behavioural_concentration',
      'merchant_concentration',
      'category_growth',
      'transaction_pattern',
      'insufficient_evidence',
      'unknown'
    )
  ),
  constraint finding_registry_analysis_status_check check (
    analysis_status in (
      'supported',
      'competing_explanations',
      'insufficient_evidence',
      'verification_required'
    )
  ),
  constraint finding_registry_persistence_check check (
    persistence in (
      'new',
      'temporary',
      'persistent',
      'increasing',
      'declining',
      'insufficient_history'
    )
  ),
  constraint finding_registry_impact_kind_check check (
    impact_kind in ('recurring', 'one_time', 'estimated')
  ),
  constraint finding_registry_impact_label_check check (
    impact_label is null
    or impact_label in (
      'detected_increase',
      'observed_fee_activity',
      'observed_recurring_payment',
      'potential_recovery_candidate'
    )
  ),
  constraint finding_registry_highlights_check check (
    jsonb_typeof(evidence_highlights) = 'array'
    and jsonb_array_length(evidence_highlights) <= 40
  )
);

create or replace function public.finding_registry_highlights_valid()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
    from jsonb_array_elements(new.evidence_highlights) as element
    where jsonb_typeof(element) <> 'object'
      or jsonb_typeof(element -> 'key') <> 'string'
      or jsonb_typeof(element -> 'label') <> 'string'
      or jsonb_typeof(element -> 'value') not in ('string', 'number', 'boolean')
      or lower(element ->> 'key') in (
        'description',
        'account',
        'account_number',
        'body',
        'raw',
        'reference',
        'transaction_ids'
      )
      or coalesce(element ->> 'value', '') ~ '\d{6,}'
      or coalesce(element ->> 'key', '') ~ '\d{6,}'
      or coalesce(element ->> 'label', '') ~ '\d{6,}'
  ) then
    raise exception 'evidence highlights must stay sanitised';
  end if;
  return new;
end;
$$;

revoke all on function public.finding_registry_highlights_valid() from public, anon, authenticated;

create trigger finding_registry_highlights_valid
  before insert or update on public.finding_registry
  for each row
  execute function public.finding_registry_highlights_valid();

comment on column public.finding_registry.detected_amount is
  'Detected amount copied from the intelligence report. Not recovered or verified savings.';

comment on column public.finding_registry.identity_key is
  'Detector-version-independent identity for user, leak type, and subject.';

comment on column public.finding_registry.status is
  'not_observed means the latest run did not include the finding. It does not mean resolved or saved.';

comment on column public.finding_registry.last_seen_at is
  'Last time a report included this finding.';

comment on column public.finding_registry.last_statement_import_id is
  'Last processed import that reconciled this row, including a run that did not observe it.';

create index finding_registry_user_status_idx
  on public.finding_registry (user_id, status);

create index finding_registry_account_id_idx
  on public.finding_registry (account_id);

create index finding_registry_statement_import_idx
  on public.finding_registry (last_statement_import_id);

create trigger finding_registry_updated_at
  before update on public.finding_registry
  for each row
  execute function public.set_updated_at();

alter table public.finding_registry enable row level security;

revoke all on table public.finding_registry from public, anon, authenticated;
grant select, insert, update on table public.finding_registry to authenticated;

create policy "finding registry select own"
  on public.finding_registry
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "finding registry insert own"
  on public.finding_registry
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      account_id is null
      or exists (
        select 1
        from public.accounts as account
        where account.id = finding_registry.account_id
          and account.user_id = (select auth.uid())
      )
    )
    and (
      last_statement_import_id is null
      or exists (
        select 1
        from public.statement_imports as statement
        where statement.id = finding_registry.last_statement_import_id
          and statement.user_id = (select auth.uid())
      )
    )
  );

create policy "finding registry update own"
  on public.finding_registry
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (
      account_id is null
      or exists (
        select 1
        from public.accounts as account
        where account.id = finding_registry.account_id
          and account.user_id = (select auth.uid())
      )
    )
    and (
      last_statement_import_id is null
      or exists (
        select 1
        from public.statement_imports as statement
        where statement.id = finding_registry.last_statement_import_id
          and statement.user_id = (select auth.uid())
      )
    )
  );
