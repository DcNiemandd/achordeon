# Plan: Achordeon implementation

> Source PRDs: `CONTEXT.md`, `docs/PRD-INFRASTRUCTURE.md`, `docs/PRD-DOMAIN-MODEL.md`,
> `docs/PRD-RENDERING.md`, `docs/PARSER-GRAMMAR.md`, ADRs 0001–0010, and the
> Docusaurus PRD pages under `apps/docs/docs`.

This is a backlog of **epics** (one GitHub issue each) with **subtasks**
(checkbox items). Intentionally abstract — no code, no file names, no function
signatures. Structure is **hybrid**: epics 1–4 are the shared foundation
(front-loaded because parser, renderer, domain, and stores are infra every
feature depends on); epics 5–10 are vertical feature slices that each cut from
store → service → UI; epics 11–12 are cross-cutting shell and settings.

## How to read it

- **What to build** — the end-to-end behaviour of the slice, layer-agnostic.
- **Subtasks** — the smaller pieces to turn into issue checkboxes.
- **Depends on** — which epics should land first.

---

## Architectural decisions (apply to every epic)

Durable decisions already resolved in the PRDs/ADRs. Don't re-litigate inside
issues — reference them.

- **Stack**: Angular 21 SPA, Nx monorepo, **signals only — no RxJS**,
  offline-first PWA, deployed to GitHub Pages. (PRD-INFRA §1, §3)
- **Nx scopes**: `shared/domain` (pure, no framework deps), `shared/data-access`
  (third-party adapters quarantined here), `shared-render-core` (pure geometry,
  no `@angular/*`), and a feature lib per nav module. (PRD-RENDERING §1,
  ADR-0008, ADR-0010)
- **Local-first**: IndexedDB (via Dexie) is always the source of truth; Drive and
  Supabase are dumb push/pull targets that translate to/from one **Snapshot
  envelope** `{ schemaVersion, deviceId, updatedAt, data:{ user[], songs[],
songbooks[] } }`. (PRD-INFRA §1, ADR-0004)
- **Soft-delete everywhere**: delete = set `deletedAt` tombstone; rows are never
  physically removed; lists filter tombstoned. (PRD-INFRA §1)
- **Records carry**: stable client `uuid` id (survives rename), `createdAt`,
  `updatedAt`, `deletedAt`. (PRD-DOMAIN §Base record)
- **Content vs settings**: a Song's text holds only semantic content; render
  settings live as structured metadata edited via GUI, never parsed from text.
  (ADR-0001)
- **Settings cascade**: data-driven registry; uniform `Global → Songbook → Song`,
  most-specific-defined-value wins; stored sparse; effective value resolved at
  render, never persisted. (ADR-0006)
- **Schema evolution**: logical `schemaVersion` + forward-only pure migrator chain
  behind one ingest gateway; additive = no bump (preserve-unknown discipline);
  breaking = bump + refuse-and-prompt-to-update. (ADR-0007)
- **Parser**: pure two-phase line-oriented `string → semantic AST`; chords
  anchored by character index; total (never throws); warnings are structured
  codes, not strings. (ADR-0005, PARSER-GRAMMAR)
- **Renderer**: from-scratch **SVG** render target; `layout → RenderPlan →
emit(SVG)`; geometry via injected `measureText` port; fonts embedded both ways
  (base64 in SVG, registered in jsPDF). One renderer feeds screen + PNG + vector
  PDF. (ADR-0002, PRD-RENDERING)
- **Music theory**: behind a `ChordTheory` port; `@tonaljs/*` lives only in one
  adapter; spelling/transpose are domain policy. (ADR-0008)
- **Editor**: CodeMirror 6, in the `songs` scope, behind a loose-coupling seam —
  no CodeMirror type crosses the adapter boundary. (ADR-0010)
- **Sync model**: device handoff, not concurrent editing — aggressive local
  autosave, coarse boundary push, pull-on-launch, per-row LWW, warn-if-unsynced.
  (ADR-0004)
- **Audience**: Supabase Realtime **Presence** (no DB for live lobby state);
  random ~5-char PIN, no registry; analytics in a separate append-only table.
  (ADR-0003)
