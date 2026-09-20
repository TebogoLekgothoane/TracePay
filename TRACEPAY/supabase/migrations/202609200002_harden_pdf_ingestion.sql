alter table public.transactions
  drop constraint if exists transactions_statement_id_date_description_amount_balance_key;

alter table public.transactions
  alter column currency drop not null;

create index if not exists statement_imports_user_id_idx
  on public.statement_imports (user_id);

create index if not exists transactions_user_id_idx
  on public.transactions (user_id);

create index if not exists transactions_statement_id_idx
  on public.transactions (statement_id);

create index if not exists transactions_date_idx
  on public.transactions (date);

drop policy if exists "statement imports are owned by the user" on public.statement_imports;
drop policy if exists "transactions are owned by the user" on public.transactions;
drop policy if exists "users can manage their statement files" on storage.objects;

create policy "statement imports select own"
  on public.statement_imports for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "statement imports insert own"
  on public.statement_imports for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "statement imports update own"
  on public.statement_imports for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "statement imports delete own"
  on public.statement_imports for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "transactions select own statement"
  on public.transactions for select to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.statement_imports statement
      where statement.id = transactions.statement_id
        and statement.user_id = (select auth.uid())
    )
  );

create policy "transactions insert own statement"
  on public.transactions for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.statement_imports statement
      where statement.id = transactions.statement_id
        and statement.user_id = (select auth.uid())
    )
  );

create policy "transactions update own statement"
  on public.transactions for update to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.statement_imports statement
      where statement.id = transactions.statement_id
        and statement.user_id = (select auth.uid())
    )
  )
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.statement_imports statement
      where statement.id = transactions.statement_id
        and statement.user_id = (select auth.uid())
    )
  );

create policy "transactions delete own statement"
  on public.transactions for delete to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.statement_imports statement
      where statement.id = transactions.statement_id
        and statement.user_id = (select auth.uid())
    )
  );

create policy "statement files insert own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'statements'
    and (storage.foldername(name))[1] = 'statements'
    and (storage.foldername(name))[2] = (select auth.uid()::text)
  );

create policy "statement files select own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'statements'
    and (storage.foldername(name))[1] = 'statements'
    and (storage.foldername(name))[2] = (select auth.uid()::text)
  );

create policy "statement files update own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'statements'
    and (storage.foldername(name))[1] = 'statements'
    and (storage.foldername(name))[2] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'statements'
    and (storage.foldername(name))[1] = 'statements'
    and (storage.foldername(name))[2] = (select auth.uid()::text)
  );

create policy "statement files delete own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'statements'
    and (storage.foldername(name))[1] = 'statements'
    and (storage.foldername(name))[2] = (select auth.uid()::text)
  );
