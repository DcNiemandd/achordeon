# Achordeon — Infrastructure PRD (draft for grilling)

Backend/infrastructure plan only. Visuals/UX come later. Angular 21 SPA (Nx
monorepo, GitHub Pages), **signals only — no RxJS**. Offline-first PWA. Shallow
map of services, data flow, routing, and external pieces, with options where more
than one path exists.

> Status: DRAFT for grilling. Items marked **[research-backed]** come from
> `/research/*.md` and are close to decided; items marked **[OPEN]** are live.

---

## 1. Shape of the system

Three layers, local-first. **IndexedDB is always the client's source of truth;
sync backends are dumb push/pull targets.** [research-backed]

```
┌─────────────────────────────────────────────────────────┐
│ UI (Angular components, later)                           │
├─────────────────────────────────────────────────────────┤
│ Signal stores (in-memory run-time state)                 │
│   SongStore · SongbookStore · SettingsStore · SessionStore│
├─────────────────────────────────────────────────────────┤
│ Persistence (IndexedDB via Dexie) — durable local library│
└─────────────────────────────────────────────────────────┘
        ▲  snapshot ⇄ JSON file     ▲  snapshot ⇄ rows / Realtime
   ┌────┴─────┐                 ┌────┴────────┐
   │ Drive    │ MANUAL          │ Supabase    │ AUTOMATIC
   │ ALL users│ (2 buttons)     │ PAID only   │ (background)
   │ 1 JSON   │                 │ relational  │
   └──────────┘                 └─────────────┘
```

Both backends translate to/from one in-memory **Snapshot envelope**:
`{ schemaVersion, deviceId, updatedAt, data: { user[], songs[], songbooks[] } }`,
every record carrying a stable client-generated **uuid** and a `deletedAt`
**tombstone** (so deletes propagate instead of resurrecting). [research-backed]

**Nothing is ever hard-deleted — anywhere.** Delete = set `deletedAt`, locally
_and_ remotely. The local IndexedDB row stays; sync carries the tombstone; lists
filter out tombstoned records. (Open: whether a future "empty trash" ever purges,
or tombstones live forever. Default: forever.)

The two backends **layer, not either/or**: a paid user runs automatic Supabase
sync _and_ the same manual Drive backup. Migrating between them is `pull()` then
`push()` — no conversion, same Snapshot. [research-backed]

---

## 2. Services it needs

Plain Angular `@Service()` (the current decorator — autoProvided at `root`, not
`@Injectable`), signal-based. Grouped by concern:

### Data / domain

- **PersistenceService** — Dexie tables; only thing that touches IndexedDB.
- **SongStore** — signal state for Songs (list, current, search results).
  Exposes a **paged/cursor API** (see §4) — never a single flat array.
- **SongbookStore** — signal state for Songbooks + entries/slots; same paged API.
- **SettingsStore** — global + scoped render settings, theme, language.
- **ParserService** — content text → render model (pure, no deps).
- **TransposeService** — shift valid chords, rewrite source (undo/redo aware).
- **SearchService** — two-tier search (metadata first, then content).

### Output

- **RenderService** — render model → DOM render.
- **ExportService** — Songs/Songbooks → JSON (the Snapshot/Export format).
- **ImportService** — JSON/downloaded files → library, conflict resolution.
- **DownloadService** — render → PNG/PDF/ZIP.

### Account / sync

- **AuthService** — Supabase Auth session, tier, provider-agnostic identity.
- **SyncService** — orchestrates backends behind one `SyncBackend` port.
  - **DriveSyncBackend** — manual, all users (`push`/`pull`, no `subscribe`).
  - **SupabaseSyncBackend** — automatic, paid only (`push`/`pull`/`subscribe`).
- **LobbyService** — host/join Audience, realtime selected-song broadcast.

### App

- **Router config** + guards (tier highlight, not hard block, during testing).
- **PwaService** — install prompt, offline status, service-worker update.

---

## 3. State management (the no-RxJS decision) [OPEN]

Everything reactive is `signal` / `computed` / `effect`. No `Observable`, no
`async` pipe. Async work (DB, network) lives in plain async methods that set
signals.

- **A — Hand-rolled signal services.** Zero deps, full control, more boilerplate.
- **B — NgRx SignalStore** (`@ngrx/signals`). Signals-native
  `withState/withMethods/withComputed`, `withEntities` for the Song/Songbook
  collections. Less boilerplate, conventional, but a dependency.

**Recommendation: B** for the entity stores (Songs/Songbooks), **A** for small
ones (Settings/Session). _Still open for grilling._

