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

- [x] Create Nx scopes/libs: `shared/domain`, `shared/data-access`,
      `shared-render-core`, plus a feature lib per module; wire scope/import
      boundary lint rules.
- [x] Define `BaseRecord` (uuid `id`, `createdAt`, `updatedAt`, `deletedAt`) and
      `Song` / `Songbook` shapes (including Song `cache` for resolved
      title/subtitle, and Songbook `entries` as an ordered uuid array).
- [x] Build the data-driven settings registry (per-setting `default`, `scopes`,
      editor kind) and derive the per-scope types from it.
- [x] Implement `resolveSettings` (Global → Songbook → Song, most-specific wins,
      sparse, never persist the effective value).
- [x] Define the Snapshot envelope and the `schemaVersion` concept.
- [x] Define the forward-only migrator chain (`v_n → v_{n+1}`) and the single
      ingest gateway contract (`migrate(snapshot) → snapshot@current`).
- [x] Document/enforce the preserve-unknown rule (patch in place, never rebuild
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

- [x] Define the `ChordTheory` port (parse chord, note chroma) in `shared/domain`.
- [x] Implement the `TonalChordTheory` adapter in `shared/data-access` (the only
      `@tonaljs/*` importer) + a contract suite any implementation must pass.
- [x] Implement Phase 1: line classification (blank / subtitle / title / labelled
      / lyric) + block boundaries, including the asterisk rule and the colon-run
      label rule.
- [x] Implement Phase 2: inline scan for chords (overlay-by-index), escapes, and
      invalid-as-annotation handling.
- [x] Resolve single effective title/subtitle ("last wins") and emit
      `SHADOWED_*` warnings.
- [x] Implement `transposeContent` as pure domain policy (direction-based
      spelling tables; rewrites source; preserves quality; moves root + `/bass`).
- [x] Wire the total-parser + structured-warning model; expose a debounced full
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

- [x] Define the `measureText` / `TextMeasurer` port and the browser-canvas
      implementation; keep the core free of `@angular/*`.
- [x] Define the `RenderPlan` data structure (positioned items in base units,
      per-role styles, embedded fonts).
- [x] Implement scale-to-fit (single uniform fit scale; `auto` vs manual) and the
      content-box / render-box model with user-owned aspect ratio.
- [x] Implement column assignment + balancing (atomic blocks, minimize tallest
      column, base units).
- [x] Implement the title region (top vs left spine; stacked vs inline; hug
      top-left).
- [x] Implement chord x-positioning (left-edge-at-anchor, end-of-line anchor,
      same-index group, overlap-allowed) and vertical rhythm (chord row only
      above chorded lines; `hideChords` reflow-safe).
- [x] Implement the label gutter (`labelInline`), chord-only line distribution,
      and the bridge convention.
- [x] Bundle and embed the one v1 font both ways; add the `inlineFonts` emit
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

- [x] Set up Dexie tables (`user`, `songs`, `songbooks`) with the tombstone field;
      make all deletes soft.
- [x] Implement the paged/cursor API (`page({cursor, limit, sort, query})`),
      mockable in v1 (load-all-then-slice) behind the same interface.
- [x] Build the entity stores (Songs, Songbooks) on NgRx SignalStore with
      `withEntities`; window cache appends pages; changing sort/search resets and
      refetches.
- [x] Build the small hand-rolled stores (Settings, Session).
- [x] Add the soft-delete `withComputed` filter (hide tombstoned from lists, keep
      for sync).
- [x] Wire the `migrate()` ingest gateway in front of the local boot load
      (migrate-in-place, persist-at-current, bump).
- [x] Produce/consume the Snapshot blob via `dexie-export-import`.

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

- [x] Song explorer: list with infinite scroll, two-tier search, sort (name /
      created / changed / favorite), multi-select, bulk + row actions.
- [x] Create / rename / duplicate / favorite a song.
- [x] Delete with the "in use" warning + link that opens the songbook and selects
      the song; cascade tombstone out of songbooks.
- [x] Editor adapter: CodeMirror 6 behind the loose-coupling seam; stream-parser
      highlight grammar; warning underlines from `ParserService`; reparse trigger;
      insert-at-cursor.
- [x] Insert-syntax buttons (chord, title, subtitle, label) + transpose up/down +
      session-only undo/redo.
- [x] Live preview: debounced reparse → renderer → mounted SVG; resizable split;
      mobile content/preview toggle.
- [x] Per-song settings panel (GUI controls derived from the registry: scale,
      columns, title position/layout, aspect ratio).
- [x] Keystroke-debounced autosave to IndexedDB.

### Landed — what implementation changed

Corrections the build forced, recorded so they aren't re-litigated:

- **The explorer lives in `app/shared`, not `songs/`.** CONTEXT.md gives it two
  homes and a feature folder may not import a sibling. Capabilities are a
  per-mount input, so Epic 6 turns actions off rather than forking it.
- **`withComponentInputBinding` overwrites an `input()` default with `undefined`**
  when a query param is absent. Route params are now typed as the strings a URL
  actually holds and narrowed at the boundary — which also disarms `?sort=bogus`.
  Epic 13 ticked this box but never wired the provider; it is wired now.
- **Epic 5 was the first thing to actually run the foundation, and it found six
  bugs in it** — each now has a test:
  - `songPagingConfig` never searched a song's **Name** (Epic 4).
  - `SongStore` let a stale fetch land last and overwrite the window; and an
    `upsert` could not place a row, so a renamed song ignored the sort until a
    refetch (`refresh()`, Epic 4).
  - The label gutter had no gap, so labels touched their lyrics — `gutterGapEm`
    was in the tuning and read by nothing (Epic 3, §4.8).
  - `measure` named only the bundled family while `emit` named the fallback
    stack, so widths were measured against a font that was never drawn and
    lyrics ran off the page (Epic 3).
  - `parseAspectRatio` and `fitContent` rejected numeric **strings**, which is
    all a settings GUI can produce: a typed ratio silently rendered as A4 and
    manual scale never worked at all (Epic 3).
- **ADR-0010's seam is a lint rule**, not a promise: a CodeMirror import outside
  `songs/editor/` fails the build.
- **Diagnostics are pushed (`setDiagnostics`), not sourced (`linter()`)** — a
  linter runs on doc changes, and our warnings arrive a debounce later.
- **CodeMirror and the mounted SVG are styled outside component `styles`.** Both
  are built by code rather than by the template, so they carry no encapsulation
  attribute and scoped rules never match them.
- **Hover tooltips are pointer-transparent**; only the `(?)` toggle-tip is
  hoverable. A label panel placed beside its button covered the next button, and
  WCAG 1.4.13 "hoverable" then held it there — Undo was unclickable.
- **An outside edit isolates the undo history**, or a transpose merges into the
  typing before it and one Ctrl+Z discards both.
- **No bold/italic insert buttons** (PRD-UI-SHELL.md §4 sketches them): Phase 2
  markdown is unimplemented, so they would write syntax the renderer ignores.
- **Landed early, as frames, because Epic 5 needed somewhere to point:** the
  `/songbooks/:id` route (the in-use warning links to it) and the shell's pane
  switcher (§4 gave it a slot but no control).

**Still open:** the render names the bundled Roboto Mono and screen is honest, but
the FontBook carries no bytes — **Epic 7 must embed real ones** or the PDF has
nothing to register (§3, §4.10).

**Still open — keyboard navigability.** Escape leaves the editor for the library
(guarded so the settings dialog and the rename field keep their own Escape). That
is _one shortcut, not a keymap_. The whole-app requirement — every action
reachable without a pointer, a documented map, roving focus in the toolbars and
the list, and the custom-shortcut config UI that `DOC-REVISION-PLAN.md` carries as
TBD — is **not** done and does not belong to this epic. It wants its own, after
the module set is complete and there is a full inventory of actions to bind.

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

- [x] Songbook list/CRUD; the always-present virtual **All songs** view
      (read-only order, no removal).
- [x] Reduced-capability explorer in the left panel (search/sort/select/favorite/
      add-to-songbook on; delete/rename/duplicate/edit off).
- [x] Add songs to a songbook (to start / end / above / below selected); allow the
      same song in multiple slots.
- [x] Reorder entries (move one over / to start / to end), by selection from the
      strip and per row from the row's own buttons. _(Drag & drop is **Epic
      14**, which depends on this epic.)_
