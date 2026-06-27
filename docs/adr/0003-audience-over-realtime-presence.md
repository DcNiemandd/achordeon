# 3. Audience runs over Supabase Realtime Presence, with no database for lobby state

Date: 2026-06-27

## Status

Accepted

## Context

A performer (host) opens a Lobby; viewers join via a PIN / QR code and follow the
currently selected Song in real time. The lobby is one-time and ends when the
performer ends it. The glossary describes lobbies as "an array on the backend"
with the PIN "deduplicated at generation".

Taken literally, "an array on the backend" suggests a shared in-memory variable on
a server. That does not exist in this stack: Supabase **Edge Functions are
stateless** — ephemeral isolates, multiple instances, no shared memory across
invocations — so a global `lobbies` array there would be empty or inconsistent
depending on which isolate served the request.

What a late joiner needs is the **current** state immediately (the selected Song
and the setlist Summary), not just future changes. And PIN "dedup at generation"
implies some global view of which PINs are live.

### Options

- **A — Supabase Realtime Presence.** Presence is an in-memory CRDT held by the
  Realtime service and synced to every subscriber on a channel. The host tracks
  the lobby state into Presence; a channel per PIN. No database, no schema.
  Ephemeral by nature — when the host disconnects, its Presence entry is evicted,
  which _is_ "the lobby ends when the performer ends it". Weakness: there is no
  global registry of channels, so PIN dedup has nothing central to check against;
  and the host's tab is the source of truth (a host reload drops the lobby).

- **B — Postgres table + Realtime subscription.** A `lobbies` row holds the
  current selection; viewers subscribe to `postgres_changes`. Durable, queryable,
  a global registry for free, survives host reload. But it writes to the database
  on **every** prev/next tap during a performance, needs schema + RLS + a
  stale-row cleanup job, all for data that is inherently throwaway.

## Decision

Adopt **Option A**. The "array of lobbies" lives in **Realtime Presence**, not in
our code or our database.

- Channel per lobby, named by PIN.
- The host `track()`s lobby state into Presence as `{ currentSongObject, summary }`
  — the _full_ current Song (content + settings). The Presence state **is** the
  render payload; the viewer renders it locally with the same renderer. The
  Summary travels once, with the lobby state.
- A late joiner subscribes and `onPresenceSync` delivers the current song +
  summary immediately — no "joined between changes, saw nothing" gap.
- A song change re-tracks (or Broadcasts) the new `currentSongObject`.
- Audience count = Presence of the viewers on the channel.
- Lobby ends when the host disconnects (Presence auto-evicts) — no cleanup job.

PIN allocation is **random with no dedup registry**: ~5 chars from an unambiguous
alphabet (no `0/O/1/I`); at this scale collisions are negligible, and a viewer
joining a PIN with no host Presence simply sees "lobby not found".

Lobby **analytics** is handled separately by an append-only `lobby_events` table —
this is a write-only history, never a live registry, so it does not reintroduce a
database into the live path.

## Consequences

- The whole live Audience path is database-free: no schema, no RLS for lobbies, no
  per-tap writes, no stale-lobby sweeping.
- "One-time lobby that ends when the performer ends it" falls out of Presence's
  connection lifecycle for free.
- The host's tab is authoritative and must stay open during a performance (it is).
  A host reload drops the lobby and forces a re-host — accepted, since concurrent
  reload-resilience is not a goal.
- "Dedup at generation" (glossary) is satisfied probabilistically, not by a
  central check; the PIN format is unchanged, so a registry table can be added
  later if concurrency ever makes collisions or live-lobby discovery matter.
- Sending the full Song object on the wire keeps the viewer renderer identical to
  the host's, at the cost of a larger payload than sending an id — acceptable for
  a single song.
