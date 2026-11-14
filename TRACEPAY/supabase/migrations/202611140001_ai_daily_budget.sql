-- Daily budget for paid AI categorisation, counted per user in the database so every
-- backend instance shares one count. Only the service role can call the function.

create table if not exists public.ai_budget_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null default now(),
  used integer not null default 0 check (used >= 0)
);

alter table public.ai_budget_usage enable row level security;
-- No policies: clients cannot read or write this table directly.

create or replace function public.consume_ai_budget(
  p_user_id uuid,
  p_amount integer,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_amount <= 0 then
    return true;
  end if;

  insert into public.ai_budget_usage as budget (user_id, window_start, used)
  values (p_user_id, now(), 0)
  on conflict (user_id) do nothing;

  -- Start a new window once the previous one has passed.
  update public.ai_budget_usage as budget
     set window_start = now(),
         used = 0
   where budget.user_id = p_user_id
     and now() - budget.window_start >= make_interval(secs => p_window_seconds);

  -- The row lock taken here serialises concurrent imports for the same user.
  update public.ai_budget_usage as budget
     set used = budget.used + p_amount
   where budget.user_id = p_user_id
     and budget.used + p_amount <= p_limit;

  return found;
end;
$$;

revoke all on function public.consume_ai_budget(uuid, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_ai_budget(uuid, integer, integer, integer) to service_role;
