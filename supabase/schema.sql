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
