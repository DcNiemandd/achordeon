# Prompt

```
i want you to implement the work even thought i told you not to before. I want you to commit witht your signature. I want you to use @docs and @docs/achordeon-implementation.md specificaly. If you have questions, leave them at the end and continue with different work.

implement epic 8
```

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

- **What to bucreild** — the end-to-end behaviour of the slice, layer-agnostic.
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

**Closed by Epic 7:** the FontBook now carries real bytes. Four bundled TTFs
(`apps/app/public/fonts`), fetched by `FontLoader`, inlined into the export SVG
and registered with jsPDF (§3, §4.10).

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
- **The builder never becomes a tab switcher**, and that needed a second
  breakpoint: `$bp-stack: 500px` beside `$bp-compact: 1200px`. They ask
  different questions — "is the shell compact" versus "can two lists sit beside
  each other" — so `<app-split-pane>` takes a `narrow` input: `switch` (one pane
  plus the shell's switcher, right where the panes are alternatives: write, then
  look) or `stack` (both panes, one above the other, right where they are a
  **pair**). A transfer list that hides its destination behind a tab is one you
  cannot transfer across, and Epic 14 could not drag across it either.
- **All songs drops its library pane below the stack breakpoint.** That pane
  exists to pick songs to add, and the virtual book takes none; on a phone it is
  half the screen spent on a pane whose every button is off. The entry list is
  one `ng-template` with two homes, so pane A can host it when pane B is gone.
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

**Closed since:** drag & drop landed as **Epic 14**. The songbook **download**
options (title page / summary / print) landed as Epic 7 — including the real
title-page render, which now draws `/songbooks` pane B as well as the PDF's first
page. `<app-title-page>`, the plain-text stand-in, is deleted.

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

- [x] Export selected songs/songbooks to the Snapshot JSON (content + settings).
- [x] Import Export JSON (and, nice-to-have, downloaded files with embedded
      metadata) through the migration gateway.
- [x] Import conflict resolution: songs replace / ignore / create-new (+ import
      all as new with date prefix); songbooks always create new.
- [x] Single-song download: PNG (rasterize SVG cross-browser) and vector PDF
      (svg2pdf + jsPDF, selectable text).
- [x] Multi-song download: ZIP of images / ZIP of PDFs / one multi-page PDF.
- [x] Songbook PDF: title page / summary / page-number toggles + position, page
      size, outer fit per page (songs keep aspect ratio, scaled to slot).
      **Replaces `<app-title-page>`**, the plain-text stand-in Epic 6 mounts in
      `/songbooks` pane B: the real title page is a rendered page, and its
      layout is decided by these options rather than by the preview.
- [x] Prove the svg2pdf guardrail (chord x-positioning + font embedding) holds in
      the real pipeline.
- [x] **Real font bytes, for N faces.** `FontBook` carries none today, so the
      SVG relies on a CSS-loaded face and the PDF has nothing to register. Bundle
      the body TTF **and** the `titleFont` catalog's faces (a serif, a
      condensed/display, a script — PRD-RENDERING §4.10), keyed by family so only
      the faces a song actually uses are embedded. Until then every catalog choice
      resolves to a CSS generic: fine on screen, unembeddable on export. Doing
      this for one font and then again for N would be building the plumbing twice,
      which is why it is one subtask.
- [x] Coordinate with Epic 11's precache list: precache the body face only, fetch
      a title face on first use. Each TTF is ~100–300 KB.

### Landed — what implementation changed

Corrections the build forced, recorded so they aren't re-litigated:

- **The `FontBook` could not stay bound once.** `createLayout` took a fixed list
  of faces, but which faces a render needs is a function of the song's
  `titleFont` — a _setting_, not a platform fact. `LayoutConfig.fonts` is now a
  `FontResolver` that `layout` calls with the faces the resolved styles actually
  name, so a body-font song carries no script face it never draws with.
- **The faces are assets, not a generated constant** [corrects the shape
  `fonts.ts` implied]. Base64 in a TS file would be ~1.3× its own weight in the
  initial bundle, times four families, and Epic 11 wants the opposite split. They
  live in `apps/app/public/fonts` and `FontLoader` fetches each once, then spends
  it three ways: registered with `FontFace` (measurer + screen), kept as base64
  (`emit({inlineFonts})`), and handed to jsPDF. Same bytes, so a PDF cannot
  disagree with the screen about where a chord sits.
