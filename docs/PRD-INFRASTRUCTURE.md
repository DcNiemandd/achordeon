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
`@Injectable`), signal-based. Grouped by concern.

**Dependency policy: minimal deps** — every dependency is justified and discussed
before it is added (e.g. `@tonaljs/chord` for chord validity/transpose, §12; Dexie,
NgRx SignalStore). From-scratch is the default where it earns control (renderer,
stores); a dependency must clear that bar.

### Data / domain

- **PersistenceService** — Dexie tables; only thing that touches IndexedDB.
- **SongStore** — signal state for Songs (list, current, search results).
  Exposes a **paged/cursor API** (see §4) — never a single flat array.
- **SongbookStore** — signal state for Songbooks + entries/slots; same paged API.
- **SettingsStore** — global + scoped render settings, theme, language.
- **ParserService** — content text → content AST (pure semantic model: single
  effective title/subtitle, blocks, char-anchored chords; no layout/font deps —
  see §12).
- **TransposeService** — shift valid chords, rewrite source (undo/redo aware).
- **SearchService** — two-tier search (metadata first, then content).

### Output

- **RenderService** — content AST + render settings → SVG render (per ADR-0002).
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

## 3. State management (the no-RxJS decision) [decided]

Everything reactive is `signal` / `computed` / `effect`. No `Observable`, no
`async` pipe. Async work (DB, network) lives in plain async methods that set
signals.

- **A — Hand-rolled signal services.** Zero deps, full control, more boilerplate.
- **B — NgRx SignalStore** (`@ngrx/signals`). Signals-native
  `withState/withMethods/withComputed`, `withEntities` for the Song/Songbook
  collections. Less boilerplate, conventional, but a dependency.

**Decided: mixed.** **B (NgRx SignalStore + `withEntities`)** for the entity
stores (Songs/Songbooks); **A (hand-rolled)** for the small ones
(Settings/Session). Soft-delete = a `withComputed` filter hiding tombstoned rows
from lists while they stay in the store for sync; sync row-deltas apply as plain
`setEntity` upserts.

The entity collection is a **growing windowed cache**: each page fetch _appends_
its rows into the same `withEntities` map, and that map **is** what the UI renders
(infinite scroll). The cache window grows as the user scrolls — it is not the
whole table. (Implication, §4: the window is per-query; changing sort/search
resets the cache and refetches from page 1.)

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
- **Each fetched page appends into the entity-store cache** (§3) and that cache is
  what the list renders. The cache is a window over the query result, not the
  whole table; **changing sort/search resets it** and refetches from page 1.

---

## 5. Supabase (paid tier) — relational, not blobs [research-backed]

Use the DB, not a JSON blob — relational rows give partial sync and integrity.

**Use case = device handoff, not concurrent multi-device. [decided]** The target
is "create on PC, perform on mobile" — sequential, one device at a time. So there
is **no live merge** and **no need for live Realtime cross-device updates**; LWW is
safe because edits don't overlap. (Concurrent multi-device + Realtime `subscribe`
is a future option, not v1.)

- **Auth** — Supabase Auth, Google OAuth first; email+password later; multiple
  providers linkable to one Account. Session persists in `localStorage`,
  auto-refreshed; user stays logged into Achordeon across reloads. Provider-linking
  flow below.
- **Tables** — `profiles(id, plan)`, `songs`, `songbooks`,
  `songbook_songs(songbook_id, song_id, position)`. Same uuid as local record.
  RLS per `auth.uid()`. Tombstones via `deleted_at`.
- **Sync mechanics** —
  - **Local save = A, aggressive:** keystroke-**debounced autosave to IndexedDB**.
    Local work is never lost.
  - **Supabase push = B, coarse:** fires on **meaningful boundaries** (editor
    save/close, songbook reorder commit, app blur/close) + a debounced safety net.
    Upserts rows where `lastModified > lastSynced`; deletes via `deleted_at`.
  - **Supabase pull = on app launch / focus** (the handoff moment), not a live
    subscription. `select where updated_at > lastPulled`.
  - Conflict = per-row last-write-wins (sequential use makes this a non-issue).
