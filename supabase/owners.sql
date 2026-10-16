-- ── Owners table only (works on its own in the SQL Editor) ───────────────
-- Needs public.profiles to exist (created by supabase/schema.sql).
-- Safe to run more than once.
-- national_id_enc / password_enc hold AES-256-GCM ciphertext (server/vault.js).

create table if not exists public.owners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  part_address text not null,
  national_id_enc text not null,
  national_id_last4 text not null,
  password_enc text,
  has_password boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists owners_user_addr_uq on public.owners (user_id, lower(part_address));

alter table public.owners enable row level security;