- [x] Remove-from-songbook (slot removal, song stays in library).
- [x] Songbook-scope settings (chord color/size; font is future) + title-page
      fields (title/subtitle/author).

### Landed — what implementation changed

Corrections the build forced, recorded so they aren't re-litigated:

- **`ALL_SONGS_ID` is a domain constant, not a route special case.** It is an id
  `crypto.randomUUID()` cannot produce, so `/songbooks/:id` carries the real and
  the virtual book without a second route — and every write path asks
  `isVirtual` once, in the presenter, rather than each button remembering.
- **A row in pane B is a _slot_, keyed by index, never by song id.** The same
  song may fill several, so ordering, selection and removal are all
  index-shaped. Reorder therefore has to return the **new selection** as well as
  the new order: without it the ticks stay on indexes that now hold other songs,
  and pressing "up" twice moves two different songs.
- **Entry songs are hydrated by id from the repository**, not read out of the
  explorer's window — a slot must not render blank because of what is typed in
  the search box.
- **Remove-from-songbook gets no confirmation**, deliberately: nothing is
  destroyed, and a dialog here would train the user to click through the one
  guarding a real delete. The row mark is an X, not the bin.
- **`chordSize` was song-scoped only** (Epic 1's registry), so a songbook could
  re-colour its chords but not resize them — half a theme against CONTEXT.md
  §Songbook. Fixed in the registry, which is all a data-driven cascade needs.
- **A presenter's fallback name must not be another object's name.** `name()`
  returned "All songs" for _any_ unloaded book; the action-bar heading is a
  rename field bound to it, so the value arriving late overwrote what the user
  had typed. Now empty while a real book loads.
- **Songbook settings open as a modal**, unlike the editor's container dialog:
  there is no live render behind it worth keeping visible.
- **The row and the checkbox are two different gestures** — the row means "only
  this one", the checkbox "this one as well". Before, the row body did not
  select at all, so clicking a song and pressing Add put nothing anywhere and
  the checkbox was a door you had to already know about. Applies to the Songs
  module too; it is one component.
- **A selection belongs to the list it was made in, not to the app.** It moved
  out of `SessionStore` (which keeps only `currentSongId`) into the presenter
  that mounts the list — one app-wide set meant songs ticked in the library
  arrived in the songbook builder pre-armed against a different set of buttons.
- **`above` with nothing selected falls back to the _start_**, not the end: a
  button that says above must never append. Hovering an Add button draws the
  insertion line in the entry list, because a position you cannot see is a
  promise the user has to take on trust.
- **Add and reorder share one icon family** (arrow-into-a-line for the ends,
  chevrons for one step): both answer "where in this list", and that is learnt
  once. Layout follows the transfer-list handoff — the transfer buttons in a
  column _between_ the two lists, move buttons at the left of pane B's toolbar.
- **The Add buttons wear the reorder set's own glyphs.** They briefly carried a
  right arrow with the position badged onto it, to say "across into the book";
  the direction is already obvious from which pane you are looking at, and the
  badge cost the position mark its legibility. Remove is still a left arrow,
  set apart below the four, and answers pane B's selection rather than pane A's.
- **`<app-selection-status>` is one control, mounted three times**: the Songs
  action bar, the songbook action bar, and the entry strip. It is "Clear (N)"
  and nothing else — a "3 selected" label beside a "Clear (3)" button is the
  same number twice. Text and not an X, because the bar already spends an X on
  "back to songbooks".
- **`/songbooks` is split, not single-pane** [corrects PRD-UI-SHELL.md §4's
  table]. It is the same shape of screen as `/songs` — a list on the left, the
  thing you picked on the right — so it answers the same gestures: a click
  selects and previews, a double click opens. The preview is the songbook's
  **title page**, standing in as plain text until Epic 7 renders the real one.
- **A dialog's Escape stops at the dialog** (`stopPropagation`). Screens that
  open one also bind Escape on `document` to mean "leave this screen", and a
  press from inside the dialog ran both: it closed, then the screen's handler
  found nothing open and walked out too. The element that consumed the key is
  the one that has to say so — a guard on the other side is too late.
- **Reordering is per row as well as per selection.** The row's own buttons act
  on the row you are pointing at, because ticking it first and unticking it
  after is a step the pointer has already made. The ticks ride along untouched:
  they belong to the strip's gesture, not to this one. They **stand down once
  several rows are ticked** — the strip already moves a block, and two
  affordances that disagree about what they act on are worse than one that steps
  aside. A pointer click also blurs the button, or `:focus-within` leaves the
  strip hanging over a row nobody is pointing at (keyboard activation keeps
  focus: `event.detail === 0`).
- **`favorite` is not a sort axis; `favoritesFirst` is a flag** [corrects Epic
  1's registry and CONTEXT.md §Song explorer's list]. Sorting _by_ favourite
  answers "which are starred" and leaves everything else in tiebreak order,
  which is a list nobody asked for. What people mean is "my starred songs at the
  top of the list I am already reading", so it now floats them above any axis
  (`?fav=1`). `PagingConfig` gained `isFavorite`, absent for entities with no
  such flag — a songbook has none, and the request is then a no-op.
- **All songs says what it is** (a `(?)` note on its row), and its entry pane
  offers the one thing a read-only order can be told: **how it is sorted**. That
  is why `canSearch` and `canSort` are separate capabilities.
- **Split size is a preference, not a constant.** `UiStore.isSplitShared`
  (default on) links every module's splitter; off, each remembers its own.
  Linking adopts the ratio you are looking at rather than resurrecting an older
  shared value — the pane you are sizing must not jump out from under you.
- **Pane B is the _same list component_ as pane A** (`ENTRY_CAPABILITIES`:
  numbered, removable, no search or sort). Two lists side by side that answered
  the same click differently was the defect; one component cannot drift from
  itself. `SongRow` grew `position` (its index in the list as drawn) and its
  `id` is documented as "what this row IS" — a Song in the library, a **slot**
  in a songbook, which is why removing one slot never takes its twins.
  `SongbookEntries` is deleted.

**Still open:** drag & drop is **Epic 14**, which depends on this epic. The
songbook **download** options (title page / summary / print) are Epic 7's, not
this one's — including the real title-page render, which `<app-title-page>`
stands in for as plain text until then.

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
      **Replaces `<app-title-page>`**, the plain-text stand-in Epic 6 mounts in
      `/songbooks` pane B: the real title page is a rendered page, and its
      layout is decided by these options rather than by the preview.
- [ ] Prove the svg2pdf guardrail (chord x-positioning + font embedding) holds in
      the real pipeline.
- [ ] **Real font bytes, for N faces.** `FontBook` carries none today, so the
      SVG relies on a CSS-loaded face and the PDF has nothing to register. Bundle
      the body TTF **and** the `titleFont` catalog's faces (a serif, a
      condensed/display, a script — PRD-RENDERING §4.10), keyed by family so only
      the faces a song actually uses are embedded. Until then every catalog choice
      resolves to a CSS generic: fine on screen, unembeddable on export. Doing
      this for one font and then again for N would be building the plumbing twice,
      which is why it is one subtask.
