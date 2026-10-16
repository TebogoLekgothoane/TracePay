-- Append-only usage confirmations for subscription findings.
-- These answers explain a finding; they do not change detector or lifecycle status.

create table public.subscription_usage_confirmations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  finding_id uuid not null references public.finding_registry (id) on delete cascade,
  usage_answer text not null,
  confirmed_at timestamptz not null default now(),
  constraint subscription_usage_answer_check check (
    usage_answer in ('frequently', 'sometimes', 'rarely', 'never', 'not_sure')
  )
);

comment on table public.subscription_usage_confirmations is
  'Append-only user usage answers for subscription findings. Answers do not resolve findings or record savings.';

create index subscription_usage_user_finding_confirmed_idx
  on public.subscription_usage_confirmations (user_id, finding_id, confirmed_at desc);

create or replace function public.subscription_usage_confirmations_append_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'subscription usage confirmations are append-only';
end;
$$;

revoke all on function public.subscription_usage_confirmations_append_only() from public, anon, authenticated;
grant execute on function public.subscription_usage_confirmations_append_only() to authenticated;

create trigger subscription_usage_confirmations_no_update
  before update on public.subscription_usage_confirmations
  for each row execute function public.subscription_usage_confirmations_append_only();

create trigger subscription_usage_confirmations_no_delete
  before delete on public.subscription_usage_confirmations
  for each row execute function public.subscription_usage_confirmations_append_only();

alter table public.subscription_usage_confirmations enable row level security;

revoke all on table public.subscription_usage_confirmations from public, anon, authenticated;
grant select, insert on table public.subscription_usage_confirmations to authenticated;

create policy "subscription usage confirmations select own"
  on public.subscription_usage_confirmations
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "subscription usage confirmations insert own"
  on public.subscription_usage_confirmations
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.finding_registry as finding
      where finding.id = subscription_usage_confirmations.finding_id
        and finding.user_id = (select auth.uid())
        and finding.leak_type = 'subscription_leak'
    )
  );