- **`tuning.fontFamily` is the STATIC Roboto Mono**, not the variable webfont the
  chrome is set in. `addFont` takes a static TTF; a face the render measures and
  the export cannot embed is the one failure a document app must not have.
- **`titleFont` swapped `'sans'` for `'display'` + `'script'`** — §4.10's
  recommended set, and a plain sans was the choice that looked least unlike the
  body mono at title size while costing the same to bundle. Not a schema break:
  nothing about the record's shape moved, and a song still holding `'sans'`
  resolves to `'body'`, the setting's own default.
- **jsPDF, svg2pdf and fflate are `import()`ed on the gesture.** Statically
  imported they broke the app's 1 MB initial budget outright (~500 KB together).
  The ZIP is stored rather than deflated: every entry is already a compressed
  stream, so deflating buys a percent and costs a pass over megabytes on the
  main thread.
- **An exported songbook drags its songs along.** A book is a list of references,
  so exporting one without them produces a file that imports an empty songbook on
  precisely the machine that needed it. Conversely the envelope carries **no
  `user` row**: that holds the global render defaults, and a file that re-based
  the receiver's whole library on the sender's would change every song they had.
- **Import is three calls, not one** (read / plan / apply). "What would this file
  do to my library" has to be answerable before anything is written. And because
  songbooks are always created new, their `entries` must be **re-pointed** through
  the id map — a book that kept the old ids would quietly fill up with the local
  songs it was never about. A slot neither the file nor the library can fill is
  dropped rather than left dangling.
- **Incoming tombstones are dropped, not applied.** A snapshot carries them so a
  _sync_ can propagate a delete; an import is someone handing you songs, and a
  file that silently deleted rows on the receiving side would be the least
  expected thing it could do.