---

## 4. Local persistence — Dexie [research-backed]

Dexie (thin IndexedDB wrapper) + `dexie-export-import`. Gives typed tables and
produces the Snapshot blob "for free". We **do not** use Dexie `liveQuery` (it's
RxJS-flavoured) — stores refresh via async methods, keeping the no-RxJS rule.

- Tables: `user` (provisional, future-proofs accounts/plan), `songs`,
  `songbooks`. Every record: stable uuid `id` + human `name`, timestamps,
  `deletedAt` tombstone. Deletes are soft (set `deletedAt`); rows are never
  physically removed.

### Paging from day one [requested]

The store exposes a **paged/cursor interface** so the frontend can do **infinite
scroll** out of the gate, regardless of how it's backed:

- API shape ~ `page({ cursor, limit, sort, query }) → { rows, nextCursor }`.
- **v1 backing can be mocked**: load-all into memory at boot, slice pages from the
  in-memory array. The component never knows — it only sees the cursor API.
- Later the same interface is served by Dexie offset/key-range queries (and
  Supabase `range()`), no frontend change.

---

## 5. Supabase (paid tier) — relational, not blobs [research-backed]

Use the DB, not a JSON blob — that's what unlocks Realtime, partial sync, and
integrity.

- **Auth** — Supabase Auth, Google OAuth first; email+password later; multiple
  providers linkable to one Account. Session persists in `localStorage`,
  auto-refreshed; user stays logged into Achordeon across reloads.
- **Tables** — `profiles(id, plan)`, `songs`, `songbooks`,
  `songbook_songs(songbook_id, song_id, position)`. Same uuid as local record.
  RLS per `auth.uid()`. Tombstones via `deleted_at`.
- **Sync mechanics** — push = upsert rows where `lastModified > lastSynced`;
  pull = `select where updated_at > lastPulled`; **Realtime** = subscribe to
  `postgres_changes` filtered to `user_id` → live multi-device. Conflict =
  per-row last-write-wins (+ optional `deviceId`).
- **Tier flag** — `profiles.plan ('free' | 'pro')`. Manual flip in the dashboard
  now; later a Merchant-of-Record (Lemon Squeezy / Polar) **one-time lifetime**
  checkout → webhook → Edge Function sets the flag. No ads. [research-backed]
- **Auto-sync is a user toggle in Settings.** Being `pro` _enables_ automatic
  Supabase sync; the user can still switch it off. When on: debounced `push` on
  local change + Realtime `subscribe`. When off: no background sync (manual Drive
  buttons still work). Off ≠ logged out.

---

## 6. Google Drive (all users, manual) [research-backed]

Free tier and paid alike get the same two manual buttons. Never automatic.

- **Scope `drive.file`** (NOT `appDataFolder`): non-sensitive → no Google
  verification tax, the file is **visible and IS the export/import JSON**,
  survives app-revoke. One file: `achordeon-backup.json`.
- REST: find/list, multipart create (first push), media PATCH (later), `alt=media`
  download (pull).
- **Conflict v1** — whole-file last-write-wins **with a guard**: before
  overwrite, compare Drive `modifiedTime` / envelope `updatedAt` to local
  `lastSyncedUpdatedAt`; warn if Drive moved ahead. Pull applies via documented
  import rules (songbooks new; songs replace/ignore/create-new), or full-replace
  for a plain "restore latest".
- **Token reality** — the Google `provider_token` (~1h) is gone after any reload;
  Supabase does not refresh it. **Flow A (v1):** on Sync, if missing, re-run
  `signInWithOAuth(drive.file)` — fast redirect, usually no consent screen, zero
  infra. **Flow B (later):** Edge Function token-broker holding the
  `provider_refresh_token` server-side (needs `client_secret`) → silent, no
  redirect. Flow B is the same Edge Function the paid tier + monetization need.

---

## 7. Security / trust model [research-backed]

- **No login for local data.** Login gates _cloud sync only_. Local data is the
  user's own low-sensitivity chord sheets.
