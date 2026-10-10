-- Append-only user responses to a finding.
-- These rows do not change detection status and are not outcome checks.

create table public.finding_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  finding_id uuid not null references public.finding_registry (id) on delete cascade,
  action_type text not null,
  note text,
  created_at timestamptz not null default now(),
  constraint finding_actions_type_check check (
    action_type in ('reviewed', 'steps_completed', 'dismissed', 'not_applicable')
  ),
  constraint finding_actions_note_check check (
    note is null
    or (
      char_length(note) between 1 and 280
      and note !~ '[0-9]{6,}'
    )
  )
);

comment on table public.finding_actions is
  'Append-only user responses. Dismissing a finding does not resolve detection.';

create index finding_actions_user_finding_created_idx
  on public.finding_actions (user_id, finding_id, created_at);

create or replace function public.finding_actions_append_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'finding actions are append-only';
end;
$$;

revoke all on function public.finding_actions_append_only() from public, anon, authenticated;
grant execute on function public.finding_actions_append_only() to authenticated;

create trigger finding_actions_no_update
  before update on public.finding_actions
  for each row
  execute function public.finding_actions_append_only();

create trigger finding_actions_no_delete
  before delete on public.finding_actions
  for each row
  execute function public.finding_actions_append_only();

alter table public.finding_actions enable row level security;

revoke all on table public.finding_actions from public, anon, authenticated;
grant select, insert on table public.finding_actions to authenticated;

create policy "finding actions select own"
  on public.finding_actions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "finding actions insert own"
  on public.finding_actions
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.finding_registry as finding
      where finding.id = finding_actions.finding_id
        and finding.user_id = (select auth.uid())
    )
  );
