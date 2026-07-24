-- Epic 9 follow-up — durable lobby state (supersedes ADR-0003's "no database").
--
-- A single `lobbies` row per PIN is the SOURCE OF TRUTH for the current song,
-- versioned by a server-owned `rev`. Realtime Broadcast stays the low-latency
-- nudge and Presence keeps the live audience count, but neither is authoritative
-- any more: a lost Broadcast or a host reload no longer strands the audience,
-- because the row is always re-fetchable. A new joiner and a stranded viewer take
-- the exact same path — read the row — and every transport (row read,
-- postgres_changes, Broadcast) is reduced by `rev`, so lost / duplicate /
-- out-of-order events are all harmless.
--
-- The PIN is the capability: a public display code. Anyone who knows it may read
-- the lobby and — through the publish/end functions — write it, which is the same
-- trust the Realtime channel already grants everyone subscribed to lobby:<PIN>.
-- Ended lobbies are KEPT (ended_at is set, the row is never deleted).

create table if not exists public.lobbies (
  pin        text primary key,
  payload    jsonb not null,
  rev        bigint not null default 0,
  updated_at timestamptz not null default now(),
  ended_at   timestamptz
);

-- postgres_changes ships the whole row, so a viewer gets the new payload inline
-- rather than only the primary key.
alter table public.lobbies replica identity full;

alter table public.lobbies enable row level security;

-- Reading is open to anonymous viewers: joining is anonymous, and
-- postgres_changes enforces this very SELECT policy. Direct writes are NOT
-- granted — they go through the security-definer functions below, the one
-- sanctioned write path. Postgres checks BOTH the table privilege and the RLS
-- policy, so a viewer needs the SELECT grant as well as the permissive policy;
-- INSERT/UPDATE/DELETE stay ungranted, so the functions are the only way in.
grant select on public.lobbies to anon, authenticated;

create policy "lobbies select" on public.lobbies
  for select to anon, authenticated using (true);

-- Publish (open or advance) a lobby: upsert the payload and bump the
-- server-owned rev. Server-owned so the revision stays monotonic even across a
-- host reload — the in-memory host has no rev of its own to resume from. Returns
-- the new rev for the host to stamp onto its Broadcast.
create or replace function public.lobby_publish(p_pin text, p_payload jsonb)
  returns bigint
  language sql
  security definer
  set search_path = public
as $$
  insert into public.lobbies as l (pin, payload, rev, updated_at, ended_at)
  values (p_pin, p_payload, 1, now(), null)
  on conflict (pin) do update
    set payload = excluded.payload,
        rev = l.rev + 1,
        updated_at = now(),
        ended_at = null
  returning rev;
$$;

-- End a lobby: mark it and keep the row (ended lobbies are retained).
create or replace function public.lobby_end(p_pin text)
  returns void
  language sql
  security definer
  set search_path = public
as $$
  update public.lobbies set ended_at = now(), updated_at = now() where pin = p_pin;
$$;

grant execute on function public.lobby_publish(text, jsonb) to anon, authenticated;
grant execute on function public.lobby_end(text) to anon, authenticated;

-- Viewers follow the row over Realtime.
alter publication supabase_realtime add table public.lobbies;