- Top real risk is **XSS reading IndexedDB + sync tokens**, which a login wall
  does nothing about. Spend effort here instead:
  - **CSP** via `<meta http-equiv>` (GitHub Pages can't set headers) + **SRI** on
    any third-party script; minimize third-party JS.
  - **Song content renders to HTML and is user input** → never `innerHTML` /
    `bypassSecurityTrust*` it; rely on Angular escaping.
  - Shortest-lived sync tokens; prefer Flow B broker so the long-lived Google
    refresh token never sits in the browser.
- Optional passphrase encryption-at-rest is a _later, opt-in_ nicety (breaks the
  visible-JSON backup; doesn't stop live XSS) — not v1.

---

## 8. Export / Import / Download

- **Export** — serialize selected Songs/Songbooks to the Snapshot JSON (content +
  settings metadata, per ADR-0001). Canonical round-trip; same shape Dexie emits.
- **Import** — accept Export JSON + (nice-to-have) Downloaded files with embedded
  metadata. Songs → replace / ignore / create-new (+ import-all-as-new with date
  prefix); Songbooks → always new.
- **Download** — render → output: single song PDF or image (PNG today,
  Chromium-only); multiple = ZIP of images / ZIP of PDFs / one multi-page PDF;
  songbook always PDF (A4/custom, songs keep aspect ratio scaled to fit).

**Rendering engine: client-side. [decided]** DOM → image in-browser; PDF via the
print pipeline or `pdf-lib`/`jsPDF`. Fully offline, no server. Image export is
Chromium-only today — accepted as a known limitation. (Server-side headless
Chromium is explicitly rejected: it breaks offline-first and adds infra cost.)
Still open: _which_ client-side PDF/image libraries (see grill list).

---

## 9. Audience (realtime) [OPEN — research does not cover this]

One performer (host) → many viewers, synced to the currently selected Song. Note:
this is a **separate** realtime concern from §5 multi-device DB sync.

- **Lobby** — host-created; PIN ~5 chars deduped at generation; lives as an
  array/table on the backend. QR encodes a URL to the Audience route carrying PIN.
- Audience needs internet, no account, anyone joins. Hosting is Premium (free
  during testing). Only the selected Song syncs; viewers can't open another.

**Transport options:**

- **A — Supabase Realtime Broadcast** keyed by PIN. Ephemeral, no DB writes, fits
  "one-time lobby". Simplest. (+ **Presence** for audience count.)
- **B — Postgres table + Realtime subscription.** Durable/queryable, but writes on
  every navigation, heavier.

**Recommendation: A + Presence.** Lobby open/close may need one row.

**Payload [OPEN]:** parsed render model vs raw content+settings (viewer renders
locally, since it has the same renderer). Recommend **content+settings** — smaller
wire, reuses the renderer.

---

## 10. Router

Lazy-loaded feature routes, one per nav module:

| Route                | Module           | Notes                        |
| -------------------- | ---------------- | ---------------------------- |
| `/songs`             | Songs            | list (song explorer)         |
| `/songs/:id/edit`    | Song editor      | content + settings split     |
| `/songbooks`         | Songbooks        | explorer + songbook list     |
| `/songbooks/:id`     | Songbook detail  | reorder, entries             |
| `/stage`             | Stage            | pick songbook → perform      |
| `/stage/:songbookId` | Performing       | prev/next/summary/fullscreen |
| `/audience`          | Audience         | join via PIN                 |
| `/audience/:pin`     | Audience session | QR deep-link target          |
| `/settings`          | Settings         | profile, app, rendering      |

- Default redirect `/songs`. Guards: `tierGuard` = highlight+tooltip during
  testing, not a hard block. All routes work offline except `/audience/*` + sync.

---

## 11. Cross-cutting

- **PWA / offline** — service worker (`@angular/pwa` / Workbox), precache shell;
  only Audience + sync need net.
- **i18n [OPEN]** — EN + CS. Compile-time (Angular i18n) vs runtime dictionary.
  Runtime switching wanted → lean lightweight runtime i18n.
- **Undo/redo** — editor-local, session-only, no DB versioning (per CONTEXT).
- **IDs** — uuid for Songs/Songbooks, stable across rename.

---

## 12. Candidate ADRs

1. **State management without RxJS** — NgRx SignalStore vs hand-rolled (§3).
2. **Audience transport** — Realtime broadcast vs Postgres-backed (§9).
3. _(Resolved, may still warrant ADRs):_ Dexie as persistence; `drive.file`
   scope; Supabase relational (not blob); local-first source of truth;
   client-side rendering; soft-delete-only.

---

## 13. Open questions to grill

- State lib: NgRx SignalStore vs hand-rolled (§3).
- Audience transport (broadcast vs table) + payload (model vs content+settings) (§9).
- Client-side PDF/image libraries: which ones (§8).
- i18n: compile-time vs runtime switching (§11).
- Sync trigger cadence on the Supabase side: debounce window for auto-push?
- Do free users get a "sync now" one-button round-trip, or literal up/down only?