- **Auth**: one Supabase `auth.users` account; add-method-only linking (no merge
  of populated accounts); email confirmation required; "Connect Drive" rides on
  the Google identity. (ADR-0009)
- **Routes** (lazy, one per nav module): `/songs`, `/songs/:id/edit`,
  `/songbooks`, `/songbooks/:id`, `/stage`, `/stage/:songbookId`, `/audience`,
  `/audience/:pin`, `/settings`; default redirect `/songs`. (PRD-INFRA §10)
- **Dependency policy**: minimal deps, each justified case-by-case (Dexie, NgRx
  SignalStore, `@tonaljs/*`, svg2pdf.js/jsPDF). From-scratch is the default.
- **Security**: login gates cloud sync only; song content is user input → never
  `innerHTML`/`bypassSecurityTrust*`; CSP via meta + SRI. (PRD-INFRA §7)

---

# Foundation (shared — front-loaded)

## Epic 1: Workspace scaffold & domain model

**Depends on**: nothing (first).

### What to build

The Nx lib skeleton and the pure domain core every other epic imports: entity
shapes, the settings registry + resolver, the Snapshot envelope, and the
versioning/migration contract. No persistence, no UI — just pure types and pure
functions, fully unit-tested.

### Subtasks

- [ ] Create Nx scopes/libs: `shared/domain`, `shared/data-access`,
      `shared-render-core`, plus a feature lib per module; wire scope/import
      boundary lint rules.
- [ ] Define `BaseRecord` (uuid `id`, `createdAt`, `updatedAt`, `deletedAt`) and
      `Song` / `Songbook` shapes (including Song `cache` for resolved
      title/subtitle, and Songbook `entries` as an ordered uuid array).
- [ ] Build the data-driven settings registry (per-setting `default`, `scopes`,
      editor kind) and derive the per-scope types from it.
- [ ] Implement `resolveSettings` (Global → Songbook → Song, most-specific wins,
      sparse, never persist the effective value).
- [ ] Define the Snapshot envelope and the `schemaVersion` concept.
- [ ] Define the forward-only migrator chain (`v_n → v_{n+1}`) and the single
      ingest gateway contract (`migrate(snapshot) → snapshot@current`).
- [ ] Document/enforce the preserve-unknown rule (patch in place, never rebuild
      from known keys).

---

## Epic 2: Music theory & parser

**User stories**: write a song; insert/validate chords; transpose up/down.
**Depends on**: Epic 1.

### What to build

The `ChordTheory` seam and the content parser. Turns raw content text into the
pure semantic AST the editor, renderer, search, and transpose all consume, and
provides the validity/transpose primitives — with the third-party theory engine
quarantined behind one adapter.

### Subtasks

- [ ] Define the `ChordTheory` port (parse chord, note chroma) in `shared/domain`.
- [ ] Implement the `TonalChordTheory` adapter in `shared/data-access` (the only
      `@tonaljs/*` importer) + a contract suite any implementation must pass.
- [ ] Implement Phase 1: line classification (blank / subtitle / title / labelled
      / lyric) + block boundaries, including the asterisk rule and the colon-run
      label rule.
- [ ] Implement Phase 2: inline scan for chords (overlay-by-index), escapes, and
      invalid-as-annotation handling.
- [ ] Resolve single effective title/subtitle ("last wins") and emit
      `SHADOWED_*` warnings.
- [ ] Implement `transposeContent` as pure domain policy (direction-based
      spelling tables; rewrites source; preserves quality; moves root + `/bass`).
- [ ] Wire the total-parser + structured-warning model; expose a debounced full
      reparse contract for the editor.

---

## Epic 3: SVG renderer

**User stories**: see the rendered song; one song, one page.
**Depends on**: Epic 2 (consumes the AST), Epic 1 (resolved settings).

### What to build

The from-scratch SVG renderer in `shared-render-core`: `layout` (the geometry
brain) produces a pure `RenderPlan`, `emit` serializes it to a self-contained SVG
string. Headless and framework-free, driven by an injected text-measurement port,
so it can render offscreen in a loop for batch export.