- [ ] Coordinate with Epic 11's precache list: precache the body face only, fetch
      a title face on first use. Each TTF is ~100–300 KB.

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

## Epic 14: Drag & drop

**User stories**: drag songs from the library into a songbook and drop them
where they go; drag a songbook entry to reorder it.
**Depends on**: **Epic 6** — it drags between that module's two panes, onto the
order that module owns.

### What to build

The pointer half of the songbook builder. Epic 6 landed every one of these acts
as a button (add at four positions, move a row or a selection, remove a slot);
this adds the direct-manipulation path to the same commands, so the two can
never disagree about what happens — a drop calls `addSelected`/`moveSlot`, it
does not re-implement them.

`songbooks/index.mdx` carries a `:::danger[FUTURE]` admonition saying drag &
drop is not implemented. **Removing that admonition is this epic's last
subtask**, and the honest signal that it is done.

### Subtasks

- [ ] `cdkDropList` on both panes of `/songbooks/:id`, with a drop indicator
      that reuses Epic 6's insertion line (the same mark the Add buttons
      preview) rather than inventing a second one.
- [ ] Drag from the library into the songbook: dropping inserts at the indicator,
      carrying the **whole selection** when the dragged row is part of it — the
      Add buttons' rule, so a drag and a button press behave alike.
