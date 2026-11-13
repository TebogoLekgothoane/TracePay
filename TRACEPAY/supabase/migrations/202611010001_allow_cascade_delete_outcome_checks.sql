-- Removing an account (or its statement imports) must be able to clear the
-- finding outcome checks that point at them. Those rows stay append-only for
-- everything else: direct updates and direct deletes are still rejected, and
-- only a delete fired by a foreign-key cascade (trigger depth > 1) is allowed.

create or replace function public.finding_outcome_checks_append_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'finding outcome checks are append-only';
end;
$$;