### Subtasks

- [ ] Define the `measureText` / `TextMeasurer` port and the browser-canvas
      implementation; keep the core free of `@angular/*`.
- [ ] Define the `RenderPlan` data structure (positioned items in base units,
      per-role styles, embedded fonts).
- [ ] Implement scale-to-fit (single uniform fit scale; `auto` vs manual) and the
      content-box / render-box model with user-owned aspect ratio.
- [ ] Implement column assignment + balancing (atomic blocks, minimize tallest
      column, base units).
- [ ] Implement the title region (top vs left spine; stacked vs inline; hug
      top-left).
- [ ] Implement chord x-positioning (left-edge-at-anchor, end-of-line anchor,
      same-index group, overlap-allowed) and vertical rhythm (chord row only
      above chorded lines; `hideChords` reflow-safe).
- [ ] Implement the label gutter (`labelInline`), chord-only line distribution,
      and the bridge convention.
- [ ] Bundle and embed the one v1 font both ways; add the `inlineFonts` emit
      option (screen vs export).

---

## Epic 4: Persistence & stores

**User stories**: my library persists offline; lists scroll smoothly.
**Depends on**: Epic 1.

### What to build

The durable local library and the in-memory reactive state on top of it.
IndexedDB via Dexie behind a paged/cursor API; signal stores that present a
growing windowed cache to the UI; all four ingest paths funnel through the
migration gateway.

### Subtasks

- [ ] Set up Dexie tables (`user`, `songs`, `songbooks`) with the tombstone field;
      make all deletes soft.
- [ ] Implement the paged/cursor API (`page({cursor, limit, sort, query})`),
      mockable in v1 (load-all-then-slice) behind the same interface.
- [ ] Build the entity stores (Songs, Songbooks) on NgRx SignalStore with
      `withEntities`; window cache appends pages; changing sort/search resets and
      refetches.
- [ ] Build the small hand-rolled stores (Settings, Session).
- [ ] Add the soft-delete `withComputed` filter (hide tombstoned from lists, keep
      for sync).
- [ ] Wire the `migrate()` ingest gateway in front of the local boot load
      (migrate-in-place, persist-at-current, bump).
- [ ] Produce/consume the Snapshot blob via `dexie-export-import`.

---

# Feature slices (vertical)

## Epic 5: Songs module & editor

**User stories**: list/search/sort/favorite songs; create, rename, duplicate,
delete (with in-use warning); edit a song with live preview, insert-syntax
buttons, transpose, and per-song render settings.
**Depends on**: Epics 2, 3, 4.

### What to build

The full authoring experience end-to-end: the song explorer (list + actions) and
the split-view editor (CodeMirror content on the left, live SVG preview on the
right, settings panel). This is the app's core loop.

### Subtasks

- [ ] Song explorer: list with infinite scroll, two-tier search, sort (name /
      created / changed / favorite), multi-select, bulk + row actions.
- [ ] Create / rename / duplicate / favorite a song.
- [ ] Delete with the "in use" warning + link that opens the songbook and selects
      the song; cascade tombstone out of songbooks.
- [ ] Editor adapter: CodeMirror 6 behind the loose-coupling seam; stream-parser
      highlight grammar; warning underlines from `ParserService`; reparse trigger;
      insert-at-cursor.
- [ ] Insert-syntax buttons (chord, title, subtitle, label) + transpose up/down +
      session-only undo/redo.
- [ ] Live preview: debounced reparse → renderer → mounted SVG; resizable split;
      mobile content/preview toggle.
- [ ] Per-song settings panel (GUI controls derived from the registry: scale,
      columns, title position/layout, aspect ratio).
- [ ] Keystroke-debounced autosave to IndexedDB.

---

## Epic 6: Songbooks module

**User stories**: group songs into an ordered songbook; add/remove/reorder
entries; the virtual "All songs" book; songbook-scoped chord styling.
**Depends on**: Epics 4, 5 (reuses the explorer in reduced-capability mode).

### What to build

The songbook builder: a left panel reusing the song explorer (identity/destructive
actions disabled) and a right songbook list with ordering and entry management,
plus the songbook-scope settings that re-theme every song performed in it.

