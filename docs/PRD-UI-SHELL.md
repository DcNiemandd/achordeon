# Achordeon — UI Shell & Component Library (research)

The **temporary UI** layer: which component library, what the frame looks like, and
the seam that keeps the business layer from noticing when the temporary UI is thrown
away and a designed one takes its place.

> **Premise.** This UI is scaffolding. It will be replaced. Every decision below is
> scored first on _how cheap is the replacement_, and only second on how good it
> looks. Where the two conflict, replaceability wins.

Repo-root `docs/` — **not** the published Docusaurus site (`apps/docs/docs`).

Sources: `CONTEXT.md`, `PRD-INFRASTRUCTURE.md` (§2 services, §3 no-RxJS, §10 router,
§11 cross-cutting), `PRD-RENDERING.md`, ADR-0008 + ADR-0010 (the quarantine
precedent), and the Docusaurus pages (`basics.mdx`, `songs/`, `songbooks/`,
`stage-audience/`, `settings.mdx`).

---

## 1. The disposability contract [decided]

Three properties must hold on the day the designed UI lands. Everything in this doc
exists to serve them.

1. **The business layer does not import the UI.** Already structurally true — stores
   and services live in `libs/shared/*`, the UI lives in `apps/app`. The Nx boundary
   rule enforces the direction.
2. **The UI does not reach into the business layer.** Components never inject a
   store or a service. They talk to a **presenter** (§3). Swapping the UI rewrites
   components; presenters and everything below them survive untouched.
3. **No feature is shaped by what the component library makes easy.** If the library
   can't do what the docs promise, the docs win and we hand-roll it.

---

## 2. Component library: `@angular/aria` + `@angular/cdk` [decided]

**Adopt `@angular/aria` + `@angular/cdk`, on the `21.x` line** (`21.2.14` — matching
the workspace's Angular 21). Aria peers `@angular/cdk` exactly, so the CDK comes
along by definition. **Angular Material is not adopted.**

Angular Aria is a set of **headless, signal-based, first-party** directives
implementing the WAI-ARIA interaction patterns. It ships keyboard handling, ARIA
attributes, focus management, and screen-reader semantics; it ships **no styles**.
We provide the markup and the CSS.

### Why

- **Headless is the whole point of a temporary UI.** There is no library look to
  strip out later, because there is no library look. The brand color (§6) applies
  from line one, and the swap deletes only our own CSS.
- **It is signal-based, so it obeys PRD-INFRA §3 natively.** Aria's API is model
  signals — `[(value)]`, `[(expanded)]`, `listbox.activeDescendant()`,
  `widget.selected()`. Material's async surface is still RxJS (`afterClosed()`
  returns an Observable in v22's docs too), which would mean fighting the no-RxJS
  rule at every dialog call site. Aria has no Observables to fight.
- **First-party, on the Angular release train.** Same argument that decided ADR-0010
  and that this workspace has already been bitten by elsewhere (§10). No third party
  must chase Angular majors for our UI to survive one.
- **The hard patterns are the free ones.** Aria covers the list-navigation and
  popup patterns — see the v21 reality check below. What it omits — button, text
  field, the visual chrome — is the part that's a `<button>` and some CSS.

### What v21 actually ships [corrected during implementation]

The pattern list in Angular's docs (Dialog, Alert Dialog, Checkbox, Switch, Radio
Group, Breadcrumb, Disclosure, Select, Multiselect, Autocomplete…) is the **v22
stable set**. `@angular/aria@21.2.14` exports exactly **eight** entry points:

```
accordion · combobox · grid · listbox · menu · tabs · toolbar · tree
```

**There is no Dialog on v21**, and no Disclosure, Checkbox, Switch or Radio Group.
Consequences we live with until the §10 upgrade:

- The settings dialog is hand-rolled on `cdkConnectedOverlay` + `cdkTrapFocus`
  rather than `ngDialog` — which we wanted anyway, because §4 needs it
  backdrop-less and positioned on pane A.
- The `(?)` toggle tip is hand-rolled; `Disclosure` isn't there to lean on.
- Settings controls use native `<input>`s, which is the right answer regardless.

Confirmed present and used: `Toolbar`/`ToolbarWidget` (`[ngToolbar]`,
`[ngToolbarWidget]`) for the action bar. Note Aria's `wrap` input is **keyboard
focus wrap-around, not visual wrapping** — the rows come from CSS `flex-wrap`.

