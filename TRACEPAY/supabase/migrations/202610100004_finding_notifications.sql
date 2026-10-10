-- In-app notifications for new and materially changed findings.
-- One row per finding identity and signature generation.

create table public.finding_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  finding_id uuid not null references public.finding_registry (id) on delete cascade,
  dedupe_key text not null,
  channel text not null default 'in_app',
  delivery_status text not null default 'created',
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint finding_notifications_user_dedupe_key unique (user_id, dedupe_key),
  constraint finding_notifications_channel_check check (channel = 'in_app'),
  constraint finding_notifications_status_check check (
    delivery_status in ('created', 'read')
  ),
  constraint finding_notifications_dedupe_len check (
    char_length(dedupe_key) between 8 and 120
  ),
  constraint finding_notifications_title_len check (char_length(title) between 1 and 120),
  constraint finding_notifications_body_len check (char_length(body) between 1 and 400),
  constraint finding_notifications_read_pair check (
    (delivery_status = 'created' and read_at is null)
    or (delivery_status = 'read' and read_at is not null)
  )
);

comment on table public.finding_notifications is
  'In-app notices for finding observations. Not push, SMS, or savings.';

create index finding_notifications_user_created_idx
  on public.finding_notifications (user_id, created_at desc);

create or replace function public.finding_notifications_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id
      or new.finding_id is distinct from old.finding_id
      or new.dedupe_key is distinct from old.dedupe_key
      or new.channel is distinct from old.channel
      or new.title is distinct from old.title
      or new.body is distinct from old.body
      or new.created_at is distinct from old.created_at
    then
      raise exception 'notification identity is fixed';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.finding_notifications_guard() from public, anon, authenticated;
grant execute on function public.finding_notifications_guard() to authenticated;

create trigger finding_notifications_guard
  before update on public.finding_notifications
  for each row
  execute function public.finding_notifications_guard();

alter table public.finding_notifications enable row level security;

revoke all on table public.finding_notifications from public, anon;
grant select, insert, update on table public.finding_notifications to authenticated;

create policy "finding notifications select own"
  on public.finding_notifications
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "finding notifications insert own"
  on public.finding_notifications
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.finding_registry as finding
      where finding.id = finding_notifications.finding_id
        and finding.user_id = (select auth.uid())
    )
  );

create policy "finding notifications update own"
  on public.finding_notifications
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
