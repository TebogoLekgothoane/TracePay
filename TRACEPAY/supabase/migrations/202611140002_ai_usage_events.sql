-- One row per call to a paid AI provider, so usage and cost can be read per feature.
-- Holds counts and token totals only: never prompts, responses, descriptions or user ids.
-- Written and read by the backend with the service role; clients have no access.

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  -- What the call was for, e.g. transaction_categorisation, subscription_merchant_labels.
  feature text not null,
  provider text not null,
  model text not null default 'unknown',
  -- success: usable answer. rejected: answered but nothing passed validation. failed: no answer.
  outcome text not null,
  -- Transactions or strings sent in the call.
  items integer not null default 0,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens integer not null default 0,
  duration_ms integer,
  created_at timestamptz not null default now(),
  constraint ai_usage_events_feature_len check (char_length(feature) between 1 and 60),
  constraint ai_usage_events_provider_len check (char_length(provider) between 1 and 40),
  constraint ai_usage_events_model_len check (char_length(model) between 1 and 120),
  constraint ai_usage_events_outcome_check check (outcome in ('success', 'rejected', 'failed')),
  constraint ai_usage_events_counts_check check (
    items >= 0 and prompt_tokens >= 0 and completion_tokens >= 0 and total_tokens >= 0
  )
);

create index if not exists ai_usage_events_created_idx
  on public.ai_usage_events (created_at desc);

alter table public.ai_usage_events enable row level security;

revoke all on table public.ai_usage_events from public, anon, authenticated;
-- No policies: only the service role (which bypasses RLS) can read or write.
