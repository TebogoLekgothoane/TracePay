-- Append-only answers to targeted questions about findings.
-- An answer is what the user told us. It explains a finding; it never edits the
-- statement facts behind it or the detector's own confidence.

create table public.finding_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- "<kind>:<subject>", e.g. subscription_usage:netflix. Stable across detector
  -- versions, so an answer survives a re-analysis.
  question_key text not null,
  question_kind text not null,
  answer text not null,
  -- Describes the finding at answer time so a materially changed finding can be
  -- asked about again. Never holds personal data.
  signature text not null default '',
  status text not null default 'answered',
  answered_at timestamptz not null default now(),
  constraint finding_answers_key_check check (char_length(question_key) between 3 and 120),
  constraint finding_answers_kind_check check (
    question_kind in (
      'subscription_usage',
      'cancelled_in',
      'duplicate_expected',
      'data_usage',
      'insurance_cover',
      'bank_account'
    )
  ),
  constraint finding_answers_answer_check check (char_length(answer) between 1 and 40),
  constraint finding_answers_signature_check check (char_length(signature) <= 80),
  constraint finding_answers_status_check check (status in ('answered', 'skipped')),
  constraint finding_answers_skip_check check (status = 'answered' or answer = 'skipped')
);

comment on table public.finding_answers is
  'Append-only user answers to targeted questions about findings. The latest row per question_key wins; skipped rows are kept so a skipped question is not asked again until the finding changes.';

create index finding_answers_user_key_answered_idx
  on public.finding_answers (user_id, question_key, answered_at desc);

create or replace function public.finding_answers_append_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'finding answers are append-only';
end;
$$;

revoke all on function public.finding_answers_append_only() from public, anon, authenticated;
grant execute on function public.finding_answers_append_only() to authenticated;

create trigger finding_answers_no_update
  before update on public.finding_answers
  for each row execute function public.finding_answers_append_only();

create trigger finding_answers_no_delete
  before delete on public.finding_answers
  for each row execute function public.finding_answers_append_only();

alter table public.finding_answers enable row level security;

revoke all on table public.finding_answers from public, anon, authenticated;
grant select, insert on table public.finding_answers to authenticated;

create policy "finding answers select own"
  on public.finding_answers
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "finding answers insert own"
  on public.finding_answers
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
