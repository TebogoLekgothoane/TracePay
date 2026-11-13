-- Categories the deterministic rules and the AI can now assign to lines that previously had no
-- fitting home: hairdressers and salons, school and university fees, and fees owed to the state
-- (company registration, traffic fines). `name` is unique, so this is safe to run twice.
insert into public.categories (name)
values ('Personal Care'), ('Education'), ('Government & Fees')
on conflict (name) do nothing;