- **Warn before leaving if unsynced. [decided]** `beforeunload` + in-app route
  guard: if local changes haven't reached Supabase (for a sync-on user), warn —
  there is no live safety net, so an un-synced PC means the phone won't have it.
- **Tier flag** — `profiles.plan ('free' | 'pro')`. Manual flip in the dashboard
  now; later a Merchant-of-Record (Lemon Squeezy / Polar) **one-time lifetime**
  checkout → webhook → Edge Function sets the flag. No ads. [research-backed]
- **Auto-sync is a user toggle in Settings.** Being `pro` _enables_ automatic
  Supabase sync; the user can switch it off (off ≠ logged out; manual Drive
  buttons still work).

### Provider-linking [decided — D6]

How Google + email/password collapse to **one** Account. Login exists **only for data
sync** — low stakes, which shapes every call below.

- **Account = the Supabase `auth.users` row (uuid).** Provider-agnostic; that uuid owns
  every `profiles`/`songs`/`songbook` row via RLS. Sign-in _identities_ (`google`,
  `email`) attach to it. There is **no "primary" identity** and the uuid never changes as
  methods are added — so linking can't break RLS ownership.
- **Linking model = automatic same-email + manual explicit.** Supabase auto-links a new
  sign-in to an existing user when the **verified** email matches — this **cannot be
  disabled** and is safe because it only fires on verified emails. On top of it, **manual
  linking is enabled** (`GOTRUE_SECURITY_MANUAL_LINKING_ENABLED`) so the user can
  deliberately add a method (incl. a _different_ email) from Settings.
- **Mechanics differ by direction.** Add Google → `linkIdentity({ provider: 'google' })`;
  add password → `updateUser({ email, password })` (`linkIdentity` is OAuth-only; it does
  not attach an email/password credential).
- **Linking = add-a-method-to-the-current-account, never a merge.** A provider attaches to
  the account you are logged into. The explicit Settings flow is therefore the safe path —
  it can't spawn a second account. UI nudges "add a sign-in method" over signing up afresh.
- **Email confirmation is REQUIRED** (non-negotiable, not a UX preference). An unconfirmed
  email/password identity grants **no session** and never auto-links → blocks pre-account-
  takeover: only the inbox owner can complete the link. A fresh signup is therefore not
  logged in until the confirmation link is clicked.
- **Two already-populated accounts cannot be merged [accepted v1 limitation].** Supabase
  has no merge-users op; `linkIdentity`/`updateUser` against an email owned by _another_
  user errors. Recovery = Export (JSON) from one → Import into the other → abandon the
  duplicate. In-app merge (row re-keying + conflict resolution) is **future**.
- **Drive rides on the Google identity [decided].** "Connect Drive" routes through Supabase
  Google OAuth (§6 Flow A), so it is carried by the Google identity, **not** an
  identity-free storage grant. A non-Google account must **link Google first** (the
  Connect-Drive button can drive that link). Sharpens CONTEXT "Connect Drive … not a
  separate identity" → not a separate _account_, but it is the Google _identity_.
- **No unlinking in v1 [add-only].** `unlinkIdentity` is deferred; removing Google would
  also break Drive. Fully detaching = account deletion (a separate concern).

> Note: research framed live Realtime multi-device as the headline premium value;
> with handoff-only, premium value leans on **automatic server backup + pull-on-
> launch across your devices + Audience hosting** instead. Still worth charging for
> (server cost). Realtime stays a clean future upgrade.

---

## 6. Google Drive (all users, manual) [research-backed]

Free tier and paid alike get the **same two explicit manual buttons** — "Upload
to Drive" (push) and "Download from Drive" (pull). Never automatic, never a hidden
one-button "sync" (whole-file LWW is unsafe to auto-direct — the human picks which
copy wins). [decided]

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
- **Download** — render → output: single song PDF or image (PNG, now
  cross-browser via the SVG path below); multiple = ZIP of images / ZIP of PDFs /
  one multi-page PDF; songbook always PDF (A4/custom, songs keep aspect ratio
  scaled to fit).