- [ ] Drag within the songbook to reorder, including a multi-slot selection as a
      block (`moveEntries` already answers this; the drop supplies the index).
- [ ] A drag handle per row, and **not the whole row**: the row is already a
      click target that selects, and a list where pressing a row might drag it
      is a list you cannot click confidently on touch.
- [ ] Auto-scroll at the edges of a virtualised viewport, and prove a drop lands
      correctly when the source and target rows were never rendered together.
- [ ] Keyboard parity is **already met** by Epic 6's buttons — confirm it stays
      met (WCAG 2.1.1: dragging must not be the only way to reorder), and do not
      add a keyboard drag mode that duplicates them.
- [ ] Touch: a long-press to start a drag, without stealing the tap that selects
      or the swipe that scrolls.
- [ ] Remove the FUTURE admonition from `songbooks/index.mdx`.

---

# Cross-cutting & shell

## Epic 13: UI shell core (temporary UI)

**User stories**: navigate between modules; work in two resizable panes on desktop
and switch between them on mobile; use the app in dark or light.
**Depends on**: Epic 4 (stores exist to bind against) — **plus one addition to
`SongStore`**: a "which song changed last" query (`sort: 'changed', dir: 'desc',
limit: 1`) for the `/songs` auto-select. `live()[0]` is wrong — the window is sorted by
`name` and may not contain it.
**Blocks**: the UI half of Epics 5, 6, 8, 9, 12 — land this before the first feature
screen, so no feature invents its own frame.
**Spec**: `docs/PRD-UI-SHELL.md`.