- **The CDK is wanted regardless.** Drag & drop (`cdkDropList`) for songbook
  reordering — flagged `FUTURE: drag&drop is not yet implemented` in the docs.
  Overlay (`cdkConnectedOverlay`, which Aria's own popup patterns build on), virtual
  scroll for the paged infinite explorer (PRD-INFRA §3/§4), focus trap, live
  announcer, text-field autosize.
- **It's in character.** This project hand-rolls its parser and its renderer, and
  PRD-INFRA §2 says "from-scratch is the default where it earns control." A styled
  component library was the odd one out.

### Status caveat

Angular Aria is **developer preview on v21** and **stable on v22**. The API may shift
under us before we upgrade. Accepted: the shift is `ng update`-migrated, the surface
we consume is small, and it sits behind the presenter seam (§3) anyway. See §10 for
the Angular 22 upgrade, which is costed and deliberately deferred.

### Measured cost [after implementation]

The initial bundle is **543.60 kB raw / 147.06 kB gzipped**. The CDK's Overlay +
a11y land in the **initial** chunk — the rail's tooltips need them on first paint —
which is ~190 kB raw of it. Aria's toolbar is negligible by comparison.

The build's `initial` budget was therefore raised **500 kB → 600 kB** in
`project.json`. Note budgets gate **raw** size, while the number that matters for an
offline PWA is the ~147 kB it downloads once. The new ceiling is deliberate, not a
rubber stamp: if a feature pushes past it, ask what landed in the initial chunk
before raising it again. (The error threshold stays at 1 MB.)

### Cost accepted

We build ~12 small components ourselves: button, icon button, text field, search
field, list row, segmented control, tooltip, dialog chrome, empty state, spinner,
badge, and the rail item. Each is markup + CSS over an Aria directive or a plain
element. This is real work; it is also work that does not get thrown away twice,
because the CSS is ours from the start.

### Rejected

| Option                            | Why not                                                                                                                                                                                                                                                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Angular Material 21**           | Fastest to a first screen, and first-party too. Loses on the two axes that matter: an opinionated Material look that must be stripped later, and an Observable async surface (`afterClosed()`, `matSortChange`) that fights PRD-INFRA §3 at every call site. Aria is the same team without either problem. |
| **PrimeNG**                       | Built-in `<p-splitter>` and `<p-dock>` were the only pull. A third-party release train chasing Angular majors, its own theming layer to learn then remove, heavier bundle for an offline-precached PWA.                                                                                                    |
| **Spartan UI + Tailwind**         | Headless with a neutral look — the right shape, but Aria is the same idea from the framework authors, already peered to the CDK we need. No reason to take a young third-party for it.                                                                                                                     |
| **`angular-split`** (for §5 only) | v20.0.0, last published ~a year ago, peer `>=19`. Stale against Angular 21. Not worth a dependency for ~60 lines (§5).                                                                                                                                                                                     |
| **Ionic Angular**                 | Mobile bottom bar free, but it's an app-shell framework whose opinions fight the desktop rail + split layout. Wrong shape.                                                                                                                                                                                 |

### Dependency-policy note

PRD-INFRA §2 requires every dependency be justified before adding. This section is
that justification for `@angular/aria` and `@angular/cdk`. Both are first-party and
versioned with the framework already in `package.json`. Net dependency count is **+2
and −0** — but see §10: Aria strengthens the case for eventually removing
`@ngrx/signals`, so the trend is flat.

---

## 3. The seam: one presenter per feature [decided]

The load-bearing decision. **Components are dumb; presenters are the only thing that
knows the business layer exists.**

```
libs/shared/data-access        apps/app/src/app/songs
┌──────────────────┐           ┌───────────────────┐     ┌──────────────────┐
│ SongStore        │           │ songs.presenter   │     │ songs.page.ts    │
│ SettingsStore    │◀─────────▶│                   │◀───▶│ song-row.ts      │
│ SessionStore     │  inject   │ readonly rows =   │     │ (aria + our css) │
│ RenderService    │           │   computed(...)   │     │                  │
│ ParserService    │           │ rename(id, name)  │     │ NEVER injects a  │
└──────────────────┘           └───────────────────┘     │ store/service    │
   survives the swap             survives the swap         DELETED on swap
```

**Presenter rules:**

- A presenter is a plain `@Injectable`, provided at the feature's route (not root), so
  its lifetime is the feature's.
- It exposes **signals in** (`readonly rows: Signal<SongRow[]>`) and **commands out**
  (`rename(id, name): void`). Nothing else. No Observables, no DOM, no Aria/CDK types.
- It owns the **view model**: the shape the UI needs, not the shape the store has.
  Paging, search, sort, and settings-cascade resolution get composed here into
  something a template binds to. A redesign changes the components; it rarely changes
  what the screen is _about_.
- Components inject **only** their presenter, plus pure Angular/Aria/CDK things.

**What this buys:** the swap is `rm -rf` on the components. Presenters keep working
against new templates because they never knew what the old ones looked like.

### The import ladder [decided]

Three rungs inside `apps/app/src/app`, each importing only downward. This is what
makes the UI peelable rather than merely tidy.

```
apps/app/src/app/
  primitives/     button · icon · tooltip · field · segmented · color · number ·
                  dialog-chrome · empty-state · spinner · badge
                  imports: node_modules ONLY. nothing in-repo. not even domain.
  shared/
    layout/       rail · bottom bar · action bar · split-pane · module switcher
    settings-panel/
    …             other cross-feature components
                  imports: primitives + node_modules + @achordeon/shared/domain
                  NEVER: data-access, never a feature
  songs/  songbooks/  stage/  audience/  settings/
                  imports: shared + primitives + libs/shared/* + own presenter
```

- **`primitives/` is the floor** — the only in-repo thing `shared/` may import. A
  primitive knows about Angular, Aria, the CDK, and nothing else. It could be lifted
  into an unrelated app unchanged.
- **`shared/` holds the frame** — rail, bars, split-pane all live under
  `shared/layout/`, plus cross-feature components like the settings panel.
- **`shared/` may import `@achordeon/shared/domain` — types only** [decided]. The ban
  is aimed at what actually couples: **features and stores**. `shared/domain` is pure
  types with zero framework deps and zero state, so importing it cannot tie the UI to
  anything that outlives it — while letting shared components speak the domain's
  vocabulary instead of re-describing it. **`shared/` never imports
  `@achordeon/shared/data-access`**; that is the line that matters, and it is the same
  line as the presenter rule.
- **Features import downward only** and never sideways — already enforced.

Because Aria is headless, the usual second seam — wrapping the library so it can be
swapped — is unnecessary. There is no library styling to quarantine; our CSS **is**
the styling, and Aria's directives are the accessibility behaviour a redesign wants
to keep anyway.

### Lint enforcement [action needed]

`apps/app/eslint.config.mjs` already isolates feature folders (`boundaries` plugin,
`default: 'disallow'`). Two changes are needed:

1. The current `shell` element is `mode: 'file'`, `pattern: 'apps/app/src/app/*.ts'`
   — root files only, so the frame has nowhere legal to live. Add a **`primitives`**
   element (`apps/app/src/app/primitives`) that may import **nothing** in-repo, and
   keep `app-shared` (`apps/app/src/app/shared`) allowed to import only `primitives`.
   Element order matters (first match wins): `shell`, `primitives`, `app-shared`, then
   the generic `feature` pattern.
2. Add a rule that no file matching `*.page.ts` / `*.component.ts` inside a feature
   may import `@achordeon/shared/data-access`. That is the presenter rule, mechanized.
   (If `boundaries` can't express it, a `no-restricted-imports` override on the
   component glob does.)
3. Add `no-restricted-imports` so **`apps/app/src/app/shared/**`cannot import`@achordeon/shared/data-access`** (domain is allowed; data-access is not), and
**`apps/app/src/app/primitives/**`cannot import`@achordeon/\*` at all**. The Nx
   project rule can't see these — it governs app↔lib edges, and both folders are
   inside the one app project.

---

## 4. Layout [decided]

### Desktop (viewport ≥ `--bp-compact`)

VSCode-style: a fixed icon rail on the left, everything else is the module.

```
┌────┬──────────────────────────┬─────────────────────────┐
│ ♪  │ Song name              ⋯ │                         │  <- action bar:
│    │ [♭][*][**][:][▭] [B][I]  │                         │     PANE A ONLY,
│ 📚 │ [↑][↓]  [↺][↻]      [⚙]  │                         │     wraps to N rows
│    ├──────────────────────────┤                         │
│ 🎤 │                          ║                         │
│    │        pane A            ║        pane B           │
│ 👥 │     (editor source)      ║    (render preview)     │
│    │                          ║                         │
│    │                          ║                         │
├────┤                          ║                         │
│ ⚙  │                          ║                         │
└────┴──────────────────────────╨─────────────────────────┘
                                ↑ draggable resizer
```

- **Rail** — the five nav modules from `basics.mdx`: Songs, Songbooks, Stage,
  Audience, with **Settings pinned to the bottom** (its own visual group — it is a
  destination, not a peer). Icon + tooltip; active module marked with a left
  indicator bar. Rail width **48px** (default, tunable). Full window height.
  - **A `<nav>` of `<a routerLink>`, _not_ an Aria toolbar** [corrected during
    implementation]. Two reasons this doc's first guess was wrong: the router is
    already the source of truth for "which module", so a toolbar's own selection
    model (`values`) would fight it; and the **WAI-ARIA APG is explicit that
    menu/toolbar semantics are for application commands, not site navigation**.
    Links in a nav landmark are what a screen reader wants here. The same reasoning
    applies to the mobile popup (§4 mobile). The **action bar** is a genuine command
    group, so it keeps `ngToolbar`.
- **Rail is not the VSCode side bar.** VSCode has rail _and_ a collapsible explorer
  panel. We don't: the "explorer panel" content _is_ pane A in the modules that need
  it (songbooks' left song list, per `songbooks/index.mdx`). One less concept.
- **The action bar sits above pane A only — never spanning pane B** [decided]. It
  carries the module title and the module's actions (insert syntax, label, transpose,
  undo/redo, ⋯ overflow). **Pane B has no bar**: nothing sits above the render but the
  render. Module actions are the module's business and are projected by the feature,
  not enumerated by the shell.
- **The action bar wraps to as many rows as it needs** [decided]. No tabs, no
  overflow-hiding. **Rows group by meaning, not by whatever happened to overflow** —
  e.g. row 1 insert, row 2 transform. Everything stays visible and one click away.
  Vertical space is what pane A has most of.

**Why no bar on pane B.** Pane B is a document preview, and the things you'd put over
it (scale, columns, aspect) are render _settings_ — which live in a dialog instead,
for the reason below.

### Mobile (viewport < `--bp-compact`)

Read `basics.mdx` carefully — the mobile bar is **not** a nav bar:

> _"For mobile view, these options are hidden in the popup menu and the bar is
> reserved for module actions."_

So: **module navigation goes into the hamburger**, and the bottom bar carries
**module actions** plus the pane switcher.

```
┌────────────────────────────────────────┐
│  Song name                             │  <- action bar (the feature's),
│  [♭][*][**][:] [↑][↓]  [↺][↻]      [⚙] │     same component as desktop
├────────────────────────────────────────┤
│                                        │
│                                        │
│        the ACTIVE pane, full width     │  <- no split; one pane at a time
│                                        │
│                                        │
│                                        │
├────────────────────────────────────────┤
│  ♪                                     │  <- module icon stacked ON the
│  ☰      [Source|Render]    ＋   ⋯      │     hamburger. no text.
└────────────────────────────────────────┘
   ↑ nav lives HERE, at thumb height
```

- **The nav trigger lives in the bottom bar, and it wears the active module's icon**
  [decided] — a **composite glyph: the active module's icon stacked above a hamburger
  rule**, no text. Tapping opens the nav popup **upward** — a `<nav>` of links in a
  `cdkConnectedOverlay` (bottom-anchored position strategy) with `cdkTrapFocus`.
  **Not** an Aria `ngMenu`: `role="menu"` is for application commands, not site
  navigation (see the rail note in §4 desktop). Same five destinations as the rail.
  - **It is a hamburger that tells you where you are.** The `☰` keeps the "this opens
    the nav" affordance that a bare module icon would lose; the module icon adds the
    "you are here" state that a bare `☰` never had — the job the rail's active marker
    does on desktop. Neither glyph alone does both.
  - **No label** [decided]. The icon is bound to the active route and swaps with it.
    Fixed **48px** target, same as a rail item — so the bar's budget is predictable and
    the label-vs-narrow-phone problem never arises.
  - **Therefore it needs a real `aria-label`**, i18n'd, naming the module _and_ the
    action — e.g. `"Songs — open navigation"`. With the text gone, that label is the
    only thing a screen reader gets, and there is no hover tooltip to fall back on
    (§11 flags `i18n-aria-label` as the easy-to-forget one).
  - **Thumb reach.** Bottom-left is reachable one-handed; a top-left hamburger is the
    single worst target on a large phone. Nav is the most-used control in the frame.
  - `basics.mdx` still holds — _"these options are hidden in the popup menu and the bar
    is reserved for module actions"_. The nav destinations stay in the popup; only the
    popup's **trigger** moved into the bar.
  - Alternative if the stack reads badly at 48px: the module icon as a small **badge
    overlaid** on the `☰` corner, rather than stacked above it. Same semantics, tighter
    footprint — a look-at-it call, not a design question.
- **Bottom bar** → module switcher + the pane switcher (segmented, only in split
  modules) + module actions, overflow into a `⋯` menu. This bar is the **shell's**;
  the action bar above the pane is the **feature's**.
- **Split collapses to tabs.** Same two panes, one visible. `songs/editing.mdx`:
  _"In mobile view, use button on the sidebar to switch between them."_
- **The action bar still wraps**, but vertical space is scarce here — this is where a
  module is most likely to push rows into the `⋯` overflow. Overflow is a mobile
  concession, not the desktop default.
- **Render settings become a bottom sheet over the render pane** — there is no "left
  pane" to center on. Height ~**45%** (tunable), so the top of the render stays
  visible and the watch-the-fit property survives. The user switches to the Render
  pane first; opening the sheet from the Source pane switches for them. Same
  `<app-settings-panel>` inside — only the container changes. **Not** a third segment
  in the pane switcher: that would hide the render entirely, which is the one thing
  the dialog exists to avoid.

### Chrome-less routes

Stage fullscreen and `/audience/:pin` must be able to hide the entire frame — a
performer mid-song sees the song, nothing else (`stage-audience/index.mdx`). The
shell reads a `chrome: 'full' | 'none'` flag off the route's `data`, so a feature
opts out declaratively without the shell knowing why.

### Which modules are split

| Route                | Pane A           | Pane B           |
| -------------------- | ---------------- | ---------------- |
| `/songs`             | song explorer    | render preview   |
| `/songs/:id/edit`    | editor (content) | render preview   |
| `/songbooks`         | songbook list    | _(single pane)_  |
| `/songbooks/:id`     | song explorer    | songbook entries |
| `/stage`             | songbook picker  | _(single pane)_  |
| `/stage/:songbookId` | performing       | _(chrome: none)_ |
| `/audience[/:pin]`   | join / session   | _(chrome: none)_ |
| `/settings`          | section nav      | section panel    |

`/songs` **is** split on desktop — `songs/index.mdx` promises _"rendered output
always visible on the right side"_, and that promise is **desktop-only** [decided].
Below `--bp-compact` it is the explorer, full width, with no pane switcher (there is
no second pane to switch to until a song is open).

**What pane B shows on `/songs`** [decided]: the render of the focused song
(`SessionStore.currentSongId` — it already exists for exactly this). **On entering
`/songs`, the most recently updated song is auto-selected**, so the pane is useful
immediately rather than greeting you with nothing. With no song selected — an empty
library — pane B shows an **empty song: a blank page**, the same page chrome with no
content. Not an illustration, not a call to action; the shape of what goes there.

> **Trap.** "Last updated" is **not** `live()[0]`. The entity map is a _growing
> windowed cache_ (PRD-INFRA §3) whose default sort is `name` — the most recently
> updated song may simply not be in the loaded page. It needs a real query
> (`sort: 'changed', dir: 'desc', limit: 1`), which `PagedRepository` already
> supports, run **independently of** whatever sort the explorer is showing and without
> resetting its window. That is a small addition to `SongStore` (Epic 4's file) — the
> store should answer "which song changed last", not the presenter reaching past it to
> the repository. **Epic 13 depends on that method existing.**

**The feature owns its split; the shell does not.** The shell provides the rail, the
bars, and a reusable `<app-split-pane>` primitive. A split module drops that
primitive into its own template and fills both sides. Rejected the alternative —
shell-owned split with two named router outlets — because half the modules aren't
split, pane content is feature-internal, and named outlets produce URLs like
`(left:foo//right:bar)` that we'd then have to hide.

### Render settings: one panel, three homes [decided]

Render settings are **not** in the action bar. The registry (`shared/domain`
`SETTINGS`) has 7 live entries and **all 7 are song-scoped** — `scale`, `columns`,
`titlePosition`, `titleLayout`, `aspectRatio`, `chordColor`, `chordSize` — with `font`
commented out and waiting. A toolbar row can't hold them, for four independent
reasons:

- **They aren't toolbar-shaped.** `aspectRatio` is a validated text input _plus_ a
  preset dropdown (`N:N` / `N` / `N/N` / `A4`, per `CONTEXT.md`); `chordColor` is a
  color picker.
- **Each needs a cascade affordance.** ADR-0006 stores overrides sparse,
  most-specific-wins, so every control at Song scope must show inherited-vs-overridden
  and offer reset-to-inherited. That's a badge and a reset _per control_.
- **The registry is built to grow.** `settings-store.ts`: _"Derived from the registry
  so a new setting appears here with zero extra wiring."_ A row has a fixed budget;
  the 8th setting breaks it.
- **Epic 12 already requires reuse** — _"the registry's Global scope, driving the same
  controls reused at Song/Songbook scope."_ A toolbar tab cannot be mounted on a
  settings _page_.

So: **`<app-settings-panel>`** — one vertical, scrollable, registry-driven component in
`app/shared`, built once and mounted **three** times:

| Feature     | Where                | Scope      |
| ----------- | -------------------- | ---------- |
| `settings`  | Settings page        | `global`   |
| `songbooks` | Songbook detail      | `songbook` |
| `songs`     | Song editor (dialog) | `song`     |

The _container_ differs per home; the panel does not.

**The panel is a controlled form — nothing more** [decided]. Values in, changes out; it
holds no state and injects no store, like every other component (§3):

```
[scope]      which cascade level we're editing -> which SETTINGS rows to draw
[values]     the sparse overrides set at THIS scope
[inherited]  the resolved values from below, for the "inherited" badge + reset
(changed)    one sparse patch out
```

It reads `SETTINGS` from `@achordeon/shared/domain` (types + registry, no state — the
import ladder above allows exactly this) to know which rows a scope may override and
which control each takes. That mapping and the help copy (§5.2) are written **once**,
here.

**Each feature wraps it, for DRY** — a thin wrapper whose only job is to bind its
presenter to those four ports. The wrapper is the feature's; the panel is shared. The
cascade logic stays in `resolveSettings` where it already lives — the panel just
displays the result.

**In the editor it opens as a dialog centered over pane A** — not over the viewport
[decided].

```
┌────┬──────────────────────────┬─────────────────────────┐
│ ♪  │ Song name              ⋯ │                         │
│    │ [♭][*][**][:][▭] [B][I]  │                         │
│ 📚 │ [↑][↓]  [↺][↻]      [⚙]──┼──┐                      │
│    ├────┌───────────────┐─────┤  │                      │
│ 🎤 │    │ Render      ✕ │     ║  │  pane B STAYS        │
│    │    │ Scale  [auto] │     ║  │  FULLY VISIBLE       │
│ 👥 │    │ Columns [− 1 +]│    ║  │  (no backdrop)       │
│    │    │ Aspect  [A4 ▾]│     ║  │                      │
│    │    │ Chord   [██]  │     ║  ▼                      │
├────┤    └───────────────┘     ║   ← watch the fit       │
│ ⚙  │      ↑ centered on A     ║     while you tune      │
└────┴──────────────────────────╨─────────────────────────┘
```

The reasoning: a render setting exists to make the content fit one page
(`CONTEXT.md`), so **you must see the render while you turn the knob**. Pane A — the
text — is exactly what you don't need meanwhile. Covering it is free; covering pane B
would defeat the feature.

Consequences that fall out of that:

- **No full-viewport backdrop.** A normal modal scrim would dim the render too. Focus
  trap **yes** (`cdkTrapFocus` — keyboard sanity), viewport scrim **no**. If a scrim
  is wanted for depth, scope it to pane A's element only.
- Positioned with `cdkConnectedOverlay` against pane A's element as origin. Min-width
  ~**300px**, which is why **pane A's min is 320px** (§5) — the dialog fits inside pane
  A even at its narrowest, so it can never spill over the render. The two numbers are
  coupled: move one, check the other.
- Dismiss on Esc, close button, or click outside — and "outside" includes pane B, so
  clicking the render to dismiss works and reads naturally.
- Open/closed is **session-only** (§7), not persisted and not in the URL.
- Rejected: **a third pane / inspector drawer** — too much on one page at 1200px, and
  it costs horizontal space permanently for something used occasionally. Rejected: **a
  popover anchored to the gear** — it floats over the render, the one thing that must
  stay clear.

---

## 5. Hand-rolled primitives [decided]

The two things no library gives us. Both live in `app/layout`.

### 5.1 Split pane

**Build `<app-split-pane>`.** ~60 lines: CSS grid driven by a
`--split` custom property, a resizer with pointer-event handlers, `setPointerCapture`
for the drag. No dependency.

Rationale: Aria has no splitter (it's a layout concern, not an ARIA pattern),
`angular-split` is stale (§2), and the requirement is small and well-understood. This
is squarely "from-scratch where it earns control" (PRD-INFRA §2).

Defaults (tunable): **50/50** initial ratio · **pane A min 320px** · **pane B min
240px** · **8px** resizer hit area over a **1px** visual rule · **double-click resets
to 50/50**.

The mins are **asymmetric on purpose**. Pane A's 320px is sized to host the render-
settings dialog (§4, min-width ~300px) with margin — so at pane A's narrowest the
dialog still fits inside it and never spills over the render. Pane B has no such
structural floor: 240px is a deliberate "I'm focusing on the text" drag, and a render
preview that small is meant to be a glance, not a read.

Requirements:

- Keyboard accessible: `role="separator"`, `aria-valuenow`, arrow keys nudge. (No
  Aria directive for this — it's ours to get right.)
- Emits the ratio; the shell persists it (§7). The component itself is stateless
  about persistence.
- Below `--bp-compact` it renders one pane and ignores the ratio entirely.
- **Must not thrash the renderer.** The render preview is an SVG regenerated from
  `layout()` on size change (PRD-RENDERING). The resizer writes a CSS variable during
  drag and only emits the settled ratio on pointer-up; the preview reacts to its own
  `ResizeObserver`, not to drag events.

### 5.2 Tooltip — and the settings help affordance

**Angular Aria has no tooltip pattern** (its list is Autocomplete, Combobox, Listbox,
Select, Multiselect, Menu, Menubar, Toolbar, Accordion, Tabs, Tree, Grid, Dialog,
Alert Dialog, Breadcrumb, Checkbox, Disclosure, Radio Group, Switch). So
`<app-tooltip>` is ours, on `cdkConnectedOverlay`.

**Every icon-only button carries its label as a tooltip** [decided] — rail items,
action-bar buttons, everything. An icon-only control with no label is a guessing game.

**One primitive, two triggers** — because the two uses have genuinely different
interaction needs, not just different content:

|                | `trigger="hover"` (default)               | `trigger="click"`                          |
| -------------- | ----------------------------------------- | ------------------------------------------ |
| Used by        | icon-button **labels** — rail, action bar | the settings **`(?)` help**                |
| Content        | 1–3 words, the control's name             | a sentence or two explaining a setting     |
| Opens on       | hover **and keyboard focus**              | click / tap                                |
| Stays          | until pointer leaves or Esc               | until dismissed — you need time to read it |
| Works on touch | **no**                                    | **yes**                                    |

**Why the `(?)` cannot be hover-only.** Touch has no hover, and the settings panel is
edited on mobile (the §4 bottom sheet). A hover-only help affordance is simply absent
on a phone. So the `(?)` is a **toggle tip**: tap to open, stays open, dismiss with Esc
/ outside-click / re-tap. (Aria's `Disclosure` doesn't exist on v21 — §2 — so the
toggle is ours.)

**Hover tooltips must satisfy WCAG 1.4.13** (Content on Hover or Focus) — easy to miss
when hand-rolling:

- **Dismissible** — Esc closes it without moving the pointer.
- **Hoverable** — the pointer can travel onto the tooltip without it vanishing.
- **Persistent** — it stays until dismissed or the pointer/focus leaves.

**The a11y wiring trap.** The button already has `aria-label` (§4; it's also the Aria
toolbar idiom — their examples put `aria-label="undo"` on each `ngToolbarWidget`). If
the tooltip _also_ exposes the same text via `aria-describedby`, screen readers
announce it twice.

- **Label tooltip** → tooltip element is `aria-hidden="true"`; the button's `aria-label`
  is the single accessible name. The tooltip is a **visual** affordance only.
- **`(?)` help** → content is _different_ from the name, so `aria-describedby` **is**
  correct here. The `(?)` button's own `aria-label` is e.g. `"About: scale"`.

**On touch, tooltips are simply absent** — no hover, and we do not fake it with
long-press. This is why the mobile module switcher's `aria-label` matters so much (§4):
it's the only thing left.

### 5.3 Premium highlight [decided]

`CONTEXT.md` requires a marker "shown throughout the app on features that are (or will
become) Premium-only, with a tooltip such as 'Premium feature available for testing'".
It is a **consumer of the tooltip**, which is why it lives here and not only in Epic 11.

- **A gold shadow** on the control — `--premium-glow`, a token like any other (§6).
- **The tooltip composes**: the premium note is **appended to the control's own label**,
  not replacing it — `"Transpose — Premium feature available for testing"`. So
  `<app-tooltip>` text is **composed, not static**, and `<app-premium>` wraps a control
  rather than sitting beside it.
- **a11y**: keep the button's `aria-label` as the plain name (`"Transpose"`) and attach
  the premium note via **`aria-describedby`**. A screen reader then says "Transpose,
  Premium feature available for testing" — the §5.2 double-naming trap avoided, and the
  premium status is not gold-shadow-only (which would reach nobody who can't see it).
- **Not a block.** `tierGuard` is highlight+tooltip during testing (PRD-INFRA §10) — the
  marker is decoration over a working control, never a disabled one.

> **Open (§13):** gold next to the brand's burnt vermilion (`hsl(11 80% 42%)`) — two
> warm tones close together may muddy rather than distinguish. One look decides it.

### Where the help text lives [decided]

The settings panel is generated from the `SETTINGS` registry, so the obvious move is a
`help` field on `SettingDef`. **Don't.** `shared/domain` is pure — no `@angular/*` deps
(PRD scopes, ADR-0005) — and help text is i18n'd copy that needs `$localize`. Adding it
to the registry drags Angular i18n into the pure domain floor.

Help text is **UI copy, not domain data**: it describes the control, not the setting's
semantics. So it lives in the settings panel as a lookup keyed by setting name:

```ts
const SETTING_HELP: Record<keyof typeof SETTINGS, string> = { … };
```

`Record<keyof typeof SETTINGS, …>` is the point: add a row to the registry and the
panel **fails to compile** until its help copy exists. The registry keeps its "a new
setting appears here with zero extra wiring" property for the _control_, while the
_copy_ is forced to exist rather than silently missing. The domain stays pure.

---

## 6. Theme, brand color & the breakpoint [decided]

### The brand color

**`hsl(11, 80%, 42%)`** ≈ `#C13515`, a burnt vermilion. Everything else is derived
from it or is a neutral grey / white / black. No second hue.

Measured contrast (WCAG):

| Pair                                   | Ratio     | Verdict                                     |
| -------------------------------------- | --------- | ------------------------------------------- |
| `#C13515` on white                     | **5.6:1** | AA ✅ (AAA ✗)                               |
| white on `#C13515`                     | **5.6:1** | AA ✅ — white label on a brand button works |
| `#C13515` on black                     | **3.8:1** | ✗ — **too low for dark mode**               |
| `hsl(11 80% 55%)` (`#E85231`) on black | **5.7:1** | AA ✅ — the dark-mode lift                  |

So the brand needs a **lightness lift in dark mode**. Store the channels, not the
color, and derive:

```scss
:root {
  --brand-h: 11;
  --brand-s: 80%;
  --brand-l: 42%;

  --brand: hsl(var(--brand-h) var(--brand-s) var(--brand-l));
  --brand-hover: hsl(var(--brand-h) var(--brand-s) calc(var(--brand-l) - 6%));
  --brand-active: hsl(var(--brand-h) var(--brand-s) calc(var(--brand-l) - 12%));
  --brand-subtle: hsl(var(--brand-h) var(--brand-s) var(--brand-l) / 0.12);
  --brand-on: white;
}
:root[data-theme='dark'] {
  --brand-l: 55%; /* the lift: 3.8:1 -> 5.7:1 */
}
```

Everything else (`--surface`, `--surface-raised`, `--text`, `--text-muted`,
`--border`, plus `--premium-glow` for §5.3) is a grey ramp, flipped by theme.
**Components read tokens, never literal colors** — that's the whole cost of a
redesign's palette change.

### The UI font

**Roboto Mono, self-hosted, temporary** [decided] — `@fontsource-variable/roboto-mono`
(`5.2.9`, **no peer dependencies**, so it can never gate an Angular major the way
`lucide-angular` would have; §9). A monospace UI is an honest signal that this chrome
is scaffolding, and it costs nothing to drop later.

> **`latin-ext` is required for Czech** — plain `latin` has no `ě č ř ž ů ď ť ň`, and
> the app ships **EN + CS** (PRD-INFRA §11), so without it Czech falls back to another
> face mid-word. Nobody sees this until they switch language.
>
> **How, corrected during implementation:** the _variable_ package ships one
> `index.css` covering every subset — there are no per-subset files to pick, unlike
> the static packages. That is fine and in fact better: each `@font-face` carries a
> `unicode-range`, so the browser fetches only what a glyph needs and the
> cyrillic/greek/vietnamese faces are declared but never downloaded. Wire it through
> the build's `styles` array so the woff2 are resolved and fingerprinted, never via a
> runtime `@import`. **Epic 11:** precache only the latin + latin-ext woff2.

Self-hosted only, precached with the shell — **never** `fonts.googleapis.com` (§9).
**This is the UI chrome font and has nothing to do with the render.** Fonts for the SVG
output are `PRD-RENDERING`'s problem, embedded into the document itself; the two must
not be conflated.

### Spacing & type scale

Tokens, same discipline as color: `--space-*` on a 4px base, `--text-*` for sizes.
Deliberately thin — a temporary UI needs a consistent rhythm, not a design system.

### Light / dark / system

`SettingsStore` already has `theme: ThemeChoice = 'system' | 'light' | 'dark'`,
hydrated from the User record. Nothing new is needed in the business layer.

A `ThemeApplier` (an `effect` in the shell) mirrors `settingsStore.theme()` onto
`<html data-theme>` — the only line of code connecting the store to the DOM. Also set
`color-scheme` so native form controls and scrollbars follow.

**FOUC.** Angular boots after first paint, so a dark-mode user sees a white flash.
Fix: a tiny inline script in `index.html.template` that reads the persisted choice and
stamps `data-theme` before paint. The template + `gen-index.mjs` already exist.

**The render preview is not themed.** The SVG output is a _document_ — it prints, it
downloads, it's what the audience sees. It stays light regardless of UI theme. Frame
it as a page-on-a-desk (surface + shadow) and let dark mode be the desk, not the
paper. **Do not** pipe UI tokens into `render-core`; that lib is pure geometry with no
`@angular/*` deps and must stay that way.

### The compact breakpoint

**`1200px`** [decided — tunable]. Above it: rail + split. Below: hamburger + tabs.

It must be **one edit** to change, and TS must not drift from CSS. SCSS is the single
source, and it emits the value for TS to read:

```scss
// _breakpoints.scss — the ONE declaration
$bp-compact: 1200px;

:root {
  --bp-compact: #{$bp-compact}; // TS reads this off :root
}
@media (min-width: $bp-compact) {
  /* ... */
}
```

The `Viewport` service (§8) reads `--bp-compact` via `getComputedStyle(document
.documentElement)` at construction and builds its `matchMedia` query from it. Change
the SCSS variable, and CSS and TS move together — there is no second place to forget.

---

## 7. Where UI state lives [decided]

The rule, then the table.

- **Route** — it's a _place_: something you'd deep-link, bookmark, or hit Back out of.
- **Search param** — it _modifies_ the place and must survive a reload or a shared link.
- **Global signal store** — cross-feature transients and persisted user preferences.
- **`localStorage`** — device-local chrome preferences that must **not** sync.

| State                                      | Lives in                            | Why                                                                                                                                                                                                  |
| ------------------------------------------ | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| module / song id / songbook id / lobby PIN | **route** (PRD-INFRA §10)           | Already specified. `/audience/:pin` is a QR target — it _has_ to be a URL.                                                                                                                           |
| explorer search `?q=`, sort `?sort=`       | **search param**                    | Survives reload; shareable. Also: PRD-INFRA §3 says changing sort/search **resets the entity cache** — one source of truth avoids two.                                                               |
| mobile active pane `?pane=source\|render`  | **search param**                    | Survives reload and rotation, and lets a link land straight on the render.                                                                                                                           |
| split ratio, rail collapsed                | **`UiStore` → `localStorage`**      | Chrome prefs. Must **not** sync: a desktop ratio is nonsense on a phone. `localStorage` because it must be readable **synchronously at boot** — an async IndexedDB read means a visible layout jump. |
| theme, language                            | **`SettingsStore`** (exists)        | Persisted + synced user preference. Already built.                                                                                                                                                   |
| multi-select, current song                 | **`SessionStore`** (exists)         | Cross-feature transient. Already built — see its own doc comment.                                                                                                                                    |
| stage fullscreen                           | **`UiStore`, session-only**         | Deliberately **not** a URL param: the Fullscreen API needs a user gesture, so a reload could never restore it. A URL that lies is worse than no URL.                                                 |
| settings dialog open/closed                | **feature presenter, session-only** | A transient dialog, not a place. Not persisted (reopening on reload would be surprising), not in the URL, and not shell state — it belongs to the feature that opened it.                            |
| `isCompact` (viewport)                     | **`Viewport` service signal**       | Derived, never stored. See §8.                                                                                                                                                                       |

`UiStore` is hand-rolled per PRD-INFRA §3 ("hand-rolled for the small ones") and lives
in `app/layout` — it is shell state, not business state, and must **not** go in
`libs/shared/data-access` where it would outlive the UI it describes.

**Reading search params:** enable `withComponentInputBinding()` on the router, so
params arrive as signal `input()`s. No `ActivatedRoute` juggling, no RxJS.

---

## 8. No RxJS — and Aria doesn't make us break it [decided]

PRD-INFRA §3 is absolute: _"No `Observable`, no `async` pipe."_ **This is a large part
of why Aria beat Material** (§2): Aria's API is model signals, so there is nothing to
convert. `[(value)]`, `[(expanded)]`, `combobox.expanded()`, `widget.selected()` bind
straight into templates.

Two things still need care:

| Surface              | Rule                                                                                                                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BreakpointObserver` | **Don't use it** — it's Observable-shaped. Hand-roll the `Viewport` service: `matchMedia()` (query built from `--bp-compact`, §6) + a `signal`, ~12 lines, one place.                                                 |
| Dialog result        | Aria's dialog is a directive over our own markup, so the "result" is our own signal or a promise we own. No `afterClosed()` equivalent to unwrap. (This is the Material problem we specifically declined to inherit.) |

**The rule:** no Observable may be a field, live in a presenter or store, or reach a
template. No `AsyncPipe` anywhere in `apps/app`.

---

## 9. Icons: the offline trap [decided]

`basics.mdx` flags this as open: _":::danger Icons / component for the nav items.:::"_

**A CDN icon font breaks the app.** Achordeon promises to run offline once installed
(`CONTEXT.md`), and PRD-INFRA §7's CSP would have to allow a third-party origin.
The rail is icon-only with no text fallback — a cold offline boot would show a rail of
empty boxes. Note that **Angular's own Aria docs examples contain
`@import url('https://fonts.googleapis.com/icon?family=Material+Symbols+Outlined')`**
— do not copy that line when cribbing from them.

**Decision: self-hosted inline SVG — Lucide icons via `lucide-static`, behind our own
`<app-icon>`.** Neutral line-icon style that suits a rail and won't fight a future
design.

**Take the icons, not the Angular wrapper** [decided]. `lucide-angular@1.0.0` peers
`@angular/core: 13.x - 21.x` — it **caps at 21 and would become a second gate on the
Angular 22 upgrade**, next to `@ngrx/signals` (§10). That is precisely the version-lag
trap this doc argues against everywhere else; taking it for _icon glyphs_ would be
absurd. `lucide-static@1.24.0` has **no peer dependencies at all** — it is a bag of SVG
files — so it can never gate an Angular major.

- `<app-icon name="songs">` renders an inlined SVG from a small generated sprite/map;
  only the ~20 icons we use ship. No font file, no CDN, nothing extra to precache
  beyond the JS bundle ngsw already precaches.
- The icon _set_ is then a build-time detail: swapping Lucide for another source later
  touches one map, not every template.

**Not** acceptable: anything referencing `fonts.googleapis.com`, or any icon package
that peers `@angular/core`.

The UI font follows the same rule (§6): self-hosted or system stack — never a CDN.

---

## 10. Angular 22: costed, deferred [decided]

**Stay on Angular 21 for now.** `@angular/aria@21.2.14` peers `@angular/core: ^21.0.0
|| ^22.0.0`, so **nothing in this doc is blocked by staying.** v22 buys Aria-stable
(§2's caveat) and Signal Forms; neither is needed to build the shell. Upgrade as its
own task, not as a prerequisite.

The cost, measured against the current `package.json`:

| Step                | From → To            | Notes                                                                                           |
| ------------------- | -------------------- | ----------------------------------------------------------------------------------------------- |
| Nx                  | `22.7.2` → `23.1.0`  | **Required first.** `@nx/angular@22.7.2` peers `@angular/build >= 19 < 22` — it caps us out.    |
| Angular             | `21.2.9` → `22.0.7`  | `nx migrate` runs the automatic migrations                                                      |
| TypeScript          | `~5.9.2` → `6.0.x`   | Angular 22 pins `>=6.0 <6.1`. Note TS `latest` is already `7.0.2` — we'd sit on a superseded TS |
| Jest                | `^29.7.0` → `^30`    | forced by `jest-preset-angular@17` (peers `jest ^30`)                                           |
| jest-preset-angular | `^14.1.1` → `17.0.0` | supports Angular `>=20 <23` ✅                                                                  |
| angular-eslint      | `21.3.1` → `22.1.0`  | ✅ available                                                                                    |
| Node                | `v22.22.3`           | ✅ already satisfies v22's "Node 22 or 26"                                                      |

### The blocker: `@ngrx/signals` [open]

**`@ngrx/signals` has no Angular 22 release.** Latest is `21.1.1`, peering
`@angular/core: ^21.0.0` strictly; the `next` tag is `21.0.0-rc.0`, i.e. older. It is
the one dependency in the workspace gating an Angular major — precisely the
version-lag risk ADR-0010 rejected Monaco over, taken somewhere less visible.

It is used in exactly two files (`song-store.ts`, `songbook-store.ts`), and what it
actually earns there is **`withEntities` plus four updaters** (`setAllEntities`,
`setEntities`, `setEntity`, `updateEntity`) — an id-keyed map and immutable helpers.
The rest (`signalStore`, `withState`, `withMethods`, `withComputed`, `patchState`) is
organizational sugar over what a plain class with `signal()` fields does natively —
which is exactly what `SettingsStore` and `SessionStore` already do.

Three ways out, to decide when the upgrade is actually scheduled:

1. **Wait** for `@ngrx/signals@22`. Zero work, unknown date.
2. **Peer override** — `pnpm.peerDependencyRules.allowedVersions`. Cheap; the library
   is signal-based and likely works on 22 untested. Silences a real signal, though.
3. **Drop it** — hand-roll the two entity stores (~40 lines each). PRD-INFRA §3
   already named this option A ("zero deps, full control"), so it is not a new
   decision, just the other branch of one already taken. Removes the gate permanently.

---

## 11. i18n

Every string the shell emits needs `i18n` with an explicit `@@id` (PRD-INFRA §11,
runtime `@angular/localize`, EN + CS). One shell-specific trap: icon-only rail items
carry their label in the tooltip + `aria-label` — both attribute strings, so they need
`i18n-aria-label` etc., which is easy to forget and invisible until someone switches
to CS.

Aria ships no strings of its own (it's headless), so unlike Material there is no
second translation channel to wire.

---

## 12. Swap checklist

What "the designed UI lands" should cost, if this doc did its job:

- [ ] Delete `apps/app/src/app/shared/layout` and every `*.page.ts` / `*.component.ts` in the feature folders.
- [ ] `primitives/` and the rest of `shared/` are the redesign's call — they're generic and unstyled-by-contract, so they may survive a reskin (retoken §6) or go with the rest. Either way nothing below them notices.
- [ ] Keep every `*.presenter.ts`, every route path, every search-param contract.
- [ ] Keep `libs/shared/*` — untouched, tests still green.
- [ ] Keep `@angular/aria` **and** `@angular/cdk` — headless a11y behaviour, drag&drop, overlay and virtual scroll are wanted under any design. **Nothing is uninstalled.**
- [ ] Redefine the token block in §6 (or rename the tokens). That is the palette swap.
- [ ] E2E specs still pass. **This is the actual proof.** Which means: the shell and every interactive element carries a stable `data-testid`, and `apps/app-e2e` selects on those — never on class names, never on DOM structure. A Playwright suite that survives the swap is the only mechanical evidence the seam held.

---

## 13. Open questions

- **Grey ramp temperature.** The brand is warm (`h=11`). Pure-neutral greys next to it
  can read slightly cold. A ~2–4° hue tint in the greys may sit better — needs one look,
  not a debate.
- **Gold vs. the brand.** `--premium-glow` (gold) sits next to `hsl(11 80% 42%)` (burnt
  vermilion). Two warm tones in close company may muddy instead of distinguish — and
  the premium marker's whole job is to stand out. One look decides it (§5.3).
- **Rail on tablet landscape.** At ~1200px the rail plus a split may leave panes
  narrow. That's exactly the breakpoint value in §6; the first real device check should
  confirm 1200 or move it.
- **Does the stacked glyph read at 48px?** Module icon over a hamburger rule is two
  marks in one small target; it may just look like noise on a phone. The badge-overlay
  variant is the fallback. One look decides it — and it's cheap either way, since the
  `aria-label` carries the meaning regardless.
- **Songbooks needs two explorers side by side** (`songbooks/index.mdx`) inside a
  split, on top of the drag&drop between them. The narrowest real layout in the app —
  worth prototyping before committing the split defaults in §5.
- **Aria dev-preview churn.** Worth a quick re-read of the v22 Aria changelog before
  the upgrade (§10), to see whether anything we consumed on 21 moved.
