-- Supabase default privileges grant every command to authenticated.
-- Keep finding rows readable and updatable by the owner, without truncate or delete.

revoke all on table public.finding_registry from public, anon, authenticated;
grant select, insert, update on table public.finding_registry to authenticated;
