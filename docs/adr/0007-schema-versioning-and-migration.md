# 7. Logical schemaVersion, forward-only migration, preserve-unknown

Date: 2026-06-28

## Status

Accepted

## Context

The same record shapes (Song, Songbook, the settings bag) are read and written through
**four ingest paths**: local Dexie/IndexedDB load on boot, **import** of an Export JSON,
**Drive pull** of the backup JSON, and **Supabase pull** on launch/focus (the handoff
moment — see ADR-0004). The model will evolve, and Achordeon is an offline-first PWA on
GitHub Pages where two of a user's devices can be on **different app builds** across an
update (a stale cached service worker on the phone, a fresh build on the PC).

Dexie's own `db.version(n).stores(...).upgrade(tx => …)` only runs against the **local**
IndexedDB, and only when that one device's DB version is behind. It does nothing for
data arriving via import, Drive, or Supabase — that data carries whatever shape it was
written at, independent of any local Dexie version. So Dexie's upgrade mechanism cannot
be the migration story; it covers one of four paths.

Two failure modes drive the design: **corruption** (an old client guessing at a shape it
doesn't understand) and **silent loss** (an old client reading newer data, dropping
fields it doesn't know, then writing back — stripping them everywhere via LWW).

## Decision

**Two version numbers, two jobs.**

- **`schemaVersion`** — a logical integer in the Snapshot envelope, versioning the
  **record content shape**. Migrations are a **forward-only chain of pure functions**
  (`v_n → v_{n+1}`) in `shared/domain`, unit-testable with no I/O.
- **Dexie `.version()`** — versions only the **physical** object stores and indexes;
  bumped solely when an index/table changes. Its `.upgrade()` does mechanical store
  reshaping, never content logic.

**One ingest gateway.** All four paths funnel through `migrate(snapshot) → snapshot@current`
before anything touches a store — a single, shared, tested migration code path. On boot,
if the stored `schemaVersion` is behind, migrate **in place, persist at current, bump**,
so runtime code only ever sees the current shape (one-time cost).

**Additive vs breaking.**

- **Additive change** (new field / new setting key) → **no `schemaVersion` bump**. Old
  clients tolerate it: unknown settings fall back to their registry default; new fields
  are simply absent on old-client-authored records.
- **Breaking change** (rename / remove / retype / restructure) → **bump**. When an
  incoming `schemaVersion` exceeds the client's max, the client **refuses to ingest and
  prompts the user to update the app** — it never guesses a down-migration. This makes the
  PWA service-worker update strategy (D5) the delivery mechanism, and the failure is
  _safe_ (refuse) not _destructive_ (corrupt).

**Preserve-unknown is mandatory** — this is what makes "additive = lossless, no
force-update" actually true rather than wishful:

- Clients **patch records in place; never reconstruct from a whitelist of known fields.**
  Use spread/`Dexie.update`-style merges so unrecognised fields/keys ride along verbatim.
- The **signal store holds the full record object**, not a narrowed view-model, so
  unknowns survive to the write-back.
- IndexedDB stores whole objects via structured clone (value is schemaless; only the
  keyPath + declared indexes are constrained), so additive **non-indexed** fields need
  **zero Dexie schema change** and round-trip for free under the patch-don't-reconstruct
  rule. A field becomes a Dexie `.version()` concern only when it must be indexed/sorted.
- Supabase: a **partial upsert** (`SET` only known columns) leaves unknown columns
  untouched server-side; the sparse `settings` jsonb is preserved by the same
  object-level passthrough.

The shapes and the settings registry live in `docs/PRD-DOMAIN-MODEL.md` (R4, ADR-0006);
this record captures the versioning/migration architecture and its _why_.

## Consequences

- Migration is a property of the **data**, not of any one backend; the four ingest paths
  share one tested code path and cannot drift.
- Most model evolution is **additive and silent** — the registry + sparse + defaults +
  preserve-unknown mean new settings need no migration and no coordinated update. Only
  genuine restructures force a version bump, and they fail safe by refusing.
- **D5 (service-worker update strategy) is now a hard dependency** of the breaking-change
  path: refuse-and-prompt is only humane if updating is one reload away.
- A discipline cost is imposed app-wide: **never rebuild a record/settings bag from
  known keys only.** Violating it anywhere silently reintroduces lossy round-trips.
- A stale device that edits newer additive data still degrades one way: a setting it
  doesn't know, if the bag is ever reconstructed, reverts to default. Preserve-unknown
  removes this; the discipline is the safeguard.