- **Embedded metadata is PNG-only** [narrows §8's "downloaded files"]. A `tEXt`
  chunk holds the Export JSON, so one file is both the picture and the song. A
  PDF could carry the string in its document properties, but reading it back
  means parsing PDF object streams to recover something already available two
  other ways — a dependency for one more accepted file type. Not built.
- **A single song's page IS its render box**, pinned to A4's short side, so an
  A4-shaped song prints as exactly A4 and any other shape prints as itself. The
  songbook is the other case and the only one where a single paper size is the
  point.
- **The songbook title page is a render**, from `titlePageAst` — one definition of
  what a title page is made of, drawn by the PDF and previewed in `/songbooks`
  pane B. `<app-title-page>` is deleted. The summary is the exception and is
  drawn as PDF text: its page numbers are only knowable once pagination is
  decided, so it is counted first and drawn second.
- **"Double-sided" is dropped from the songbook download options** [corrects
  `songbooks/index.mdx`]. Every song is exactly one page (PRD-RENDERING §4.1), so
  there is no spread for a sheet turn to break — the option had nothing left to
  decide. Page margin took its place, which duplex printing actually needs.
- **All songs cannot be downloaded as a songbook.** It has no record, so no title
  page, no author and no order of its own — the three things a songbook PDF is
  made of. The buttons are off rather than pretending.
- **The guardrail is an e2e that reads the file's bytes**, not a mock: `%PDF`,
  `/FontFile2`, text operators, and no image XObject. The 2026-06-29 spike proved
  svg2pdf _could_; this proves the production path still _does_, which is what
  would catch a face that stopped being registered — a failure that is otherwise
  silent, coming out as Helvetica with every chord over the wrong character.

**Deferred to Epic 11, by design:** the precache _list_. There is no
`ngsw-config.json` yet, so the split it will encode is expressed in code instead
— `FontLoader` fetches the body face at boot and every title face on first use.
Epic 11 writes that down; nothing about it needs revisiting.

### Landed — a second pass, from using it

Corrections from actually printing a songbook and moving songs around:

- **Front matter is not numbered; the first song is page 1.** Numbering the
  title page and summary made the summary point at "page 3" for the first song —
  a number the reader can only use by counting past two sheets that also claim
  numbers. The printed number and the physical sheet now differ by the
  front-matter count, and the summary's links convert.
- **The summary links, whole-line.** A page number is a two-character target and
  the title is what a reader points at, so both go to the page (`textWithLink`).
- **The summary is set in the bundled body face, not jsPDF's Helvetica.**
  Helvetica is WinAnsi and has no `ě ř ů`, so every Czech title in the contents
  came out with holes while the song two pages on was perfect. `FontLoader.book`
  hands the PDF its own faces for text that is not a render.
- **The title page is centred.** It is a page of the book, not a song, and three
  lines in a sheet's top-left read as a mistake — so `fitContent` grew an `align`
  option (`top-left` stays the song default, §4.5) and the title page asks for
  `center`. The `/songbooks` preview centres too, since it _is_ that page.
- **All songs gets a generated title page** — its name and its count, no author,
  because it is the library and nobody wrote it. A blank sheet where every other
  book shows a title page read as a bug.
- **`saveFile` offers the OS save dialog** (`showSaveFilePicker`) where the
  browser has one, so a "choose the folder" preference is honoured instead of
  everything landing in Downloads. Firefox/Safari fall back to the anchor; a
  dismissed picker cancels rather than downloading anyway.
- **Row actions fold into a `⋯` menu** (a new CDK-Overlay primitive — Aria v21
  still ships no menu-button). Edit and rename stay direct; duplicate, download,
  export and delete pocket behind the menu. Download and export became per-row
  capabilities, so a song and a songbook are each acted on from their own row
  rather than a shared toolbar; the songbooks-list top-bar transfer buttons are
  gone. All songs, read-only, gets no menu at all.
- **Clicking a selected row again clears the selection.** There was no way back
  to nothing-selected once a row was clicked, and the songbook list has no
  checkboxes to escape through. It clears the _selection_, not "which song is
  current" — different facts, different marks.
- **The cross-list drag ghost is hidden in the receiving list.** The CDK parks
  its placeholder wherever the pointer is, so a drag out of the library planted a
  row-shaped gap at the foot of the songbook that never tracked the insertion
  line. It stays where it means something — the origin, in the list left behind.
- **The delete dialog lists the songs** rather than joining them into a sentence;
  the download dialog's radios became buttons that download; checkboxes and
  radios take the brand colour from one `accent-color` rule.

### Landed — a third pass, and two things Epic 4 / the parser plan deferred

- **Songbook row actions are laid out, not pocketed** (`usesRowMenu`, false for
  the songbook list, true for the Songs module). A songbook row carries a
  handful and reads better as buttons; a library row carries many and folds the
  secondary ones behind a `⋯`.
- **A row's actions stay up while its own menu is open.** The menu is a CDK
  overlay outside the row, so `:focus-within` released the instant it opened —
  `Menu` now emits `openChange` and the row holds them. And a `MenuItem` closes
  its menu by injecting it: projected through an `ngTemplateOutlet` its injector
  followed the _declaration_ site, not the menu, so `close()` never ran and the
  backdrop ate the next click. The menu items are inlined.
- **Drag a slot onto the library to remove it** (`canDropRemove` + `droppedOut`).
  The library pane shows a "drop to remove" zone, not an insertion line — there
  is no position, only out — and the song stays in the library.
- **Print options persist** (`PrintOptionsStore`, localStorage): the songbook
  download dialog opens on the last-used paper. It also grew a title-page style
  **stub** (only `classic` renders; the rest say "(soon)" and are disabled) and
  **left** page-number positions. The song download dialog is now two columns —
  the format's description, then its own Download button.
- **Whole-database backup lands its UI** (`BackupService`, over Epic 4's
  `dexie-export-import` blob). Settings can save the entire library to a file and
  restore one — a full replace, so it confirms first and reloads. Distinct from
  Export, which selects and merges.
- **Two settings stubs** (notation, font library) sit in Settings, disabled and
  marked, because each is its own work: what an existing chord symbol _means_
  (`PARSER-GRAMMAR.md` §Notation), and embedding uploaded font bytes. Shown so
  the app's shape is honest, wired to nothing.

### Landed — a fourth pass

- **All songs is downloadable and exportable** (reversing the third pass's "no
  transfer" call — the user asked for it back). It is read-only, so no rename,
  duplicate or delete, but it is the whole library: `DownloadService` synthesises
  a book of every live song in name order under an "All songs" title page, and
  `ExportService` emits every song and no songbook record. Download/export
  stopped being gated on `isReadOnly`; only duplicate and delete still are.
- **Songbooks duplicate** (`canDuplicate` on the list): a copy is a new record
  with its own id and a fresh `entries` array, same order/settings/title fields.
  Free, because a book holds references — the songs are untouched. Off for All
  songs, which is read-only.
- **The settings scroll is full-width**, scrollbar at the page's right edge, with
  the content centred and capped in a column rather than shoved left.

### Landed — a fifth pass (the All songs order)

- **The All songs print order is chosen in the download dialog**, not hardcoded.
  An axis (title / name / created / changed), a direction, and a favorites-first
  toggle, shown **only for All songs** — a real songbook's order is its content.
  `librarySongOrder` took the parameters; `title` stays the default (the fix from
  the fourth pass). Persisted with the other print options. Decided over a
  settings-module home because the order's one effect is the download, so the
  control belongs next to it.
- **All songs no longer opens into a detail view.** Its order lives at download
  and the library is browsed in the Songs module, so the read-only entry view was
  redundant: the edit button and double-click are gone for the read-only row, and
  a direct link to `/songbooks/all-songs` redirects back to the list. The virtual
  book's detail machinery stays in the presenter, now simply unreached.

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

- [x] `cdkDropList` on both panes of `/songbooks/:id`, with a drop indicator
      that reuses Epic 6's insertion line (the same mark the Add buttons
      preview) rather than inventing a second one.
- [x] Drag from the library into the songbook: dropping inserts at the indicator,
      carrying the **whole selection** when the dragged row is part of it — the
      Add buttons' rule, so a drag and a button press behave alike.
- [x] Drag within the songbook to reorder, including a multi-slot selection as a
      block (`moveEntries` already answers this; the drop supplies the index).
- [x] A drag handle per row, and **not the whole row**: the row is already a
      click target that selects, and a list where pressing a row might drag it
      is a list you cannot click confidently on touch.
- [x] Auto-scroll at the edges of a virtualised viewport, and prove a drop lands
      correctly when the source and target rows were never rendered together.
- [x] Keyboard parity is **already met** by Epic 6's buttons — confirm it stays
      met (WCAG 2.1.1: dragging must not be the only way to reorder), and do not
      add a keyboard drag mode that duplicates them.
- [x] Touch: a long-press to start a drag, without stealing the tap that selects
      or the swipe that scrolls.
- [x] Remove the FUTURE admonition from `songbooks/index.mdx`.

### Landed — what implementation changed

Corrections the build forced, recorded so they aren't re-litigated:

- **The CDK's own sorting is off** (`cdkDropListSortingDisabled`), and the drop
  index is arithmetic over the scroll offset instead. Its sorting reads the DOM,
  and a virtualised list has only a window of it — a drop past the rendered rows
  had nothing to sort against. Rows are a fixed height (the viewport requires
  it), so the boundary is `round((pointerY - listTop + scrollOffset) /
ROW_HEIGHT)` and works for a row that was never on screen.
- **The pointer is tracked on `document`, not from `cdkDragMoved`.** A drag that
  starts in the library is reported by the _library's_ component, and the only
  thing that can turn a position into an index is the list it is over.
- **`cdkDragEnded` fires immediately BEFORE the drop** (`_cleanupDragArtifacts`
  emits `ended`, then `dropped`), so clearing the tracked boundary there ate
  every drop. Cleanup belongs in the drop handler and in `cdkDropListExited`.
- **`cdkDropListEntered` never fires for a reorder within one list** — the item
  was already in the container. `cdkDragStarted` is that missing edge.
- **`cdkDropListGroup` has to enclose the `<ng-template>`, not just the panes.**
  The CDK finds the group by injector, and a template's injector follows where it
  is _declared_, not where it is rendered — the entry list is declared outside
  the split pane, so the group sitting on the pane was invisible to it and the
  two lists were never siblings. Silent: no error, drops simply did nothing.
- **An empty list is still a destination.** The viewport is `@else`'d away when
  there are no rows, taking the drop list with it, so an empty songbook — the one
  most likely to be dragged into — accepted nothing. The empty state carries
  `cdkDropList` in its place; the only boundary it can name is 0.
- **`insertionIndex` could not answer a drop**: it resolves four _named_
  positions, and a drop supplies a number. `moveEntriesTo` is the addition, and
  the boundary it takes is not a splice index — lifting the selection out first
  shifts every boundary above it down by however many were below.
- **Drag carries the selection only when the dragged row is in it.** The Add
  buttons' rule, and the honest reading of the gesture: a drag of an unselected
  row named its own subject.

**Not built, on purpose:** a keyboard drag mode. Epic 6's move buttons are the
non-pointer path (WCAG 2.1.1) and the handle is `aria-hidden` because it offers
a screen-reader user nothing the buttons do not already do, better.

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
      the app shell; Audience + sync stay network paths. **Fonts: precache the
      body face only** (`fonts/RobotoMono-*.ttf`) — Epic 7 already fetches the
      three title faces on first use, so the config only has to not undo that.
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
