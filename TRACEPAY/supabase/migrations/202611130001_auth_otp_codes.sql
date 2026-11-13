-- One-time SMS codes for phone auth (replaces Twilio Verify).
-- Only the auth backend (service role) reads or writes this table. Codes are stored as SHA-256 hashes.

create table if not exists public.auth_otp_codes (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  code_hash text not null,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists auth_otp_codes_phone_created_idx
  on public.auth_otp_codes (phone, created_at desc);

alter table public.auth_otp_codes enable row level security;

revoke all on public.auth_otp_codes from anon, authenticated;
