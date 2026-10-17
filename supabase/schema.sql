-- sticky-not schema
-- Run this once in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query)

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text,
  avatar text,
  created_at timestamptz not null default now()
);

-- for databases created before passwords were added
alter table public.profiles add column if not exists password_hash text;

create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  icon text,
  created_at timestamptz not null default now()
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  folder_id uuid references public.folders (id) on delete set null,
  title text not null default '',
  theme integer not null default 0,
  blocks jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists folders_user_idx on public.folders (user_id);
create index if not exists notes_user_idx on public.notes (user_id);
create index if not exists notes_folder_idx on public.notes (folder_id);

-- The app only talks to Supabase through the Express server (service_role key),
-- so direct browser access is locked down with Row Level Security and no
-- user policies.
alter table public.profiles enable row level security;
alter table public.folders enable row level security;
alter table public.notes enable row level security;

-- ── Collaboration feature migration ────────────────────────────────────────
-- Adds version tracking to notes and a shares table for invitations.

alter table public.notes add column if not exists version integer not null default 1;
alter table public.notes add column if not exists updated_by uuid references public.profiles (id) on delete set null;

create table if not exists public.shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  invitee_id uuid not null references public.profiles (id) on delete cascade,
  note_id uuid references public.notes (id) on delete cascade,
  folder_id uuid references public.folders (id) on delete cascade,
  kind text not null check (kind in ('note', 'folder')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint shares_one_target check ((note_id is null) <> (folder_id is null)),
  constraint shares_not_self check (owner_id <> invitee_id)
);

create unique index if not exists shares_invitee_note_uq on public.shares (invitee_id, note_id) where note_id is not null;
create unique index if not exists shares_invitee_folder_uq on public.shares (invitee_id, folder_id) where folder_id is not null;
create index if not exists shares_invitee_idx on public.shares (invitee_id, status);
create index if not exists shares_owner_idx on public.shares (owner_id, status);

alter table public.shares enable row level security;

-- ── Work tracker: clients, owners, transactions ────────────────────────────
-- owners.national_id_enc and owners.password_enc hold AES-256-GCM ciphertext
-- (server/vault.js). Plain text is never stored.

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists clients_user_name_uq on public.clients (user_id, lower(name));

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

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete restrict,
  number text not null,
  part_title text not null,
  type text not null,
  notes text not null default '',
  status text not null default 'ongoing' check (status in ('ongoing', 'done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists transactions_user_number_uq on public.transactions (user_id, lower(number));
create index if not exists transactions_user_status_idx on public.transactions (user_id, status);
create index if not exists transactions_client_idx on public.transactions (client_id);

alter table public.clients enable row level security;
alter table public.owners enable row level security;
alter table public.transactions enable row level security;

-- ── Accounts: money owed by tracker clients ───────────────────────────────
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  item text not null,
  notes text not null default '',
  paid boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists accounts_user_paid_idx on public.accounts (user_id, paid);
create index if not exists accounts_client_idx on public.accounts (client_id);
alter table public.accounts enable row level security;
