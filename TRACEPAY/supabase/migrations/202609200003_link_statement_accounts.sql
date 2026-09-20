alter table public.statement_imports
  add column if not exists account_id uuid references public.accounts(id) on delete set null;

create index if not exists statement_imports_account_id_idx
  on public.statement_imports (account_id);

drop policy if exists "statement imports insert own" on public.statement_imports;
drop policy if exists "statement imports update own" on public.statement_imports;

create policy "statement imports insert own"
  on public.statement_imports for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      account_id is null
      or exists (
        select 1 from public.accounts account
        where account.id = statement_imports.account_id
          and account.user_id = (select auth.uid())
      )
    )
  );

create policy "statement imports update own"
  on public.statement_imports for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (
      account_id is null
      or exists (
        select 1 from public.accounts account
        where account.id = statement_imports.account_id
          and account.user_id = (select auth.uid())
      )
    )
  );