**Rendering engine: client-side, SVG render target, built from scratch. [decided]**
Server-side headless Chromium is rejected (breaks offline-first, infra cost).

- **Render target = SVG** (not HTML/CSS). One renderer feeds three outputs:
  on-screen view, **cross-browser PNG**, and a future **vector PDF**.
- **Cross-browser raster [decided]** — the old "PNG, Chromium-only" limit came
  from DOM-to-image's SVG `<foreignObject>` technique (broken on Safari/Firefox).
  An SVG render rasterizes via `drawImage(svg → canvas)` with **no foreignObject**,
  so PNG works in every browser. Fonts must be **inlined as base64** (Safari fails
  on external font URLs).
- **PDF v1 = raster** (embed the PNG into pages via `pdf-lib`/`jsPDF`). **Future:
  vector PDF** straight from the SVG (e.g. svg2pdf.js) — and a user-chosen
  raster-vs-vector pipeline, both from the _same_ SVG. No second renderer.
- **Layout metrics = native Canvas `measureText()`** against an offscreen canvas
  (zero DOM reflow): `.width` + `actualBoundingBox{Ascent,Descent}` drive line
  heights, exact chord-over-character x-positions, column breaks, and the
  scale-to-fit-one-page / aspect-ratio math. No library needed (a lib would just
  cache this).
- Multiple = ZIP of images / ZIP of PDFs / one multi-page PDF; songbook always PDF.

---

## 9. Audience (realtime)

One performer (host) → many viewers, synced to the currently selected Song. Note:
this is a **separate** realtime concern from §5 multi-device DB sync.

- Audience needs internet, no account, anyone joins. Hosting is Premium (free
  during testing). Only the selected Song syncs; viewers can't open another.
  QR encodes a URL to the Audience route carrying the PIN.

**Transport: Supabase Realtime, no DB for per-lobby state. [decided]**

The "array of lobbies on the backend" (CONTEXT) is **not** a server variable — an
Edge Function is stateless (ephemeral isolates, no shared memory across calls), so
a global array there is unreliable. The shared state instead lives in **Realtime
Presence**, an in-memory CRDT the Realtime service syncs to every subscriber.

- **Channel per lobby**, named by PIN.
- Host `track()`s lobby state into Presence: **`{ currentSongObject, summary }`** —
  the _full_ current Song (content + settings), not just an id.
- **The Presence state IS the render payload.** Viewer renders `currentSongObject`
  locally with the same renderer (settles the old "model vs content+settings"
  question — host ships the whole Song object, viewer renders it). Summary travels
  once, with the lobby state.
- Late joiner subscribes → `onPresenceSync` delivers current song + summary
  immediately (no "joined between changes, saw nothing" gap).
- Song change = host re-tracks the new `currentSongObject` (or Broadcasts it).
- **Lobby ends when the host disconnects** — Presence auto-evicts the host entry.
  Gives "one-time lobby, ends when performer ends it" with no cleanup job.
- Audience count = Presence of the viewers on the same channel.
- Source of truth = the host's tab (online for the whole performance). Trade-off:
  host reload drops the lobby → re-host. Accepted unless reload-resilience is wanted.

(Postgres-table-backed lobbies rejected: writes on every prev/next tap, schema +
RLS + stale-row cleanup, for data that is inherently ephemeral.)

**PIN allocation: random, no dedup registry. [decided]** ~5 chars from an
unambiguous alphabet (no `0/O/1/I`); collisions are negligible at this scale.
Viewer joining a PIN with no host Presence → "lobby not found". No central
registry table.

### Lobby analytics [requested — needs a table]

Append-only event log. **Not** a lobby registry (no live lookup); pure history.
Events: `lobby_created` (song_ref, audience_count), `song_changed` (song_ref,
audience_count).

