-- Website waitlist. Visitors can add themselves; nobody but the service role can read the list.

create table public.waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  -- Stored lower-case by the website so the same address is only added once.
  email text not null,
  interests text[] not null default '{}',
  source text not null default 'website',
  -- When the visitor ticked the box agreeing to be emailed about the launch.
  consented_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint waitlist_signups_email_key unique (email),
  constraint waitlist_signups_email_len check (char_length(email) between 5 and 254),
  constraint waitlist_signups_interests_check check (
    interests <@ array['individual', 'business', 'accountant']::text[]
  ),
  constraint waitlist_signups_source_len check (char_length(source) between 1 and 40)
);

alter table public.waitlist_signups enable row level security;

revoke all on table public.waitlist_signups from public, anon, authenticated;
grant insert (email, interests, source) on table public.waitlist_signups to anon;

-- Insert only. There is deliberately no select, update or delete policy for anyone else.
create policy "waitlist anon insert"
  on public.waitlist_signups
  for insert
  to anon
  with check (true);
