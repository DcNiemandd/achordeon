-- Epic 9 ▸ subtask 6 — append-only lobby analytics (ADR-0003).
--
-- A write-only history of lobby lifecycle events. It is NEVER on the live
-- Presence path: the app writes to it best-effort and fire-and-forget, and
-- nothing ever reads it back at runtime. `song_ref` travels; song content never
-- does.

create table if not exists public.lobby_events (
  id         uuid primary key default gen_random_uuid(),
  pin        text not null,
  event      text not null check (event in ('created', 'song_changed')),
  song_ref   uuid,
  owner      uuid not null references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists lobby_events_owner_idx on public.lobby_events (owner);

alter table public.lobby_events enable row level security;

-- Insert-by-owner: a signed-in host may only log rows it owns (Epic 10 wires the
-- auth that populates `auth.uid()`; until then inserts are simply denied, which
-- is fine — analytics is not load-bearing).
create policy "lobby_events insert own"
  on public.lobby_events
  for insert
  to authenticated
  with check (owner = auth.uid());

-- Owner may read back its own history (e.g. a future dashboard).
create policy "lobby_events select own"
  on public.lobby_events
  for select
  to authenticated
  using (owner = auth.uid());

-- No update/delete policies: RLS denies both, which is what makes the table
-- append-only.
