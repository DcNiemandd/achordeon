# 4. Cloud sync targets device handoff, not concurrent multi-device editing

Date: 2026-06-27

## Status

Accepted

## Context

Premium adds automatic sync of the library to Supabase. The sync research
(`/research/google-drive-and-supabase-sync.md`) framed **live, real-time
multi-device sync** as the headline premium value: per-row upserts plus Supabase
Realtime `subscribe` so two devices stay continuously in step, and last-write-wins
per row to resolve concurrent edits.

But the actual product need is narrower. The intended workflow is **device
handoff**: create and edit on a PC, then perform on a phone — one device at a time,
sequentially. Concurrent editing of the same library on two devices is not a
scenario we are building for. Designing for live concurrency would pull in
Realtime subscriptions, continuous reconciliation, and merge/conflict handling we
do not need.

Separately, local edits must never be lost, and the user must understand when
their work has _not_ yet reached the cloud (because without a live channel there
is no background safety net catching up the other device).

### Options

- **A — Live multi-device (the research's framing).** Push per-row on change,
  Realtime `subscribe` for inbound deltas, LWW for concurrent edits. Genuine live
  sync, but more moving parts and a conflict model for a conflict that, given the
  handoff workflow, does not occur.

- **B — Handoff sync.** Aggressive local autosave; push to Supabase on coherent
  boundaries; pull when the other device opens. No live subscription, no merge —
  LWW is safe because edits are sequential. Simpler; the cost is that two devices
  used at literally the same moment would not see each other live (a non-goal).

## Decision

Adopt **Option B**. Sync is for handoff, one device at a time.

- **Local save** is aggressive: keystroke-debounced autosave to IndexedDB. Local
  work is never lost.
- **Supabase push** is coarse: fires on meaningful boundaries (editor save/close,
  songbook reorder commit, app blur/close) plus a debounced safety net. Upserts
  changed rows; deletes via tombstone.
- **Supabase pull** happens on app launch / focus — the handoff moment — not via a
  live `subscribe`.
- **Conflict** = per-row last-write-wins, which is a non-issue under sequential
  use.
- The app **warns before leaving** (`beforeunload` + in-app route guard) when local
  changes have not yet reached the cloud for a sync-enabled user, since there is no
  live channel to catch the other device up.
- Automatic Supabase sync is a **user toggle in Settings** (enabled by `pro`, but
  switchable off; off ≠ logged out; manual Drive buttons keep working).

## Consequences

- No Realtime subscription, no continuous reconciliation, no merge logic in v1 —
  materially less to build and to get wrong.
- Premium value rests on **automatic server backup + pull-on-launch across your
  devices + Audience hosting**, rather than live co-editing. Still worth charging
  for (it costs to run).
- The "unsynced" warning becomes load-bearing UX, not a nicety: it is the only
  thing standing between a user and a stale phone mid-gig.
- Live multi-device remains a clean future upgrade: the row-level schema and
  tombstones are already in place, so adding Realtime `subscribe` later is additive
  and does not invalidate this model.
- This decision deliberately diverges from the sync research's emphasis; the
  divergence is the reason it is recorded.
