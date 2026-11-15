-- One row per sign-in SMS the backend asked BulkSMS to send, so SMS spend can be read on the dashboard.
-- Holds counts only: never phone numbers, codes or message text.
-- Written and read by the backend with the service role; clients have no access.

create table if not exists public.sms_usage_events (
  id uuid primary key default gen_random_uuid(),
  -- sent: BulkSMS accepted the message (billable). failed: rejected or unreachable (not billed).
  outcome text not null,
  -- Message parts billed (a long message is split into several credits).
  parts integer not null default 1,
  created_at timestamptz not null default now(),
  constraint sms_usage_events_outcome_check check (outcome in ('sent', 'failed')),
  constraint sms_usage_events_parts_check check (parts between 0 and 20)
);

create index if not exists sms_usage_events_created_idx
  on public.sms_usage_events (created_at desc);

alter table public.sms_usage_events enable row level security;

revoke all on table public.sms_usage_events from public, anon, authenticated;
-- No policies: only the service role (which bypasses RLS) can read or write.
