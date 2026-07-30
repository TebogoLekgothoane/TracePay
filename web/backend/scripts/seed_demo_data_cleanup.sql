-- ============================================================================
-- Cleanup for seed_demo_data.sql
-- ============================================================================
-- Deletes everything the seed script created, matched purely by the demo
-- email patterns used there ('%.demo@tracepay.co.za' and the filler users'
-- 'demo-filler-%@tracepay.co.za') -- never touches any other account.
-- Run this before re-running seed_demo_data.sql, or after your demo video
-- is recorded if you want the project clean again.
-- ============================================================================

do $$
declare
  demo_ids uuid[];
begin
  select array_agg(id) into demo_ids
  from auth.users
  where email like '%.demo@tracepay.co.za' or email like 'demo-filler-%@tracepay.co.za';

  if demo_ids is null then
    raise notice 'No demo accounts found -- nothing to clean up.';
    return;
  end if;

  delete from public.audit_logs where actor_user_id = any(demo_ids) or target_user_id = any(demo_ids);
  delete from public.redemptions where user_id = any(demo_ids);
  delete from public.business_memberships where owner_user_id = any(demo_ids) or member_user_id = any(demo_ids);
  delete from public.frozen_items where user_id = any(demo_ids);
  delete from public.analysis_results where user_id = any(demo_ids);
  delete from public.transactions where user_id = any(demo_ids);
  delete from public.linked_accounts where user_id = any(demo_ids);
  delete from public.account_settings where user_id = any(demo_ids);

  -- Un-assign the demo partner from the shoprite offer (leaves the offer
  -- itself in place -- it's a shared seed row from alembic migration 0010,
  -- not something this script created).
  update public.partners set owner_user_id = null where owner_user_id = any(demo_ids);

  delete from public.profiles where id = any(demo_ids);
  delete from auth.identities where user_id = any(demo_ids);
  delete from auth.users where id = any(demo_ids);

  raise notice 'Removed % demo accounts and their data.', array_length(demo_ids, 1);
end $$;
