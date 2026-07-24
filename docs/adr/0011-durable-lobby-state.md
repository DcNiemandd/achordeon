# 11. Lobby state is a durable, rev-versioned row; Presence and Broadcast become non-authoritative

Date: 2026-07-24

## Status

Accepted (supersedes the "no database for lobby state" decision of ADR-0003;
the rest of ADR-0003 — a channel per PIN, Presence for the audience count, the
PIN format — still stands).

## Context

ADR-0003 put the whole live Audience path on Supabase Realtime: the host tracked
the current song into Presence, a song change re-tracked (or Broadcast) it, and a
viewer read the host's Presence entry on its first sync. In practice, viewers
sometimes **missed a song change**:

- A **Broadcast is fire-and-forget** — no ack, no retry, no ordering. A dropped
  packet left a viewer stranded on the previous song with no recovery path.
- Realtime does **not** diff a Presence meta-update to viewers already
  subscribed, and the viewer deliberately applied the host's Presence entry only
  on its **first** sighting (to avoid clobbering a fresher Broadcast with the
  stale join-time cache). So after join, Broadcast was the _only_ live path — the
  single point of failure above — and there was nothing to fall back to.
- There was **no durable truth** anywhere: a missed event and a new joiner were
  different code paths, and the missed-event path had no backstop. A host reload
  also dropped the lobby entirely.

The heavy full-Song payload living in Presence meta was also what made a viewer
freeze while the performer tapped quickly through a book.

## Decision

Introduce a durable `public.lobbies` row as the **single source of truth** for a
lobby's current song, and demote Realtime to a delivery optimisation.

- **The row** — `{ pin, payload jsonb, rev bigint, updated_at, ended_at }`, one
  per PIN. `payload` is the same self-sufficient `LobbyPayload` (full Song +
  resolved settings + summary) a viewer renders locally.
- **`rev` is server-owned.** `lobby_publish(pin, payload)` upserts and returns
  `rev + 1`, so the revision is monotonic **even across a host reload** — the
  in-memory host keeps no rev of its own to resume from.
- **Every transport feeds one reducer, gated by `rev`.** A viewer applies an
  update only if `rev` is strictly greater than the highest it has applied. The
  three transports are: the join-time row read (and manual re-reads), a
  `postgres_changes` stream on the row (durable), and a Broadcast of the same
  `{ rev, payload }` (low-latency nudge). Lost, duplicated and out-of-order
  events are therefore all harmless.
- **Presence is liveness only.** The host tracks `{ role: 'host' }`; the payload
  no longer rides Presence meta. Presence still yields the audience count.
- **A new joiner and a stranded viewer take the same path: read the row.** The
  join reads it after the subscription is live (so a change during setup arrives
  as a `postgres_changes` event, not a missed one). A manual **Re-sync** button
  re-reads it — the explicit recovery, though the reducer usually self-heals
  within one event.
- **Ending keeps the row.** `lobby_end(pin)` sets `ended_at`; the row is never
  deleted. A host reload no longer ends a lobby (the row persists, `ended_at`
  null), which is a resilience gain over the Presence-lifecycle model.

The PIN is treated as a **capability**: a public display code. Reads are open to
`anon`; writes go only through the two `security definer` functions (also granted
to `anon`), which is the same trust the Realtime channel already grants everyone
subscribed to `lobby:<PIN>`. There is no per-host identity to scope by until auth
(ADR-0009) lands; a `host_token` guard can be added then without a data model
change.

## Consequences

- A dropped Broadcast, an out-of-order delivery, or a host reload no longer
  strands the audience — the durable row is always re-fetchable and rev makes
  application idempotent.
- The live path is **no longer database-free** (ADR-0003's headline property).
  The cost is one small table, two functions, one publication entry, and a write
  per settled song change (already debounced) — accepted for the reliability it
  buys. Ended lobbies accumulate (kept by choice); a future sweep can prune by
  `ended_at`/`updated_at` if it ever matters.
- Presence meta is now tiny, removing the heavy-payload freeze.
- Anyone who learns a PIN can publish to it. Acceptable at this scale and no worse
  than the pre-existing channel trust model; revisited when auth arrives.
- `lobby_events` (analytics, ADR-0003) is unaffected — still append-only, still
  off the live read path.
