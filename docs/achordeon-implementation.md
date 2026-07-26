# Prompt

```
i want you to implement the work even thought i told you not to before. I want you to commit without your signature. I want you to use @docs and @docs/achordeon-implementation.md specificaly. If you have questions, leave them at the end and continue with different work.

- the performance session should survive page reload, now it dies. I also want it to survive multiple minutes to an hour when the perfomer's phone is locked or away from the tab
- I want to set the title of the page:
1. staticly it should be "Achordeon"
2. in module it should say "Achordeon - ${MODULE}"
3. in song/songbook "${NAME_OF_THE_FILE} - Achordeon"
4. performing: "Performing - Achordeon"
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
- [x] Swipe navigation + fullscreen (tap toggles navbar, no dedicated tap zone).
- [ ] "Create an audience" entry point (wires into Epic 9).

### Landed — the swipe did not work on a phone

The gesture was written on Pointer Events so one handler serves mouse and touch,
and on a desktop it worked. On Chrome for Android it never fired once.

**`touch-action` was left at its default**, so the browser treats the first few
pixels of a touch drag as possibly-a-pan, decides it is one, hands the gesture to
the compositor and fires **`pointercancel`**. No `pointerup` ever arrives, and
`pointerup` is where the page turn was. The render now claims the horizontal axis
(`touch-action: pan-y pinch-zoom` — vertical drags and pinch stay the browser's,
because neither is a page turn and pinch is how you read a chord that rendered
small).

Two things fell out of the same reading:

- **A cancelled gesture left its anchor behind.** `pointercancel` cleared
  nothing, so the next tap measured its distance from a finger that had left
  minutes earlier — a tap that turned the page. It resets now.
- **Only the primary pointer counts.** A second finger used to move the anchor
  out from under the first, so a pinch could end as a page turn.

`apps/app-e2e/src/stage.spec.ts` covers it, and **it dispatches touch through
CDP rather than `page.mouse`** — a mouse drag produces a tidy
pointerdown/move/up and passes happily against the broken build. Only
`Input.dispatchTouchEvent` goes through Chromium's real input pipeline, where
`touch-action` and the gesture recogniser apply. Verified by reverting the fix:
the spec goes red.

### Landed — the performance survives the page, not just the route

Epic 8 called the session "persistent" and meant it across **modules**: leave
`/stage/:id` for the library and the performance is still there on the way back.
That was half the requirement. The other half is the one a stage actually
produces: a phone locks between songs, or the OS reclaims a backgrounded tab, and
what comes back is a fresh document with an empty root injector. The book was
restored (it is in the URL) and everything else was not — the performance
restarted at song 1 and the lobby PIN was gone, while the durable `lobbies` row
(ADR-0011) was still holding the audience open with nobody publishing to it.

- **`StageSession` mirrors itself to `localStorage`** — `{ bookId, index,
lobbyPin, savedAt }`, written from each mutator and read at construction. That
  is deliberately the whole record and nothing else: `isMounted` stays in memory
  because whether the view is on screen is a fact about _this_ document, and a
  stale `true` would draw the stage bar over the library. `localStorage` for
  `UiStore`'s reason — the index has to be readable **synchronously**, before the
  route asks for it — and device-local for the split ratio's reason: which song a
  phone on stage is showing is not a fact about the account.
- **A reload takes the same path as a route re-entry.** `start(bookId)` is
  already idempotent on the same book, and after hydration the stored book _is_
  the one off the URL, so a reload is the early return and the stored index
  stands. Nothing new had to know about reloads.
- **Twelve hours, then it is last night's.** A performance is an event: the tab
  that comes back an hour later is the same gig, the one that comes back tomorrow
  is not — and resuming also resurrects the PIN and re-publishes to it. Twelve
  covers any single evening and cannot span two. `savedAt` is refreshed on every
  change, so the window is "since you last touched it".
- **`setTotal` clamps the index.** A song deleted between sessions makes a stored
  index unreachable, and an index past the end renders a blank page inside a book
  the view insists is not empty. Landing on the last song is the honest answer to
  "the song you were on is gone".
- **Fullscreen is still session-only, and that is not an oversight.** The
  Fullscreen API needs a user gesture, so a flag that claimed to restore it would
  be a flag that lies (`UiStore` already records this). One tap gets it back.

**The lobby heals itself instead of assuming its socket lasted.** A frozen tab's
websocket is closed under it, and a frozen tab runs no timers and gets no events,
so neither lobby service noticed. What woke up was a `RealtimeChannel` that still
accepted `send` and delivered nothing: the host broadcast page turns into a
channel with nobody in it, and viewers sat three songs behind. `LobbyWake`
(`lobby/lobby-connection.ts`) asks the two questions a suspension raises —
"did this tab just wake" (`visibilitychange`), "did the network come back"
(`online`) — plus a 30 s watchdog for the quiet version, a venue's wifi dropping
while the screen is on. Both sides answer it:

- **The host re-joins and re-publishes the _held_ song**, not the one the lobby
  opened with — which is why `LobbyHost` now keeps the payload past the publish.
  Re-publishing is safe precisely because the row owns `rev`: the viewers' reducer
  applies it once, and a viewer already on that song sees nothing happen.
- **A repair must not go through `close()`.** `close()` calls `lobby_end`, so
  reusing it would make a viewer watching the row see the lobby end and un-end a
  moment later — a flicker out of a repair. `dropChannel()` is the half of it that
  a re-join needs, and `open()` gained an `isFresh` flag so the analytics count
  performances rather than sleeps.
- **The viewer's `resume` is the Re-sync button, automatic.** A joined channel
  needs only a re-read (the rev gate makes it idempotent); a closed one is
  re-subscribed **without** resetting `appliedRev`, the payload or the status —
  `join`'s reset would blank the song being read while the socket came back and
  then re-render it, which is a flicker inside a repair again. Its Presence key is
  minted once per join and reused, or a lobby's audience count would climb every
  time a phone woke up.
- **A reload while off the stage route leaves the lobby hostless until you go
  back.** The channel's driver is the route-scoped presenter (Epic 9's note on
  why), and a fresh document has no presenter until `/stage/:id` mounts again.
  The audience is not stranded — the durable row still holds the current song —
  and re-entering performing re-attaches. Fixing it properly means a second
  driver for one host, which Epic 9 argued against on purpose.

**Fixed on the way, and it was the reason the reload work looked broken: the exit
cross could not exit.** `presenter.open()` reads the session's own `bookId` on its
first line, and it was called straight from an `effect` — so the effect took that
read as a dependency, and `end()`, whose whole job is to clear `bookId`,
re-triggered the effect that immediately set it back. `/stage` then saw a live
session and bounced into it (`StagePresenter.load` does that by design). The
performance was un-endable, which a _persisted_ one would have made permanent.
`untracked` is the fix: an effect here means "the route param changed, load it",
and what the load reads on the way is not a reason to run again.

- **The song editor had the identical trap, with worse stakes.**
  `SongEditorPresenter.load` reads the store's entity list to find the song
  before it falls back to a fetch, so the effect re-ran on **every** store change
  — including the autosave's own write-back, which then re-set `_content` from the
  saved row and would discard whatever had been typed since. Same one-line fix.
  Both are covered by the suites that already exist (`editor.spec.ts` is green
  either way; `stage.spec.ts` gained the test that catches the exit).

### Landed — the tab says where you are

`<title>` was still the CLI's `app`. Three shapes, and the word order is the point
of each:

- **A module** — `Achordeon - Songs`. You are in the app, looking at one of its
  places, and a tab strip full of them should read by the app.
- **A song or a songbook** — `Down by the River - Achordeon`. You are looking at a
  _document_, and its own name is what you are hunting for among fifteen tabs.
- **Performing** — `Performing - Achordeon`. A document again in shape, but the
  thing worth naming is the act: the songbook's name is already on screen, and
  what a performer glancing at a tab strip needs to find is the performance.

- **The module is read off the URL; a document's name cannot be.** `DocumentTitle`
  matches `ALL_NAV_ITEMS` against `Router.lastSuccessfulNavigation` — the same
  no-RxJS read `ModuleSwitcher` already makes. A name lives in a record the shell
  may not load (`shared/**` must not touch a store), so the **page claims** the
  title and hands over an accessor; because that accessor is read inside a
  computed, a rename from the editor's title field lands in the tab with nobody
  wiring it. Three pages claim: the editor, the songbook detail, and performing.
- **A claim releases only if it is still ours.** The next page can claim before
  the last one has finished tearing down, and a late release would otherwise wipe
  the new page's title.
- **An empty claimed name falls back to the module.** A song's name arrives an
  IndexedDB read after the route does, and `- Achordeon` with a hole in front of
  it is worse than the module title it replaces a tick later.
- **`index.html.template` carries the plain `Achordeon`** — what the tab says
  before Angular has booted, and what a bookmark of the app root keeps.
- **`/audience/:pin` is left at the module title** (`Achordeon - Audience`). It is
  neither a file nor the performing side, and the four rules do not name it. See
  the question at the end.

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

- [x] Host: open a lobby (random ~5-char PIN, unambiguous alphabet), channel per
      PIN, `track()` `{ currentSongObject, summary }`; re-track on song change.
- [x] Generate the QR encoding the `/audience/:pin` deep link.
- [x] Viewer: join by PIN or QR; `onPresenceSync` delivers current song + summary
      immediately; render locally; read-only summary.
- [x] Hide-chords viewer-local toggle (reflow-safe — keeps reserved chord rows).
- [x] Audience count from viewer Presence; lobby ends on host disconnect.
- [x] Append-only `lobby_events` analytics (created / song_changed), off the
      Presence critical path, song_ref without content; RLS insert-by-owner.

### Landed — what implementation changed

Corrections the build forced, recorded so they aren't re-litigated:

- **The lobby's network owner is root, its driver is route-scoped.** The
  performance is persistent (Epic 8), so a host may leave `/stage/:id` and keep
  hosting — the Supabase channel therefore lives in a root `LobbyHost`, not the
  route-scoped presenter, or glancing at the library would drop every viewer. But
  only a presenter may touch data-access (the shell rule, enforced in eslint), so
  `StagePerformPresenter` **drives** the root host from shell-owned session state:
  one effect keeps Presence `== (pin, payload)` — opens on a PIN, re-tracks on
  every prev/next (a computed payload, so it is automatic), closes when the PIN
  clears. `StageSession` still owns the PIN (a pure `generateLobbyPin`, no
  network) so the mobile bar and dialog read it without reaching into a store.
- **The payload carries resolved settings, not just the Song.** ADR-0003 says
  "the full current Song (content + settings)", but a viewer has neither the
  host's library nor a way to run the host's cascade (Global ⊕ Songbook ⊕ Song).
  So the wire carries the **already-resolved** `GlobalSettings`, which is what
  makes the viewer's local render byte-identical to the host's. `LobbyPayload`
  also carries `currentIndex`, so the read-only summary can mark where the
  performer stands without a second message.
- **`@supabase/supabase-js` is `import()`ed on the first lobby action**, quarantined
  to `data-access/lobby/` (ADR-0008). The SDK is ~120 KB and the Audience path is
  a network feature most sessions never touch — the same on-gesture split Epic 7
  uses for jsPDF/fflate, keeping it out of the initial budget.
- **"Lobby not found" is a timeout, not an error.** Subscribing to a PIN with no
  host succeeds at the channel level; the only signal that the PIN is dead is
  "no host appeared in Presence within a grace window". A host that later vanishes
  from a sync we had already joined is `ended`, a distinct state.
- **Analytics is best-effort and unawaited.** `lobby_events` is RLS
  insert-by-owner, and Auth is Epic 10 — so today every insert is silently denied.
  That is fine: nothing reads the table at runtime and no write is on the Presence
  path, so a denied insert never disturbs a performance.
- **Config is a public source file, not a secret.** The anon key is a JWT the
  browser is meant to hold and RLS is the guard, so `SUPABASE_CONFIG` is provided
  from `apps/app/src/app/supabase.config.ts`, defaulting to the local
  `supabase start` values so the app talks to a local stack out of the box. An
  empty `url` builds the app offline-only and the Audience UI reports itself
  unavailable rather than throwing.

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

- [x] Supabase Auth: Google OAuth sign-in; session persistence; tier read from
      `profiles.plan`.
- [x] Provider linking: add-method-only (Google via `linkIdentity`, password via
      `updateUser`); email confirmation required; no merge / no unlink in v1.
- [x] `SyncBackend` port + `SyncService` orchestration (push/pull; subscribe is a
      future no-op).
- [x] Drive backend: two manual buttons (upload/download), `drive.file` scope, one
      `achordeon-backup.json`, whole-file LWW with a modifiedTime guard, Flow A
      token re-auth.
- [x] Supabase backend: relational schema (`profiles`, `songs`, `songbooks`,
      `songbook_songs`) + RLS per `auth.uid()`; tombstones via `deleted_at`.
- [x] Sync mechanics: coarse boundary push (editor save/close, reorder commit,
      app blur), debounced safety net, pull-on-launch/focus, per-row LWW.
- [x] Auto-sync user toggle (enabled by `pro`, switchable off ≠ logged out).
- [x] Warn-before-leaving when local changes haven't reached the cloud
      (`beforeunload` + flush-on-blur — see below on the "route guard").

### Landed — what implementation changed

Corrections and choices the build forced, recorded so they aren't re-litigated:

- **Per-row LWW is a pure domain function** (`mergeRecords`/`mergeSnapshots`), not
  logic buried in a backend. A tombstone is not special-cased — `softDelete` bumps
  `updatedAt`, so a delete is simply the newest write and wins by the same rule,
  which is what makes a delete propagate instead of an old live copy resurrecting
  it. Ties keep local, so the merge is idempotent.
- **The shared Supabase client now persists the session.** Epic 9 built it with
  `persistSession: false` (the viewer path is anonymous). Auth needs the opposite,
  and there is one client (one socket) — flipping it on also lights up
  `auth.uid()` for the lobby-events insert-by-owner policy Epic 9 had to leave
  denied. Both facts point at one client, not two.
- **Sync timestamps are `bigint` epoch-ms, not `timestamptz`.** `updated_at` is
  the _client's_ LWW clock (the value carried in the Snapshot); a server `now()`
  would be a second, disagreeing clock. The lobby tables use `timestamptz` because
  those times are server-generated — the opposite case.
- **`profiles` carries `record_id`** (the local `User.id`) so a pull can rebuild
  the local user row for the LWW merge — the account is keyed by `auth.uid()`, but
  the client record has its own uuid, and losing it would make the user table
  un-mergeable. `plan` is never written from the client (dashboard/webhook only).
- **The "in-app route guard" is `flush()` on blur, not a `CanDeactivate`.** In a
  local-first SPA no in-app navigation loses data (it is already in IndexedDB), so
  trapping the user on a route would be user-hostile for no safety gain. The real
  leave is tab close/reload — `beforeunload` — and blur pushes before any of it,
  so the honest reading of the requirement is a flush + an unload warning.
- **Two-device-different-email is still a dead end** (ADR-0009, accepted): no
  merge op, so the escape hatch stays Export → Import. Not re-solved here.

**Deferred (wired, not exercised end-to-end):** live Google OAuth and Drive REST
need real credentials — the code paths exist and typecheck, but no automated test
drives a real Google grant. Supabase realtime `subscribe` stays a future no-op
(ADR-0004). The monetization webhook that flips `plan` to `pro` is out of scope;
flip it in the dashboard for now.

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

- [x] Router config: lazy feature routes per module + default redirect. (The nav
      shell itself — rail, mobile bar, split, theme — is **Epic 13**.)
- [x] `tierGuard` as highlight+tooltip (not a hard block) during testing. (The
      `<app-premium>` marker itself is **Epic 13** — it's a tooltip consumer; this
      subtask is only the guard + deciding which controls wear it.)
- [x] PWA: `@angular/service-worker` wired by hand; `ngsw-config.json` precaches
      the app shell; Audience + sync stay network paths. **Fonts: precache the
      body face only** (`fonts/RobotoMono-*.ttf`) — Epic 7 already fetches the
      three title faces on first use, so the config only has to not undo that.
- [x] Update strategy: gentle dismissible "update available" affordance (never
      silent reload mid-performance); forced refuse-and-update path for newer
      `schemaVersion`; recovery on unrecoverable SW.
- [x] i18n: `@angular/localize` runtime mode, EN + CS, one bundle; language switch
      persists in Settings + reloads.
- [x] Security: CSP via meta + SRI on third-party scripts; enforce no-`innerHTML`
      for rendered content; shortest-lived sync tokens.

### Landed — what implementation changed

Corrections and choices the build forced, recorded so they aren't re-litigated:

- **i18n went back to §11's runtime mode, and the numbers for both are on record.**
  The app had been built the other way (per-locale `--localize`, `cs` under its own
  sub-path), which is where the measurements come from: two locales cost 8.05 s cold
  against 5.80 s for one — the compile happens once and only the inlining repeats,
  so the "per-locale GitHub Pages build" §11 was avoiding was never the expensive
  part. What it does cost is **8.3 MB of artifact against 4.4 MB**, and — new
  information, because Epic 11 is what added the service worker — **a second SW
  scope**, so switching language re-downloads a 2.9 MB shell instead of fetching a
  15 kB catalog. Runtime mode's own price is now measured too: the initial bundle
  goes **678 kB → 742 kB** raw (180 → 199 kB transferred), because every message id
  and the `$localize` call survive into the bundle instead of being inlined away.
  One cache and 4 MB less deploy for 19 kB on every load: taken.
  - **`main.ts` awaits the catalog before `bootstrapApplication`.** A message is
    translated on _first encounter_, so anything that renders before the catalog
    lands stays English permanently. English itself fetches nothing — it is the
    source text already in the bundle.
  - **A failed catalog fetch is not fatal.** An English app is a working app;
    refusing to boot over a 15 kB file would turn cosmetic into broken.
  - **`null` means untranslated**, and those keys are dropped before
    `loadTranslations` — so an unfinished language falls back to English per message
    and is safe to ship. `"draft": true` in a catalog is what keeps the gate below
    off its back until it is finished.
  - **`LOCALE_ID` and `<html lang>` are set by hand now** (the per-locale build used
    to), and Czech locale data is a lazy import in the same branch as the catalog:
    `LOCALE_ID: 'cs'` with no registered data makes the first `DatePipe` throw, and
    it would throw for Czech users only.
  - The pre-boot locale redirect script is **gone** — one URL, one bundle — and with
    it the locale argument to `tools/spa-github-404.mjs`.
- **`tierGuard` is a control gate, not a route guard.** There is no Premium-only
  _place_: joining an Audience is free (only hosting is Premium), and automatic sync
  is a toggle inside a section everyone uses. So `TierGuard` holds the feature
  registry, the tier accessor and the one `IS_TESTING` switch, and the two Premium
  controls read it — `app.routes.ts` records why the route table has no guard.
  `<app-premium>` gained an `isMarked` input as a result: a Premium user is no
  longer shown their own features as upsells.
- **`bootstrap()` (the ADR-0007 boot gateway) was never wired.** It existed from
  Epic 1 and nothing called it, so no local migration ran and a `refuse` could not
  reach the UI — while Epic 11 owns the forced-update path that a refusal depends
  on. Now an awaited app initializer (`provideAchordeonBoot`) runs it before any
  store reads a row and publishes the verdict on `BootGate`.
- **The Drive pull did not migrate either.** ADR-0007 says all four ingest paths
  funnel through `migrate()`; Drive returned its JSON straight to the per-row LWW
  merge, which would have fused rows of a shape this build cannot read and written
  them back stripped. `SyncService.ingest()` is now that seam for both cloud paths,
  and a refusal latches `BootGate` → the blocking prompt. Import does the same.
- **`AppUpdate` avoids `SwUpdate`'s RxJS surface.** `checkForUpdate()` and
  `activateUpdate()` are promises, which covers the gentle path and the forced one;
  only `unrecoverable` has no promise form, so it gets a single `subscribe` with no
  operators — the same concession the lobby makes for `channel.subscribe`.
- **The CSP is generated, not hand-written.** A meta-tag policy has no nonce, so
  each inline script in `index.html.template` is allowed by the **sha256 of its own
  body**, computed by `tools/gen-index.mjs` from the finished text. A `--dev` flag
  adds the dev-server's websocket and `unsafe-eval`; `gen-index-dev` is what
  `serve` depends on. The same script is the SRI guard: a `<script src>` pointing
  off-origin without `integrity` + `crossorigin` fails the build.
- **Critical-CSS inlining had to be switched off** (`optimization.styles.inlineCritical:
false`). Angular ships the stylesheet as `media="print"` plus an inline
  `onload="this.media='all'"` — an inline event handler, which the CSP blocks, and
  the page would then paint with only the inlined subset forever. The whole sheet is
  ~8 kB, so a plain blocking link is cheaper than an exception in the policy.
- **The Supabase session is persisted without its Google tokens.** `persistSession`
  writes the whole session object, `provider_token` and `provider_refresh_token`
  included — which is exactly what §7 says must never sit in the browser, and the
  opposite of what `AuthService.providerToken()` claimed ("gone after any reload").
  A storage adapter in `supabase-client.ts` strips both on write; the live signal
  still has the token for the page that minted it, which is where Drive uses it.
- **Prefetching the app shell means prefetching every chunk.** `/*.js` in
  `ngsw-config.json` covers the lazy chunks too (editor, jsPDF, fflate), because
  "works offline" has to include opening the editor and exporting a PDF offline —
  not just booting. The title faces stay `lazy`/`lazy` so Epic 7's fetch-on-first-use
  is untouched, and Audience + sync appear in no asset or data group at all.
- **The theme did not survive a reload.** `ThemeApplier`'s `localStorage` cache was
  write-only: the pre-paint script stamped `dark`, then the store came up at its
  `'system'` default and the first effect _removed_ the attribute. The root shell
  now seeds `SettingsStore` from `ThemeApplier.cached()`.
- **`Tooltip` treats empty text as "no tooltip".** A directive cannot be applied
  conditionally, and `<app-premium>` needs exactly that — so an empty string is now
  the off switch instead of an empty panel.
- **`i18nMissingTranslation: "error"` does not exist in runtime mode**, so it was
  rebuilt as `tools/check-locales.mjs`. That option belongs to compile-time
  _inlining_ — the CLI can only complain while it is substituting a translation into
  a bundle. At runtime a missing key silently falls back to English, which looks like
  a working app and reaches production unnoticed. The gate fails the build on four
  things: a `$localize`/`i18n=` id the source catalog has never seen (found by
  scanning the code, not by re-extracting — a full build is too expensive to run as a
  precondition of one), an untranslated message, a translation whose English has
  since changed, and a mismatch between the catalogs on disk and `LANGUAGES` in the
  code. Wired to `build`, **not** to `serve`: a target's `dependsOn` does not reach
  the dev-server's in-process build, so it is strict where it ships and silent where
  you work.
- **`ng extract-i18n` cannot merge**, so `tools/sync-locales.mjs` does: it rebuilds
  each catalog from the freshly extracted source, keeps the wording, drops messages
  that no longer exist, and adds new ones as **`null`** rather than as a copy of the
  English — a copy is indistinguishable from a real translation and would ship as
  one. Staleness needs the English each translation was written against, which lives
  in a `xx.sources.json` **sidecar**: it is authoring data, and shipping the English
  a second time to a Czech reader is 24 kB of nothing. `nx run app:sync-locales` runs
  extraction and the merge together.
- **The app icons and favicon are generated** by `tools/gen-app-icons.mjs` from one
  description — the SVGs, the PNG install icons, the maskable cut and the `.ico`
  (16/32/48, with a bolder cut of the mark, because six thin rows are a smudge at
  16px). The mark is a **placeholder**, not a designed logo.

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

- [x] Profile section: login/logout, "add a sign-in method", Connect Drive
      (drives the Google link if absent). _Landed with Epic 10; Epic 12 re-cut it
      into rows and gave the identity its own line._
- [x] Sync controls: Drive upload/download buttons, premium auto-sync toggle,
      manual export/import entry points.
- [x] Application: theme (system/light/dark), language (EN/CS). _Landed with Epic
      11 — the language control is the switch that owns the locale sub-paths, so it
      shipped with the i18n it drives._
- [x] Rendering: GUI for the **global** render defaults (the registry's Global
      scope) — mount `<app-settings-panel [scope]="'global'">` from **Epic 13**; the
      panel is built once and reused at Song/Songbook scope. Don't rebuild it here.
- [x] Premium highlight markers on tier-gated controls.

### Landed — what implementation changed

Epic 12 found its subtasks already built: Epics 10, 11 and 13 had each landed
their own slice of this page as they went. What was missing was the thing no
single epic owned — the page as **one page**. So this is mostly a design pass,
and what it changed is worth recording:

- **The render section was the only part that had an inset, and that was the
  bug, not the feature.** `<app-settings-panel>` pads itself (it is built for the
  editor dialog, where it owns the whole surface) and was dropped into a section
  that padded nothing, so the render rows sat 12px in from every other row on the
  page. The inset is now the host's to decide — one `--panel-inset` custom
  property, defaulted to what the dialogs want, set to `0` by the Settings page
  because the section already pads. Nothing about the dialogs changed.
- **Sections are cards.** Each one has the panel's inset, an edge and
  `--surface`, on a `--surface-sunken` body. Not `--surface-raised`: the rail and
  the action bar are already raised, so a raised card read as more chrome rather
  than as the page's content.
- **The page had one heading style for two levels.** Section headings copied the
  panel's `.section-title` — but that style belongs to the level _below_ (PAGE,
  TITLE, CHORDS), so RENDERING and PAGE looked like siblings. Sections are now
  real headings; the uppercase-faint caption is reserved for the group inside a
  card, which is exactly what the render panel does.
- **Rows go two-up, off the same container query the panel uses** (420px, asking
  the card rather than the viewport). Every hand-built section now uses the
  panel's row shape — label + `(?)` above, control beneath — so a settings row
  looks the same wherever it is.
- **Three heading levels became two.** "Manual backup" was an `<h4>` under the
  Sync subsection under the Account section; it is one setting, not a group, so
  it is a row like the others. Sync stays as the one subsection.
- **The Premium tier badge was invisible.** `background: var(--premium-glow)`
  substituted a `box-shadow` value into `background`, which makes the declaration
  invalid at computed-value time — white text on nothing. It wears the gold now,
  with a `--premium-on` token for text on it (white on gold is 1.9:1).
- **"Panels" was a section holding one checkbox.** Folded into Application, where
  a device-local UI preference belongs beside theme.
- **Export/import got a signpost, not a second home.** Epic 7 put the pickers
  where the songs are, because choosing which songs is the whole act. Settings
  says so and links there — otherwise someone who came looking for "export" uses
  Back up as a substitute and mails a copy of their entire library.

**Fixed alongside** (Epic 5/13's bar, not Settings'): the editor's action bar
overflowed a 320px viewport. `.commands` wraps between groups — "a break falls
where the meaning already changes, never through the middle of one" — but eight
40px insert buttons and their gaps are 348px, and a 320px phone leaves the
commands about 215px, so the rule had no way to hold and the group simply ran off
the screen instead. Groups wrap too now; because `.commands` still breaks between
them first, a group is only ever asked to break when it alone is wider than the
line. `mobile-layout.spec.ts` covers it at 320 and 390.

**Also fixed: connecting Google did not take.** `linkIdentity` grants the
identity server-side and redirects back, and the session that comes out of
storage on the other side is the one from _before_ the link. `AuthService` read
`identities` straight off it, so `hasGoogle()` stayed false after connecting:
"Add Google" stayed on offer, the Drive buttons stayed disabled, and the line
telling you to add Google stayed under them until some later token refresh
happened to fix it. `adopt()` now re-reads the user with `getUser()` — the server
is the only thing that knows — best-effort, so being offline never looks like
being signed out. The line itself is now keyed on `hasGoogle()` alone and, when
there is no account yet, says to sign in rather than to "add Google to your
account".

**Also fixed: the global render defaults were never saved.** Changing the aspect
ratio on this page held until the next reload and then went back to A4. The
`user` table has held a `settings` column since Epic 4 and the sync layer already
read and wrote it — but nothing ever wrote a `user` row, so the table was empty
on every install, and `SettingsStore` was a plain in-memory holder whose own
docstring left the write-back to "feature panels (Epic 12)". This is Epic 12.

- **The store owns the round-trip.** `setGlobal` writes the bag through to the
  account row and `load()` reads it back; nothing above has to remember. Putting
  it in the four presenters that inject the store would have been four chances to
  forget, and the panel is mounted in three places.
- **The row is a singleton with a constant id** (`LOCAL_USER_ID`, like
  `ALL_SONGS_ID`). Two devices editing their defaults offline have to produce the
  _same_ row for per-row LWW (ADR-0004) to reconcile them; random ids would merge
  into two accounts and let `find` pick whichever came first. It is a synced row,
  so a changed default now travels between devices like any other edit.
- **Hydration is awaited in the boot initializer, after the gateway.** Settings
  are rows, so they must be read at the current shape; and they must be in the
  store before first paint, because a page that renders A4 and then jumps to the
  user's own ratio is a worse bug than the one being fixed.
- **A stored bag is completed against the registry on the way in.** Global is the
  base of the cascade (ADR-0006) and `resolveSettings` reads every key off it, so
  it has to be complete — a bag saved before a setting existed is not. The stored
  values spread last, so a newer build's unknown key still round-trips
  (ADR-0007).
- **Writes are serialised**, because each is a read-modify-write of one row: two
  overlapping ones both read the pre-edit row and the loser puts back a bag
  missing the winner's change. Dragging a slider fires exactly that pattern.

Two e2e tests cover it, and they wait for the row rather than for a stretch of
time — a reload issued in the same millisecond as the click will beat IndexedDB
to disk, which is a real (millisecond-wide) window for a user who closes the tab
mid-click and an unreal one for a test with no human delay in front of it.

**Also fixed: every sync cycle failed the moment settings started saving.** With
the account row finally being written, the push finally had one to send — and
`profiles.record_id` was a `uuid` column, while the row's id is the constant
`local-user`. Postgres refused it, the push is one transaction so the whole cycle
went with it, and because `recomputeUnsynced` only ran on the success path the
"you have unsynced changes" flag latched true forever. Which the user meets as a
`beforeunload` prompt on every single reload, for the rest of the install's life.

- **`record_id` is `text` now** (`20260726000000_profile_record_id_text.sql`).
  Nothing joins on it or casts it: it is the client's own id, echoed back so a
  pull can rebuild the row for the merge, and the client's id space has always
  included sentinels (`local-user`, `all-songs`). Fixing the column rather than
  the constant also heals every install that already has the row — an id change
  would have needed a repair pass, and one for the Drive backups too.
- **A failed cycle recounts.** `hasUnsynced` used to keep whatever the last cycle
  that _did_ land left behind, which is wrong in both directions: stale-true is
  the unreloadable tab, and stale-false hides real work after `setAutoSync(true)`
  resets the watermark and the first cycle fails.

**Also fixed: the app warned about its own reloads.** Switching language reloads
(runtime `$localize` caches each message on first use, so §11 chose the reload),
and the leave-warning fired on it — as it did on restoring a backup, deleting an
account, taking an update, and heading off to Google. The warning answers "you
are leaving and the other device will not have this"; none of those is that. The
user asked for the thing that is happening, the work is safe in IndexedDB, and
`SyncService.init` pushes it on the next boot. Being asked to confirm leaving a
page you never chose to leave only teaches you to dismiss the one prompt that
matters. `WarnUnsynced` now owns both sides of the question — `reload()` is the
single way the app reloads itself, so a fifth caller cannot forget the first
half, and `expectUnload()` covers the OAuth redirects it cannot wrap. Armed, not
permanent: a sign-in that throws before it can redirect re-arms the guard after
five seconds instead of disarming it for the session.

**Also landed: a changed default reaches the cloud on its own.** It used to reach
it only if some _other_ edit happened to trigger a cycle first. `SettingsStore`
now announces a written row (`onSaved`) and `SyncService` registers `pushSoon`
there at boot — a listener rather than a call into the sync layer, because the
dependency runs the other way and calling back would close the circle. So a
preference is a push boundary like a saved song, it counts toward the unsynced
warning, and it rides the paths the account row was already on: Supabase
`profiles.settings` for a paid account, the Drive backup file, and the whole-
database Backup file. Selective **export** still leaves the row out on purpose —
a file you send someone must not re-base their library on your defaults.

Not synced, and deliberately: **theme and language**. Both are settings on this
page, but both are device preferences a shared account should not impose — a dark
phone and a light desktop is a setup, not a bug — and both have a home that has to
be readable before the app boots (a pre-paint localStorage cache; the URL). Say
the word and they become two more columns.

**Epic 12 also brought a setting of its own: `notation`** (`english | german`,
scopes songbook + song), the one row PRD-DOMAIN-MODEL parked. German prints B
natural as `H` and B♭ as `B`.

- **It spells the page; it does not rewrite the song.** `respellChords` runs over
  the AST at the top of the render and `content` is never touched. Letting a
  preference decide what a stored symbol _means_ would make the same file sound
  different on two devices, and the next transpose would bake the difference in.
  The two halves that do change meaning — strict German input, German transpose
  output — stay parked, and PARSER-GRAMMAR §Notation now says which is which.
- **One seam: `RenderService.layout`.** Not the parser, so the editor keeps
  showing the source as written; not each caller, so screen, PNG, PDF and the
  songbook exports cannot disagree about what a chord is called.
- **English is the identity.** It means "as you typed it", so no existing song
  renders differently than it did yesterday — including one already written with
  `H`, which has been a valid chord since Epic 2 and still is under either
  setting.

**Still failing on this branch, and not ours:** two `shell.spec.ts` fullscreen
tests (`audience-fullscreen` never becomes visible). They fail identically on the
branch head; left alone so the fix is reviewable on its own.

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
