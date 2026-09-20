create extension if not exists pgcrypto;

create table if not exists public.statement_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_path text not null unique,
  file_name text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 20971520),
  status text not null default 'uploaded' check (status in ('uploaded', 'processing', 'processed', 'failed')),
  extraction_method text not null default 'unknown' check (extraction_method in ('text', 'table', 'ocr', 'unknown')),
  transaction_count integer not null default 0 check (transaction_count >= 0),
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  error_message text
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  statement_id uuid not null references public.statement_imports(id) on delete cascade,
  date date not null,
  description text not null,
  amount numeric(14, 2) not null,
  type text not null check (type in ('debit', 'credit')),
  balance numeric(14, 2),
  currency text not null default 'ZAR',
  source text not null default 'pdf' check (source = 'pdf'),
  created_at timestamptz not null default now(),
  unique (statement_id, date, description, amount, balance)
);

alter table public.statement_imports enable row level security;
alter table public.transactions enable row level security;

create policy "statement imports are owned by the user"
  on public.statement_imports for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "transactions are owned by the user"
  on public.transactions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('statements', 'statements', false)
on conflict (id) do update set public = false;

create policy "users can manage their statement files"
  on storage.objects for all
  using (bucket_id = 'statements' and (storage.foldername(name))[1] = 'statements' and (storage.foldername(name))[2] = auth.uid()::text)
  with check (bucket_id = 'statements' and (storage.foldername(name))[1] = 'statements' and (storage.foldername(name))[2] = auth.uid()::text);