### What to build

The application frame and the seam under it: an icon rail (desktop) / hamburger +
action bar (mobile), a resizable two-pane primitive that collapses to tabs, theming,
and the presenter discipline that lets all of it be deleted later without touching
the business layer. Deliberately temporary — scored on how cheap the replacement is,
not on how it looks.

### Subtasks

- [x] Add `@angular/aria` + `@angular/cdk` on the **21.x** line (headless, signal-based,
      first-party; **no Material**). **v21 ships only 8 patterns** — accordion,
      combobox, grid, listbox, menu, tabs, toolbar, tree. No Dialog/Disclosure until
      v22 (D11), so those are hand-rolled on CDK Overlay.
- [x] `<app-icon>` over inlined Lucide SVGs from **`lucide-static`** (no peer deps).
      **Not `lucide-angular`** — it peers `@angular/core: 13.x - 21.x` and would be a
      second Angular-22 gate beside `@ngrx/signals`. **No Google Fonts CDN** (breaks
      offline + CSP; Angular's own Aria examples contain that `@import` — don't copy it).
- [x] Token layer: brand `hsl(11 80% 42%)` stored as h/s/l channels + derived
      hover/active/subtle; grey ramp; `--premium-glow`; `--space-*` (4px base) and
      `--text-*`. **`--brand-l: 55%` in dark** (3.8:1 → 5.7:1). Components read tokens,
      never literal colors.
- [x] UI font: **Roboto Mono**, self-hosted via `@fontsource-variable/roboto-mono` (no
      peer deps). **Import the `latin-ext` subset** — plain `latin` has no `ě ř ů ď ť ň`
      and CS would silently fall back mid-word. Chrome font only; the render's fonts are
      PRD-RENDERING's problem.
- [x] **Import ladder** (`primitives/` ← `shared/` ← features): `primitives/` imports
      node_modules only; `shared/` (incl. `shared/layout/`) imports primitives +
      `@achordeon/shared/domain` **types only, never data-access**; features import
      downward only.
- [x] `app/layout` shell: full-height icon rail (Songs, Songbooks, Stage, Audience;
      Settings pinned bottom) on `ngToolbar`/`ngToolbarWidget`, with active indicator;
      shared Fullscreen mode (browser fullscreen + wake lock + chrome auto-hide,
      revealed on any pointer move) that Stage and Audience both toggle. NOT a route
      flag — a flag cannot express "hidden now, back on the next tap".
