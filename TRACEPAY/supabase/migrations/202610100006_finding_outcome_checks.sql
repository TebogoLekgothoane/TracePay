-- One outcome check per finding and statement import.
-- A check records what the detector saw. It does not resolve a finding or record savings.

create table public.finding_outcome_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  finding_id uuid not null references public.finding_registry (id) on delete cascade,
  statement_import_id uuid not null references public.statement_imports (id) on delete cascade,
  outcome text not null,
  basis text not null,
  checked_at timestamptz not null default now(),
  constraint finding_outcome_checks_finding_import_key unique (finding_id, statement_import_id),
  constraint finding_outcome_checks_outcome_check check (
    outcome in (
      'still_present',
      'no_longer_detected',
      'insufficient_new_history',
      'materially_changed'
    )
  ),
  constraint finding_outcome_checks_basis_check check (
    char_length(basis) between 1 and 400
    and basis !~ '[0-9]{6,}'
  )
);

comment on table public.finding_outcome_checks is
  'Detector comparisons after a later statement import. Not a resolution or a saved amount.';

create index finding_outcome_checks_user_finding_checked_idx
  on public.finding_outcome_checks (user_id, finding_id, checked_at);

create or replace function public.finding_outcome_checks_append_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'finding outcome checks are append-only';
end;
$$;

revoke all on function public.finding_outcome_checks_append_only() from public, anon, authenticated;
grant execute on function public.finding_outcome_checks_append_only() to authenticated;

create trigger finding_outcome_checks_no_update
  before update on public.finding_outcome_checks
  for each row
  execute function public.finding_outcome_checks_append_only();

create trigger finding_outcome_checks_no_delete
  before delete on public.finding_outcome_checks
  for each row
  execute function public.finding_outcome_checks_append_only();

alter table public.finding_outcome_checks enable row level security;

revoke all on table public.finding_outcome_checks from public, anon, authenticated;
grant select, insert on table public.finding_outcome_checks to authenticated;

create policy "finding outcome checks select own"
  on public.finding_outcome_checks
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "finding outcome checks insert own"
  on public.finding_outcome_checks
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.finding_registry as finding
      where finding.id = finding_outcome_checks.finding_id
        and finding.user_id = (select auth.uid())
    )
    and exists (
      select 1
      from public.statement_imports as statement
      where statement.id = finding_outcome_checks.statement_import_id
        and statement.user_id = (select auth.uid())
    )
  );