### Subtasks

- [ ] Songbook list/CRUD; the always-present virtual **All songs** view
      (read-only order, no removal).
- [ ] Reduced-capability explorer in the left panel (search/sort/select/favorite/
      add-to-songbook on; delete/rename/duplicate/edit off).
- [ ] Add songs to a songbook (to start / end / above / below selected); allow the
      same song in multiple slots.
- [ ] Reorder entries (move one over / to start / to end). _(Drag & drop is
      marked future — track separately.)_
- [ ] Remove-from-songbook (slot removal, song stays in library).
- [ ] Songbook-scope settings (chord color/size; font is future) + title-page
      fields (title/subtitle/author).

---

## Epic 7: Export, import & download

**User stories**: export/import JSON to move data between machines; download songs
as PNG/PDF/ZIP and a songbook as a PDF.
**Depends on**: Epics 3, 4, 6.

### What to build

The two outbound formats and the inbound path: Export (round-trip JSON =
Snapshot), Download (rendered output for players), and Import with conflict
resolution. Download composes the headless renderer offscreen for batch and
songbook output.

### Subtasks

- [ ] Export selected songs/songbooks to the Snapshot JSON (content + settings).
- [ ] Import Export JSON (and, nice-to-have, downloaded files with embedded
      metadata) through the migration gateway.
- [ ] Import conflict resolution: songs replace / ignore / create-new (+ import
      all as new with date prefix); songbooks always create new.
- [ ] Single-song download: PNG (rasterize SVG cross-browser) and vector PDF
      (svg2pdf + jsPDF, selectable text).
- [ ] Multi-song download: ZIP of images / ZIP of PDFs / one multi-page PDF.
- [ ] Songbook PDF: title page / summary / page-number toggles + position, page
      size, outer fit per page (songs keep aspect ratio, scaled to slot).
- [ ] Prove the svg2pdf guardrail (chord x-positioning + font embedding) holds in
      the real pipeline.

---

## Epic 8: Stage (performing)

**User stories**: perform a selected songbook one song at a time with prev/next,
summary, swipe, and fullscreen.
**Depends on**: Epics 3, 6.

### What to build

The performance view: pick a songbook, enter performing mode showing one rendered
song with minimal chrome and gesture navigation. The launch point for hosting an
Audience (Epic 9).

### Subtasks

- [ ] Songbook picker → performing mode; "Perform" shortcut from Songbooks.
- [ ] One-song view with prev/next (disabled at ends; empty songbook can't be
      performed).
- [ ] Summary list (compact, search-only) to jump to a song.
- [ ] Swipe navigation + fullscreen (tap toggles navbar, no dedicated tap zone).
- [ ] "Create an audience" entry point (wires into Epic 9).

---

## Epic 9: Audience & lobby

**User stories**: host a lobby (PIN/QR) so viewers follow the selected song;
join an audience without an account; hide chords locally.
**Depends on**: Epics 3, 8, and Auth from Epic 10 (hosting is tier-gated).

### What to build

The realtime follow-along feature over Supabase Realtime Presence — no DB on the
live path. The host tracks the full current Song object into Presence; viewers
render it locally with the same renderer. Plus the fire-and-forget analytics log.

### Subtasks

- [ ] Host: open a lobby (random ~5-char PIN, unambiguous alphabet), channel per
      PIN, `track()` `{ currentSongObject, summary }`; re-track on song change.
- [ ] Generate the QR encoding the `/audience/:pin` deep link.
- [ ] Viewer: join by PIN or QR; `onPresenceSync` delivers current song + summary
      immediately; render locally; read-only summary.
- [ ] Hide-chords viewer-local toggle (reflow-safe — keeps reserved chord rows).
- [ ] Audience count from viewer Presence; lobby ends on host disconnect.
- [ ] Append-only `lobby_events` analytics (created / song_changed), off the
      Presence critical path, song_ref without content; RLS insert-by-owner.

---

## Epic 10: Auth & cloud sync

**User stories**: log in for cross-device sync; manual Google Drive backup (all
logged-in users); automatic Supabase sync (premium); link sign-in methods.
**Depends on**: Epics 1, 4 (Snapshot + stores).