- [x] `<app-action-bar>`: sits **above pane A only, never spanning pane B**; wraps to
      N rows grouped **by meaning** (row 1 insert, row 2 transform), no tabs; `⋯`
      overflow is a mobile-only concession. Feature projects its own actions.
- [x] Mobile frame: **nav trigger in the bottom bar** — composite glyph, active
      module's icon badged into a full-size hamburger's corner, **no text**, fixed 48px, opening the nav
      popup upward. `☰` keeps the "opens nav" affordance, the module icon adds the
      "you are here" state (the rail's job on desktop); bottom-left is thumb-reachable.
      **Needs an i18n'd `aria-label` naming module + action** — with no text and no
      hover tooltip, it's the only thing a screen reader gets. Bottom bar also carries
      the pane switcher + module actions. Single `Viewport` service (`matchMedia` +
      signal, no `BreakpointObserver`, no RxJS) reading `--bp-compact` off `:root`.
- [x] Base components (~12, ours): button, icon button, text field, search field, list
      row, segmented control, tooltip, dialog chrome, empty state, spinner, badge, rail
      item. Aria directives supply the behaviour; the CSS is ours from line one.
- [x] `<app-tooltip>` on `cdkConnectedOverlay` (**Aria has no tooltip pattern**), two
      triggers: `hover` = icon-button labels (**every** icon-only button — rail, action
      bar), `click` = the settings `(?)` toggle tip (touch has no hover, and settings
      are edited on mobile). Hover must satisfy **WCAG 1.4.13**: dismissible (Esc),
      hoverable, persistent. Label tooltips are `aria-hidden` (the button's `aria-label`
      is the name — don't announce twice); `(?)` uses `aria-describedby` since its
      content differs from the name.
- [x] Settings help copy as `Record<keyof typeof SETTINGS, string>` **in the panel, not
      the registry** — `shared/domain` is pure and must not take an `@angular/localize`
      dep for UI copy. The `Record` makes a new setting fail to compile until its help
      exists.
- [x] `<app-split-pane>`: hand-rolled CSS-grid + pointer-capture resizer, keyboard
      accessible, ratio out / stateless about persistence, one pane below the
      breakpoint. Must not thrash the render preview during drag. Mins are asymmetric:
      **pane A 320px** (sized to hold the settings dialog), **pane B 240px**.
- [x] `<app-settings-panel>` in `app/shared`: a **controlled form** —
      `[scope] [values] [inherited]` in, `(changed)` sparse patch out. Holds no state,
      injects no store. Reads `SETTINGS` (domain types) to know which rows a scope may
      override and which control each takes; per-control inherited/overridden badge +
      reset (ADR-0006). **Three feature wrappers** bind it to their presenters:
      `settings`=global, `songbooks`=songbook, `songs`=song. **Epic 12 mounts this same
      component — build it once.**
- [x] Editor mount: the panel opens as a dialog **centered on pane A, with no viewport
      backdrop** — the render must stay visible while you tune it. Focus-trapped
      (`cdkTrapFocus`); Esc / close / click-outside dismiss; session-only open state.
      Mobile: ~45% bottom sheet over the render.
- [x] `<app-premium>`: gold-shadow wrapper + tooltip text **appended** to the control's
      own label ("Transpose — Premium feature available for testing"). `aria-label`
      stays the plain name; the note rides `aria-describedby`. Decoration over a working
      control — never disabled (`tierGuard` is highlight-not-block, PRD-INFRA §10).
- [x] `/songs` pane B: renders `SessionStore.currentSongId`; **auto-select the most
      recently updated song** on entry; blank page when none (empty library).
- [x] Theme applier: `effect` mirroring `SettingsStore.theme()` onto
      `<html data-theme>` + `color-scheme`; inline pre-paint script in
      `index.html.template` to kill the flash. Render preview stays light (it's a
      document, not chrome) — no UI tokens into `render-core`.
- [x] Breakpoint **1200px** single-sourced: `$bp-compact` in `_breakpoints.scss` drives
      both the media queries and a `--bp-compact` custom property that TS reads. One
      edit to change; CSS and TS cannot drift.
- [x] `UiStore` (hand-rolled, in `app/layout`, `localStorage`-backed): split ratio,
      rail collapsed, session-only fullscreen. **Not** in `shared/data-access` — it is
      shell state and must not sync.
- [x] Router: `withComponentInputBinding()`; search-param contract for `?q=`,
      `?sort=`, `?pane=` so params arrive as signal inputs.
- [x] Seam enforcement: presenter-per-feature (signals in, commands out); update
      `apps/app/eslint.config.mjs` — add a `layout` boundaries element, and forbid
      components from importing `@achordeon/shared/data-access`.
- [x] `data-testid` on every shell element + an `apps/app-e2e` smoke spec that selects
      only on those — the mechanical proof the seam holds across the UI swap.

### Landed — what implementation changed

Corrections the build forced, recorded so they aren't re-litigated:

- **Aria v21 ships 8 patterns**, not the doc's list (that is v22's). No Dialog,
  Disclosure, Checkbox, Switch or Radio Group → hand-rolled on CDK Overlay. (D11)
- **The rail is a `<nav>` of links, not `ngToolbar`** — the router already owns
  "which module", and the WAI-ARIA APG reserves menu/toolbar semantics for
  application commands, not navigation. Same for the mobile popup. The action bar
  keeps `ngToolbar`; it is a real command group.
- **`Router.lastSuccessfulNavigation` is a Signal in Angular 21**, so the active
  module needs no `router.events` and no `toSignal` — no-RxJS holds natively.
- **`lucide-angular` peers `@angular/core: 13.x - 21.x`** → replaced with
  `lucide-static` (no peers) before it became a second Angular-22 gate.
- **The Roboto Mono variable package has no per-subset CSS** — one `index.css`,
  `unicode-range`-gated. latin-ext still required for CS; wire via the build's
  `styles` array.
- **`UiStore` persists from setters, not an `effect`** — an effect flushes on a
  later tick, so drag-then-close-tab lost the ratio.

**Closed by Epic 5:** `/songs` auto-select of the most recently updated song.
`SongStore.lastChanged()` is that query — run past the window, since `live()[0]`
answers the name sort, not "which changed last".

---

## Epic 11: App shell, PWA, i18n & security

**User stories**: install the app and use it offline; switch language; update
safely; stay protected.
**Depends on**: Epic 1; touches every feature lib.

### What to build

The application frame and the cross-cutting concerns that don't belong to one
module: routing/nav, the offline PWA + update strategy, internationalization, and
the security posture.

### Subtasks

- [ ] Router config: lazy feature routes per module + default redirect. (The nav
      shell itself — rail, mobile bar, split, theme — is **Epic 13**.)
- [ ] `tierGuard` as highlight+tooltip (not a hard block) during testing. (The
      `<app-premium>` marker itself is **Epic 13** — it's a tooltip consumer; this
      subtask is only the guard + deciding which controls wear it.)
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
      scope) — mount `<app-settings-panel [scope]="'global'">` from **Epic 13**; the
      panel is built once and reused at Song/Songbook scope. Don't rebuild it here.
- [ ] Premium highlight markers on tier-gated controls.

---

## Suggested ordering

1. Epics 1 → 2 → 3 → 4 in order (foundation; 3 and 4 can overlap once 1–2 land).
2. Epic 13 (UI shell core) next — it gives every feature screen a frame to land in,
   so no feature invents its own.
3. Epic 5 (core loop) next — it exercises 2, 3, 4, 13 together and de-risks them.
4. Epic 11 can start in parallel with 5 (routing/PWA/i18n needed early).
5. Epics 6 → 7 → 8 build on 5.
6. Epic 10 (auth/sync) before Epic 9 (hosting is tier-gated).
7. Epic 12 last — it surfaces state the others own.
8. Epic 14 (drag & drop) any time after 6, and deliberately **not before** 7 or
   8: every act it offers already has a working button, so it is polish on a
   solved problem while whole features are still missing.
