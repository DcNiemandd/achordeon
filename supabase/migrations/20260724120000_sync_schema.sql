-- Epic 10 ▸ Supabase sync backend — relational library schema + RLS.
-- Spec: PRD-INFRASTRUCTURE.md §5, ADR-0004 (handoff sync), ADR-0009 (one account).
--
-- The paid tier's automatic sync target. IndexedDB stays the client's source of
-- truth (§1); these tables are a dumb push/pull mirror of the same Snapshot,
-- reconciled per-row by last-write-wins. Every row is owned by `auth.uid()` and
-- fenced by RLS, so one account can never read or write another's library —
-- which is what lets the anon/publishable key ship in the browser (ADR-0003).
--
-- Timestamps are `bigint` epoch-ms, NOT `timestamptz`: `updated_at` is the
-- CLIENT's own LWW clock (the value carried in the Snapshot), and sync compares
-- it directly against the local number. A server `now()` here would be a second,
-- disagreeing clock. Deletes are soft everywhere — `deleted_at` is a tombstone
-- the sync carries, never a row removal (§1).

-- profiles — the account row, keyed by the Supabase auth user (ADR-0009: the
-- account IS `auth.users.id`, provider-agnostic). Holds the server-owned tier
-- flag and mirrors the local `user` record (its client uuid lives in
-- `record_id` so a pull can reconstruct that row faithfully for the LWW merge).
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  plan       text not null default 'free' check (plan in ('free', 'pro')),
  record_id  uuid,
  username   text not null default '',
  settings   jsonb not null default '{}'::jsonb,
  created_at bigint not null default 0,
  updated_at bigint not null default 0,
  deleted_at bigint
);

create table if not exists public.songs (
  id         uuid primary key,
  owner      uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name       text not null default '',
  content    text not null default '',
  favorite   boolean not null default false,
  settings   jsonb not null default '{}'::jsonb,
  cache      jsonb not null default '{}'::jsonb,
  created_at bigint not null default 0,
  updated_at bigint not null default 0,
  deleted_at bigint
);

create table if not exists public.songbooks (
  id         uuid primary key,
  owner      uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name       text not null default '',
  title      text not null default '',
  subtitle   text not null default '',
  author     text not null default '',
  settings   jsonb not null default '{}'::jsonb,
  created_at bigint not null default 0,
  updated_at bigint not null default 0,
  deleted_at bigint
);

-- The ordered entries of a songbook, flattened (PRD-INFRASTRUCTURE.md §5). A
-- `song_id` MAY repeat within one songbook (a "slot"), so `position` — not
-- `song_id` — completes the key. Rewritten wholesale when a songbook's order
-- changes; it rides that songbook's own `updated_at`, so it needs no timestamp
-- of its own.
create table if not exists public.songbook_songs (
  songbook_id uuid not null references public.songbooks (id) on delete cascade,
  song_id     uuid not null,
  position    integer not null,
  owner       uuid not null references auth.users (id) on delete cascade default auth.uid(),
  primary key (songbook_id, position)
);

-- Sync pulls "rows changed since I last pulled" — index the clock it filters on.
create index if not exists songs_owner_updated_idx
  on public.songs (owner, updated_at);
create index if not exists songbooks_owner_updated_idx
  on public.songbooks (owner, updated_at);
create index if not exists songbook_songs_owner_idx
  on public.songbook_songs (owner);

alter table public.profiles enable row level security;
alter table public.songs enable row level security;
alter table public.songbooks enable row level security;
alter table public.songbook_songs enable row level security;

-- Every policy is the same fence: a row is visible and writable only to the
-- account that owns it. `profiles` fences on its own `id` (= the account);
-- the library tables fence on `owner`.
create policy "profiles own" on public.profiles
  for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "songs own" on public.songs
  for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());

create policy "songbooks own" on public.songbooks
  for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());

create policy "songbook_songs own" on public.songbook_songs
  for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());

-- A profile is minted the moment an account is created, so a first sign-in
-- already has a `free` tier to read (the tier flag flips to `pro` in the
-- dashboard, or later via the monetization webhook — never from the client).
create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
    on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