- **`song_ref` = `{ id, title, subtitle, summaryPos, summaryLength }`** — a
  reference plus set position (`summaryPos` of `summaryLength`), **no content**.
  Enables most-performed songs, set sizes, how far into a set audiences get, and
  audience-count-over-time — without storing any lyrics/chords.
- Table `lobby_events(id, host_id, lobby_pin, type, song_id, title, subtitle,
summary_pos, summary_length, audience_count, created_at)`, insert-only, RLS so
  only the owner/admin reads.
- **GDPR posture:** host is identifiable (`host_id`) → personal data, lawful basis
  **legitimate interest** (product analytics) stated in a privacy policy; erasure
  cascades on account delete via `host_id`. **Audience logged as a _count only_** —
  no per-viewer id, no IP → audience stays anonymous, no cookie-consent banner.
- Set a retention window (e.g. raw events 90 days → aggregate).

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

- **PWA / offline + update strategy (D5) [decided]** — first-party
  **`@angular/service-worker`** (ngsw); **no hand-rolled service worker, no Workbox.**
  Under Nx + the esbuild `application` builder the `ng add @angular/pwa` schematic
  doesn't fit the project layout, so it's wired by hand (~4 declarative steps: add the
  dep, `provideServiceWorker()`, author `ngsw-config.json`, set the build target's
  `serviceWorker` option). This is the "easy plug-in" bar the PWA was gated on.
  - **Precache** — `ngsw-config.json` asset groups **prefetch the app shell**
    (HTML/JS/CSS/icons) so the app boots with zero network (the offline promise in
    `CONTEXT.md`). **Audience + sync stay network paths** — their responses are not
    SW-cached.
  - **Routine update — gentle, never auto-reload.** `SwUpdate.versionUpdates` →
    `VERSION_READY` → a **dismissible** "update available, reload" affordance; the user
    reloads when they choose. Activation always means a full reload (ngsw forbids
    mid-session asset swaps / version skew); we never reload silently, because the app
    may be **mid-performance** (Stage / hosting an Audience lobby). `checkForUpdate()`
    runs once the app is stable and again on **launch/focus** — the same lifecycle
    moment as the ADR-0004 pull-on-launch handoff.
  - **Forced update — the ADR-0007 refuse path.** When an ingest path refuses data
    carrying a newer `schemaVersion`, the prompt is **blocking** ("update required to
    read this data") → `checkForUpdate()` → `activateUpdate()` → reload. This is the
    delivery mechanism ADR-0007 depends on ("updating is one reload away"); the failure
    stays safe (refuse) not destructive (corrupt).
  - **Recovery** — `SwUpdate.unrecoverable` → prompt a reload to rebuild a corrupted
    SW cache.
  - **GitHub Pages** — ngsw serves `index.html` for navigation requests, so SPA
    routing works offline; cold deep-links _before_ the SW is installed still rely on
    the existing GitHub Pages SPA fallback.
- **i18n: `@angular/localize` in runtime mode. [decided]** EN + CS, first-party,
  no Transloco. ONE bundle (not per-locale AOT builds): `loadTranslations(map)`
  loads a simple-JSON `en.json`/`cs.json` at boot. Keys + JSON come from the
  official `ng extract-i18n` (with explicit `@@id` keys). Language switch =
  persist in Settings + **reload** (runtime `$localize` translates each message
  once on first encounter, so live in-place switching isn't supported — reload is
  acceptable here). Avoids the per-locale GitHub Pages build that _compile-time_
  inlining would force.
- **Undo/redo** — editor-local, session-only, no DB versioning (per CONTEXT).
- **IDs** — uuid for Songs/Songbooks, stable across rename.

---

## 12. Parser — content text → AST [decided]

`ParserService` turns a Song's **content text** into a pure **semantic AST** — the
single from-scratch grammar piece. The full machine grammar (Phase 1/2 rules, chord
sub-grammar, escapes, warnings, reparse) is specified in
**`docs/PARSER-GRAMMAR.md`**; this is the infra-level summary.

### Seam: parse vs. layout [decided]

The parser stops at _structure_; the SVG renderer (ADR-0002) owns _all_ geometry.

- Output is a pure semantic model — `Song { title, subtitle, blocks, warnings }`,
  `Block { label?, labelInline?, lines }`, each `Line` a clean `text` string with
  chords **overlaid by character index** (never a pixel x).
- **No font, DOM, or canvas dependency** (PRD §2: pure). The renderer turns a
  character index into an x-coordinate via `measureText` of the preceding
  substring (ADR-0002).
- **Single effective title / subtitle.** The model carries one `title` and one
  `subtitle` string (not arrays): the parser resolves "last wins" and emits a
  `SHADOWED_TITLE`/`SHADOWED_SUBTITLE` warning for the rest.
- **Render options are not parsed from text.** Per ADR-0001 they live in metadata
  and are merged by the renderer; the parser never reads settings out of content.
- **Total parser** (never throws) + **full debounced reparse**; one AST feeds
  screen, PNG, and PDF with no re-parse.

### Two-phase, line-oriented [decided]

Phase 1 classifies lines (title `*` / subtitle `**` / labelled / lyric / blank) and
groups blocks; Phase 2 ("the tokenizer") inline-scans only content text (chords,
escapes, future markdown). Chord validity/transpose use `@tonaljs/chord`. Editor is
**undecided** but must support highlighting + warning underlines (Monaco/CodeMirror,
not a plain textarea). See `docs/PARSER-GRAMMAR.md` for the rest.

---

## 13. ADRs

Written (`docs/adr/`):

- **0002 — SVG render target** (§8): one from-scratch SVG renderer feeds screen +
  cross-browser PNG + future vector PDF; Canvas `measureText` for layout.
- **0003 — Audience over Realtime Presence, no DB for lobby state** (§9): random
  PIN, no registry; analytics in a separate append-only table.
- **0004 — Handoff-not-concurrent sync** (§5): local autosave + coarse boundary
  push + pull-on-launch + warn-if-unsynced; diverges from the sync research.
- **0005 — Pure two-phase semantic parser** (§12): pure `string → AST`, two-phase
  line-oriented, char-anchored chords, `@tonaljs/chord`, editor-agnostic.
- **0009 — Add-method auth linking & Drive-on-Google** (§5): one Account by attaching
  methods to the current user (no merge of populated accounts), email confirmation
  required, "Connect Drive" carried by the Google identity.

Recorded as PRD notes only (well-justified, less surprising): mixed signal stores
(§3); Dexie persistence + `drive.file` scope + Supabase relational + local-first +
soft-delete-only (§1/§4/§5); `@angular/localize` runtime i18n (§11).

---

## 14. Open questions

_All initial branches resolved._ Earlier sessions settled: state lib (§3, mixed);
Audience transport + payload + PIN + analytics (§9); storage model + persistence +
rendering + soft-delete (§1/§4/§8); sync cadence + handoff model +
unsynced-warning + two Drive buttons (§5/§6); i18n (§11); SVG render target +
cross-browser raster + Canvas-`measureText` layout (§8).

**Parser grammar/tokenizer — settled** (§12; full spec `docs/PARSER-GRAMMAR.md`):
parse/layout seam, two-phase line-oriented architecture, line taxonomy + asterisk
rules, label colon-run rule, block boundaries, chord overlay model + invalid-as-
annotation, `@tonaljs/chord` for validity/transpose, no-nesting, escapes, warning
model, full debounced reparse.

Deeper layers not yet grilled (next sessions, if wanted): **editor choice**
(highlighting editor — Monaco vs CodeMirror, likely an ADR); transpose spelling
(direction-based v1, key-aware future); songbook-scope settings cascade; PWA
service-worker update strategy; auth provider-linking flow; the MoR webhook →
Edge Function detail. The **rendering layer** (SVG layout, columns, `labelInline`,
chord-only sizing, scale-to-fit) is its own deferred PRD.