### What to build

The account and sync layer: Supabase Auth, one `SyncBackend` port with two
backends (manual Drive for everyone, automatic Supabase for premium), tombstone
propagation, tier flag, and the load-bearing unsynced-leave warning.

### Subtasks

- [ ] Supabase Auth: Google OAuth sign-in; session persistence; tier read from
      `profiles.plan`.
- [ ] Provider linking: add-method-only (Google via `linkIdentity`, password via
      `updateUser`); email confirmation required; no merge / no unlink in v1.
- [ ] `SyncBackend` port + `SyncService` orchestration (push/pull; subscribe is a
      future no-op).
- [ ] Drive backend: two manual buttons (upload/download), `drive.file` scope, one
      `achordeon-backup.json`, whole-file LWW with a modifiedTime guard, Flow A
      token re-auth.
- [ ] Supabase backend: relational schema (`profiles`, `songs`, `songbooks`,
      `songbook_songs`) + RLS per `auth.uid()`; tombstones via `deleted_at`.
- [ ] Sync mechanics: coarse boundary push (editor save/close, reorder commit,
      app blur), debounced safety net, pull-on-launch/focus, per-row LWW.
- [ ] Auto-sync user toggle (enabled by `pro`, switchable off ≠ logged out).
- [ ] Warn-before-leaving when local changes haven't reached the cloud
      (`beforeunload` + in-app route guard).

---

# Cross-cutting & shell

## Epic 11: App shell, PWA, i18n & security

**User stories**: install the app and use it offline; switch language; update
safely; stay protected.
**Depends on**: Epic 1; touches every feature lib.

### What to build

The application frame and the cross-cutting concerns that don't belong to one
module: routing/nav, the offline PWA + update strategy, internationalization, and
the security posture.

### Subtasks

- [ ] Router config: lazy feature routes per module + default redirect; nav shell
      (desktop bar + mobile popup menu).
- [ ] `tierGuard` as highlight+tooltip (not a hard block) during testing; premium
      highlight markers + tooltips throughout.
- [ ] PWA: `@angular/service-worker` wired by hand; `ngsw-config.json` precaches
      the app shell; Audience + sync stay network paths.
- [ ] Update strategy: gentle dismissible "update available" affordance (never
      silent reload mid-performance); forced refuse-and-update path for newer
      `schemaVersion`; recovery on unrecoverable SW.
- [ ] i18n: `@angular/localize` runtime mode, EN + CS, one bundle; language switch
      persists in Settings + reloads.
- [ ] Security: CSP via meta + SRI on third-party scripts; enforce no-`innerHTML`
      for rendered content; shortest-lived sync tokens.

---

## Epic 12: Settings module

**User stories**: manage login/sync; choose theme and language; adjust global
render defaults.
**Depends on**: Epics 4, 5, 10, 11 (surfaces their state).

### What to build

The settings UI that exposes the cross-cutting state: profile/login + sync
controls, application preferences, and the global render defaults (the base of the
cascade), plus the manual export/import entry points.

### Subtasks

- [ ] Profile section: login/logout, "add a sign-in method", Connect Drive
      (drives the Google link if absent).
- [ ] Sync controls: Drive upload/download buttons, premium auto-sync toggle,
      manual export/import entry points.
- [ ] Application: theme (system/light/dark), language (EN/CS).
- [ ] Rendering: GUI for the **global** render defaults (the registry's Global
      scope), driving the same controls reused at Song/Songbook scope.
- [ ] Premium highlight markers on tier-gated controls.

---

## Suggested ordering

1. Epics 1 → 2 → 3 → 4 in order (foundation; 3 and 4 can overlap once 1–2 land).
2. Epic 5 (core loop) next — it exercises 2, 3, 4 together and de-risks them.
3. Epic 11 shell can start in parallel with 5 (router/nav/i18n needed early).
4. Epics 6 → 7 → 8 build on 5.
5. Epic 10 (auth/sync) before Epic 9 (hosting is tier-gated).
6. Epic 12 last — it surfaces state the others own.
