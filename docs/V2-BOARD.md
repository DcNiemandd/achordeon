# Achordeon — the v2 board

The work board. Every card is a candidate, not a commitment: **`[discuss]` cards
are here to be argued about, and most of them will not be built.**

Companion to [`OPEN-WORK.md`](./OPEN-WORK.md), which surveyed what was missing.
This is what happens about it. Written against the code on 2026-08-12, `main` at
`c496918`; **re-checked against it on 2026-08-13**, which is where the `[done]`
tags and the struck bullets below come from. Three cards have closed since it was
written — [V2-03], [V2-05], [V2-09]'s counter — plus one bullet each of [V2-01]
and [V2-06].

## Tags

| Tag         | Means                                                                   |
| ----------- | ----------------------------------------------------------------------- |
| `[now]`     | Max priority. Nothing waits on a decision.                              |
| `[v1]`      | Shipped. Listed so the board is the whole map, not only the future.     |
| `[done]`    | Built since the board was written. Still here for the same reason.      |
| `[v2]`      | Accepted for v2. The shape is agreed; the work is not started.          |
| `[blocked]` | A named question gates it. Answer first, build after.                   |
| `[discuss]` | Parked. On the board so it is not lost, **not** because it is intended. |

---

## What the survey got wrong

Two corrections, both from checking the code rather than the documents.

**The English-notation bug is already fixed.** `817f063 fix(notation): the english
setting is a language, not "as you typed it"` landed it, and `notation.spec.ts`
holds it: `english('H') === 'B'`, `english('Hb') === 'Bb'`, and a song that mixes
spellings comes out in one language either way. Nothing to fix — the memory was
right.

**`lobby_events` inserts are arriving.** `OPEN-WORK.md` §3 repeated Epic 9's note
that every insert was denied. Two migrations from 2026-08-04 fixed it before that
note was ever re-read: `lobby_events_anonymous` dropped `owner`'s NOT NULL and
gave `anon` an insert policy, and `lobby_events_anon_grant` added the table
privilege the policy was sitting on (`42501` until it did). Anonymous hosts log
now, which is the population that matters — hosting never required an account.

And a third, about the German notation, in [V2-02](#v2-02--the-german-b--blocked).

---

## Board

| ID                                                   | Card                                  | Tag               |
| ---------------------------------------------------- | ------------------------------------- | ----------------- |
| [V2-01](#v2-01--test-health--promotion)              | Test health & promotion               | `[now]`           |
| [V2-02](#v2-02--the-german-b)                        | The German `B`                        | `[blocked]`       |
| [V2-03](#v2-03--document-sync--the-board)            | Document sync & the board             | `[done]`          |
| [V2-04](#v2-04--project-guidelines)                  | Project guidelines                    | `[v2]`            |
| [V2-05](#v2-05--title-pages-twenty-one-of-them)      | Title pages, twenty-one of them       | `[done]`          |
| [V2-06](#v2-06--what-else-a-title-page-carries)      | What else a title page carries        | `[discuss]`       |
| [V2-07](#v2-07--lift-the-account-into-view)          | Lift the account into view            | `[v2]`            |
| [V2-08](#v2-08--rebinding-a-shortcut)                | Rebinding a shortcut                  | `[v2]`            |
| [V2-09](#v2-09--aspect-ratio-instrument-then-curate) | Aspect ratio: instrument, then curate | `[done]` + `[v2]` |
| [V2-10](#v2-10--google-oauth-and-drive)              | Google OAuth and Drive                | `[v2]`            |
| [V2-11](#v2-11--buying-premium)                      | Buying premium                        | `[v2]`            |
| [V2-12](#v2-12--sharing-a-slot)                      | Sharing a slot                        | `[blocked]`       |
| [V2-13](#v2-13--the-parked-shelf)                    | The parked shelf (15 items)           | `[discuss]`       |
| [V2-14](#v2-14--a-theme-colour-of-your-own)          | A theme colour of your own            | `[v2]`            |

---

## V2-01 · Test health & promotion `[now]`

The one card with nothing to decide. Two halves, both from `OPEN-WORK.md` §6.

**Test health — and the debt is real, but it is all in one place.**

| Suite                     | Result                                                     |
| ------------------------- | ---------------------------------------------------------- |
| `nx run-many -t test`     | **1240 passed / 1240**, 91 suites, 6 projects (2026-08-13) |
| `nx e2e app-e2e` chromium | **210 passed, 28 failed** of 238 (at `c496918`)            |

The unit row read "275 / 27 suites" when this card was written, which was the
**app project alone** rather than what the command in the left column actually
runs. Re-measured across the workspace: app 292, `shared-domain` 327,
`shared-render-core` 287, `shared-data-access` 311, and two smaller projects. Still
no debt at all — the whole of it is the e2e row, which has **not** been re-run
since the board was written, so treat that number as the snapshot it is.

So round two's "~30 pre-existing Chromium failures" was accurate and **still is**,
and Epic 12's two `shell.spec.ts` fullscreen tests are among them (`audience-fullscreen`
still never becomes visible). By file: `transfer` 11, `songs` 6, `songbooks` 5,
`settings` 3, `shell` 2, `editor` 1. Several cluster around delete/remove and
download dialogs, so this is probably far fewer than 28 causes — worth one triage
pass before anyone plans 28 fixes.

**Two findings behind the number, and they matter more than the number:**

- **CI never runs e2e.** `deploy.yml` runs lint, test and build only. These 238
  tests execute exactly when somebody runs them by hand, which is how 28 failures
  accumulate unnoticed. Nothing else on this board protects a refactor the way
  wiring this in would.
- **Only chromium is installed locally**, so `nx e2e app-e2e` also reports firefox
  and webkit as failures — they never launch. `pnpm exec playwright install firefox
webkit` fixes the local picture; whether CI should run all three, or chromium only
  for speed, is a decision to make when it is wired in.

**Promotion** (`PROMOTION.md`), in the order the doc itself argues for:

- ~~**Bing is not registered.**~~ **Done — and audited (`65a5fed`).** It is
  registered, the sitemaps are in, IndexNow validates end to end (`200`, not
  `202`, not `403`), and every technical check passes. `site:achordeon.eu` still
  returns zero pages, and Bing's own URL Inspection says why: _discovered but not
  crawled_, since 2026-08-10. Not a defect to find — an unscheduled crawl, which
  is the third bullet's problem wearing a different console.
- ~~**A rejected IndexNow ping is silent.**~~ **Done (`e3dcd05`)** — a `403` or a
  `429` now prints a `::error::` naming what it means and exits non-zero. The
  other half of that note is still open: the pinger resubmits all 32 URLs on
  every push because it has no memory of the last deploy.
- **`https://achordeon.eu/sitemap.xml` is a dead record in GSC** since 2026-07-28 —
  never fetched once, while the `/cs/` twin and the index are fine. Two fallbacks
  are already written down: delete the standalone entry so the index is the only
  claim on the URL, and failing that, emit the English sitemap under a filename GSC
  has no history against. (Every URL now carries a `<lastmod>` from its own git
  history — `e0ed67e` — which is the field a crawler actually acts on, but it
  cannot help a sitemap that is never fetched.)
- **Nothing links to the site**, which the doc names as the whole problem, and
  which two consoles have now independently confirmed: one real inbound link beats
  any further technical tuning. Six unticked rows — alternativeto.net,
  awesome-list PRs, r/guitar + r/opensource + r/selfhosted, Czech guitar forums,
  Show HN, Product Hunt.

---

## V2-02 · The German `B` `[blocked]`

**The third correction, and it downgrades this card.** `OPEN-WORK.md` §1.2 called
this a silent wrong pitch. That was overstated: there is **no code path that
misreads its own input**. Reading is unconditional and documented — `toEnglishNotation`
maps a leading `H` and a `/H` to B, and a bare `B` in source is B natural for
everyone, on every device. The app is internally consistent.

What is real is narrower and still worth fixing:

1. **Source and output disagree** (`NOTATION-PLAN.md` §1a). In German, source `Bb`
   prints as `B`. Copy a printed page back into the editor and that `B` is now B
   natural — a semitone up, with nothing said.
2. **The setting's description invites the trap.** `settings.mdx` offers "German
   (H for B natural, **B for B♭**)" and never says that a `B` you _type_ stays B
   natural. A German author following that line types the wrong thing and is not
   told.
3. **Nothing warns.** `notation: german` plus a root `B` is almost certainly an
   English spelling in a German song, and the app says nothing.

**Two pieces, and only one is blocked.**

- **Not blocked — the warning** (`NOTATION-PLAN.md` §5). One symmetric predicate
  (`english` + an `H`, or `german` + a `B`), living **beside** parse and not in it,
  because `ast.warnings` must not depend on a preference or the same file would
  underline differently on two devices. It concatenates before `toMarkers` in the
  editor, and a new `WarningCode` refuses to compile until its copy exists. This
  can ship without answering anything.
- **Blocked — source == output.** `NOTATION-PLAN.md` §3 is the fork:
  **Option A**, German keeps `Bb` (half-German, zero ambiguity, the whole feature
  collapses to a transpose concern plus a normaliser) versus **Option B**, strict
  reading where source `B` means B♭ (fully idiomatic, but a song's meaning depends
  on state outside the token, `notation` must be per-song with reading never
  consulting the cascade, and every stored song needs a migration).
  **The plan recommends A**, and its argument is the right one: a German reader
  seeing `Bb` reads the right note and tuts; under Option B mis-resolved, they play
  the wrong note and never know.
- **Either way, strict German is an input dialect** (§4) — normalised once at the
  import boundary, where the `song-from-image` / `song-from-text` skills already
  own "turn foreign text into Achordeon markup", and never a storage format.

**Answer §3 before writing anything but the warning.**

---

## V2-03 · Document sync & the board `[done]`

The map had drifted from the build, and the map is what the next session opens
first. Four jobs; three of them are finished and the fourth is a standing rule.

**1. Tag the existing epics `[v1]`. Done.** Every epic heading in
`achordeon-implementation.md` carries it, and the file's own header says why once
rather than per epic.

**2. Add what landed outside it. Done — `7058bff`.** Epics 16–28, written after
the fact, with the file now saying so in as many words: _"Epics 1–15 were planned
up front. Epics 16 and above were not — they are the work that came out of using
the app once it existed."_ Every row this card listed has a home:

| Work                                    | Landed as                                   |
| --------------------------------------- | ------------------------------------------- |
| Markup round two (inline chords)        | Epic 16                                     |
| The starter library                     | Epic 17                                     |
| Songbook print preview & print settings | Epic 18                                     |
| Usage statistics & privacy              | Epic 19 — and now [V2-09]'s counter with it |
| Search & list polish                    | Epic 20                                     |
| Docs site: Czech, brand, promotion      | Epic 21                                     |
| Backup: add or replace                  | Epic 22                                     |
| Report a problem                        | Epic 23                                     |
| Page zoom                               | Epic 24 (ADR-0012)                          |
| Turn the page (rotation)                | Epic 25 (ADR-0013)                          |
| Performance transpose                   | Epic 26                                     |
| Import from an AI                       | Epic 27 (ADR-0014)                          |
| The font library (+ round two)          | Epic 28 (ADR-0016/0017/0018)                |

**3. Fix the stale rows. Done.**

- `PRD.md` shows **P1 as ✅** in the backlog table and in the mermaid graph, with
  a line under it saying P1 _is_ `achordeon-implementation.md`.
- `PRD-EDITOR.md`'s row now reads **"never written, and not needed"**, and names
  the three places its content actually lives (ADR-0010, `PARSER-GRAMMAR.md`,
  Epic 5 + Epic 16) rather than promising a fourth copy.
- **`$bp-stack` is 680px** in Epic 6's note, and the third breakpoint
  (`$bp-row-reorder: 1000px`) is written down beside it.
- `DOC-REVISION-PLAN.md` §Still genuinely open now points each of its three rows
  at the card that owns it — [V2-13], [V2-08], [V2-14].
- And one the card did not list: the two `:::danger` admonitions that promised
  shortcut rebinding in the present tense say "planned" (`b00bad7`), which is
  [V2-08]'s doc half.

**4. Keep this board the front door.** Not a job — the rule. New work gets a card
before it gets a commit, which is how [V2-14] and this record both came to exist.

---

## V2-04 · Project guidelines `[v2]`

A single page for the facts that are currently only knowable by reading the file
that holds them — the thing a new contributor (or a fresh agent session) needs
before touching anything. Not a re-statement of the PRDs: the **constants and the
conventions**, with the file that owns each, so the page can never become the
second place to change a number.

Seed list, from what this survey happened to walk past:

- **Breakpoints** — `$bp-compact: 1200px` (is the shell compact), `$bp-stack: 680px`
  (can two lists sit side by side), `$bp-row-reorder: 1000px` (per-row move buttons
  stand down). One declaration in `_breakpoints.scss`, re-emitted as `--bp-*` for TS.
- **Brand** — `hsl(11 80% 42%)` stored as h/s/l channels, `--brand-l: 55%` in dark
  (3.8:1 → 5.7:1), `--premium-glow` gold, `--premium-on` for text on it.
- **Spacing and type** — `--space-*` on a 4px base, `--text-*`.
- **Budgets** — initial bundle warns at 600 kB, errors at 1 MB. It is why jsPDF,
  svg2pdf, fflate and `@supabase/supabase-js` are `import()`ed on a gesture.
- **Sentinel ids** — `ALL_SONGS_ID`, `LOCAL_USER_ID`: ids `crypto.randomUUID()`
  cannot produce, which is what lets one route carry a real and a virtual record.
- **Time windows** — a stage session is last night's after **12 hours**; the lobby
  watchdog is **30 s**.
- **The import ladder** — `primitives/` (node_modules only) ← `shared/` (primitives
  - domain **types** only, never data-access) ← features. Enforced in
    `eslint.config.mjs`; components never inject a store.
- **Rules with teeth** — no RxJS; no `innerHTML` for song content; a CodeMirror
  import outside `songs/editor/` fails the build; `nx lint` does **not** typecheck
  templates, `nx build app` does.
- **The i18n loop** — `nx run app:sync-locales`, fill the `null` entries in
  `cs.json`, delete `stale`, then build. A new `$localize` message fails the build
  until translated.

---

## V2-05 · Title pages, twenty-one of them `[done]`

**The card asked for ten. All twenty-one of them draw.** The "(soon)" suffix and
the disabled `<option>` are gone from `songbook-print-fields.ts`, because a
choice that cannot be chosen is worse than one that is not offered.

### What it took, and the one thing that had to change

The card's finding held: **`RenderPlan.items` was text and nothing else**, and
`paper` was the whole of the non-text surface. Two additions were enough.

- **`ShapeItem` — a rectangle, and only a rectangle.** A rule is a thin filled
  one, a frame a stroked one, a band a wide one, a ticket a rounded one, so four
  looks cost one thing to carry. It rides in `RenderPlan.shapes`, **absent** for
  every song rather than empty, and it is emitted inside the fit `<g>` so it
  scales with the text it sits under. The PDF came free: the exporter is
  `svg2pdf` over the emitted SVG, so a `<rect>` travels without a second drawing
  path to keep in step — the failure the font work kept running into cannot
  happen here.
- **`TextItem.fill`** — one item's ink, overriding its role's. `banner` needs it:
  a title reversed out of a band has to be the colour of the paper the band
  covered, and the role cannot know a band was drawn there.

**The larger change is not a primitive at all — it is which way the geometry
runs.** `layoutCore` measures the content and grows a box around it; a title page
starts from the **page** and places fields on it (`layoutTitlePageCore`,
`libs/shared/render-core/src/lib/title-page-layout.ts`). That inversion is what
makes "the frame sits inside the page edge" or "the title is as wide as the
paper" expressible at all — under the old shape every variant had to be sayable
as "a title block above some content", which is exactly why three of the four
declared ones never landed. The page's short axis is `tuning.minBoxEm`, the same
floor a song gets, so the front sheet and the first song are set at one size. A
title too wide for its margins is shrunk where it is measured, never letting the
page lose the shape the book asked for.

`titlePageAst` is now `titlePageContent` — the same job (the book's fields, in
the shape the renderer takes) for a renderer that no longer wants a `SongAst`.

### The twenty-one

Placement alone — nothing but text on the page:

| #   | Variant      | What it is                                                                                                                      |
| --- | ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Classic**  | The shipped page: the three fields left-aligned as one block, block centred.                                                    |
| 2   | **Centered** | The same fields, every line centred on its own.                                                                                 |
| 3   | **Plate**    | Small centred title high on the page, author at the foot — the hymnal.                                                          |
| 4   | **Minimal**  | The title alone, at body size, in the top-left corner. Nothing else printed.                                                    |
| 5   | **Poster**   | The title as large as the width allows, author small at the foot.                                                               |
| 6   | **Stacked**  | One word to a line, flush left, sized to fill the height. One scale for all.                                                    |
| 7   | **Spine**    | The title read up the left edge (`rotate: -90`), author bottom-right.                                                           |
| 8   | **Baseline** | The whole book stood on the bottom-left corner, the sheet above it empty.                                                       |
| 9   | **Corner**   | Title top-left, author bottom-right, the diagonal between them left alone.                                                      |
| 10  | **Column**   | Title on the left, author against the right edge — sharing a baseline, not a top edge, because the two are one row read across. |

…and with rectangles:

| #   | Variant       | What it is                                                                                                                 |
| --- | ------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 11  | **Rule**      | A line under the title, subtitle below it.                                                                                 |
| 12  | **Marquee**   | A rule above the title and below it, both full width. The theatre bill.                                                    |
| 13  | **Gate**      | An upright at each margin, the height of the block and no further.                                                         |
| 14  | **Framed**    | A thin stroked border inset from the page edge, the block centred inside.                                                  |
| 15  | **Bookplate** | Two frames, one just inside the other. The ex-libris plate.                                                                |
| 16  | **Ticket**    | The book in a small rounded box, with the song count under it.                                                             |
| 17  | **Tag**       | A filled box drawn tight around the title, reversed out — where `banner` runs off both edges, this one stops at the words. |
| 18  | **Banner**    | The title reversed out of a filled band that bleeds edge to edge.                                                          |
| 19  | **Half**      | The top half of the sheet filled solid, the title standing on its edge.                                                    |
| 20  | **Bookmark**  | A narrow strip of ink down the left edge, the book centred on the rest.                                                    |
| 21  | **Footer**    | The author in a band across the foot — `banner` upside down, and it signs the book rather than announcing it.              |

And one thing all twenty-one carry and each places its own way: the **made-with
mark**. `Drawing.mark` is required, so it is part of a variant's composition
rather than a line laid over it — [V2-06] has the three decisions in it.

Two decisions inside that list, both open to being overruled:

- **`plate` dropped the tracking.** Letter-spacing would need a `TextStyle` field
  _and_ `svg2pdf` to honour it, and a screen and a PDF that disagree is the one
  outcome worth avoiding more than a plain plate.
- **The song count is worded by the caller**, not the renderer
  (`TitlePageContent.countLabel`). The renderer is geometry and has no locale; a
  named placeholder lets Czech dodge a plural rule the message cannot express —
  "písní: 12" reads at any count where "12 písní" is wrong at 1 and at 2.

### Not built, and why

| Variant            | Why not                                                                                                                                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Contents-first** | Title and summary on one sheet. Pagination and the front-matter offset, not the renderer — a different piece of work, and it should be its own card if it is wanted.                                                                                         |
| **Cover image**    | [V2-06]. The picture is the hard part, and it is still a question rather than a task.                                                                                                                                                                        |
| **None**           | It would make the "title page" checkbox and the style list answer the same question twice, so one of the two has to go — and removing the checkbox reaches the record, the sync mapping, the transfer model and an e2e id. **A decision, not an oversight.** |

---

## V2-06 · What else a title page carries `[discuss]` + one `[done]`

Beyond title / subtitle / author. Each of these is a field somebody has to decide
they want, so the card stays for discussion — except the last bullet, which was
the only one that needed nobody's permission, and it is built.

- **A cover image.** The one that changes the shape of the feature. ADR-0016 is the
  precedent and it points the way: a font is **acquired, not referenced** — bytes
  on the device, never a URL resolved at render. An image would have to follow, or
  a book prints differently on the machine that made it. Then: where the bytes live
  (a Dexie table beside the fonts), what an export does with them (fonts travel as
  _names_ and never as bytes — an image cannot, since nobody can "install" it), what
  a backup weighs afterwards, and PDF embedding. **Additive under ADR-0007**, so no
  schema break — but this is the largest thing on the board that nobody has asked
  for twice.
- **Song count** — free, already known at plan time. The "Ticket" variant assumes it.
- **A date** — printed-on, or an authored one. Authored is a field; printed-on makes
  two renders of one book differ, which is worth a moment's thought.
- **A dedication or epigraph** — one more free-text line, the cheapest of these.
- **An owner line** — "Property of…", for a book that gets left in a rehearsal room.
- **Edition / version** — for a songbook that gets reprinted.
- **A QR code** — to a shared link or an audience lobby. The QR generator already
  exists (Epic 9 draws one for `/audience/:pin`), but a QR is an image, so it waits
  on the same primitive as the cover.
- ~~**A made-with mark**~~ — **built, and on all twenty-one.** `achordeon.eu`, at
  half body size. Three things were decided in building it:
  - **The host, not the name and not "Made with Achordeon".** A printed sheet
    cannot be clicked, so the only mark that does anything is one somebody can
    type back in — which is also [V2-01]'s last bullet, the one about nothing
    linking to the site.
  - **It is part of each variant's design, not a line added after it.** The first
    attempt put it in the bottom margin, the one strip of paper no layout was
    using, and that is exactly what it looked like: a stray line under a finished
    composition. So `Drawing.mark` is **required** — a variant does not compile
    until it has said where its own mark goes. It is the imprint under the block
    on `classic`, the credit against the author's baseline on `poster`, a third
    turned column on `spine`, printed up the ribbon on `bookmark`, the small
    print inside the box on `ticket`, a masthead line inside the band on
    `banner`, the second signature inside it on `footer`, and the engraver's line
    just inside the border on `framed` and `bookplate`. Where it joins a block it
    is measured _with_ it, so the block is centred and sized around it rather
    than having something appear beneath it.
  - **No setting, and no variant gets a say in whether there is one.** Only in
    where it goes. Its ink reverses wherever its variant stood it on ink, which
    is the same rule `banner`'s title follows.

---

## V2-07 · Lift the account into view `[v2]`

`account.mdx` states the problem against itself: nothing outside Settings says the
account exists, so somebody who never opens Settings never learns their library
could be backed up at all. The library is local-first and genuinely lives on one
device until told otherwise — this is a data-loss path, not a conversion funnel.

Options, roughly cheapest first:

1. **An account item in the rail**, above or beside the pinned Settings — a neutral
   glyph signed out, the identity signed in. Persistent, interrupts nothing, and it
   is where the eye already goes for "the app itself". **The recommendation.**
2. **A dot on the rail's Settings item** while signed out — cheaper still, but a
   badge that never clears is a badge people learn to stop seeing.
3. **The empty state says it.** `/songs` with an empty library already draws
   something; a line about where songs live costs nothing and is read at exactly the
   moment somebody is deciding to invest in this app.
4. **A one-time card once the library is worth losing** — at N songs, a dismissible
   row: "N songs, on this device only." Tied to the fact rather than to the calendar,
   which is what makes it feel observed rather than sold.
5. **At the loss-moment.** The first download or export is somebody trying to get
   their work _out_; the `beforeunload` unsynced warning is the app already
   admitting the risk. Either is a fair place to mention the account once.
6. **A first-run dialog.** Listed because it was asked about, and worth being honest
   about: it arrives before anybody has anything to lose, and it is the surface
   people dismiss fastest. Fine as one line in a welcome, wrong as the only place
   the account is ever mentioned.
7. **A tour.** For discussion at best — expensive, and the app is four modules.

**Suggested pairing: 1 + 3**, and 4 if the numbers say people accumulate songs
without ever opening Settings. [V2-09] has since built the instrument that would
answer it — `Stats` counts events now, not only visits — but it counts one thing,
the page shape, so this would still need an event of its own and a line on the
privacy page to go with it.

---

## V2-08 · Rebinding a shortcut `[v2]`

Postponed to v2, and the docs currently promise it in the present tense — two
`:::danger` admonitions (`songs/editing.mdx:64`, the `settings.mdx:8` TODO list).
**Reword them to "planned" as part of [V2-03]**, because a promise in a shipped doc
is a bug of its own.

The groundwork is done and Epic 15 says so: one action declaration per action
already feeds the button, its key, its `aria-keyshortcuts` and its row in the
dialog, so a settings screen rebinds _that_ without touching a single component.
The map is hard-coded today.

Two constraints already on record, and neither should be re-derived:

- **Presses match physical position**, not the character produced (ADR-0015) — a
  Czech QWERTZ is exactly why.
- **Undo and redo are listed but not bound.** They are CodeMirror's, its keymap
  matches the character, and QWERTZ swaps the two letters they use. A rebinding UI
  has to say what it does _not_ own.

---

## V2-09 · Aspect ratio: instrument, then curate `[done]` + `[v2]`

The `TODO` that started this card is gone from `aspect-options.ts`, and what
replaced it is a note saying what the numbers will be used for. Too many ratios
in the list to read, and no evidence about which ones earn their place — the fix
was never to guess.

**Instrumented — `Stats.countAspectRatio`.** What is counted is the **pick**, not
the render: a song drawn a hundred times is one decision, and counting the drawing
would say which song somebody likes rather than which shape they reach for. It
goes out as a GoatCounter event (`e=1`, the name in `p`) over the beacon that was
already there — fire-and-forget, a 1×1 GIF, no third-party script.

The event name carries two things, because the card asks two questions:

```
aspect/preset/9:16          a row off the list
aspect/screen/131:284       "Match this screen"
aspect/screen-sideways/…    its sideways twin
aspect/custom/3:5           typed into the free-text field
```

So "which rows earn their place" and "is the free-text field used at all" are
answered by the same counter, and a ratio typed by a phone is told apart from the
identical ratio picked off the list — the first is evidence for **adding** a row,
the second that the row is already right. It fires from `settings-panel.ts`,
which is the only thing that ever knows which of the four it was: the host
receives a patch and cannot tell a pick from a typed value.

**The constraint was not skipped.** `privacy.mdx` had exactly two layers — the
path and referrer host **always** (facts the navigation itself supplied), the
screen size **on request**, because reading `screen` is reading the device. A
song's aspect ratio is neither: it is a fact about the user's **content**. It
ships as a third category, named on the privacy page in both languages, behind
the same opt-in, and `stats.spec.ts` holds the line that matters — an aspect
ratio while the switch is off sends **nothing at all**.

**v2 — curate.** Once there are numbers: cut the list to what people use, keep
"Match this screen", and decide whether the free-text field stays for the rest.
The commented-out device block in `aspect-options.ts` is the material — restore
it trimmed to what the counts justify, or drop it for good.

---

## V2-10 · Google OAuth and Drive `[v2]`

`OPEN-WORK.md` §3 asked what is missing. It is not code — **it is credentials, and
one Google review.**

Everything is written and typechecks: `signInWithGoogle`, `linkIdentity` with the
`drive.file` scope riding the Google identity (ADR-0009), the `provider_token`
read, and the Drive REST calls (`drive/v3/files` for the `modifiedTime` guard,
`upload/drive/v3/files` multipart for create and media for update). `config.toml`
declares the provider and says it plainly: _"leaving them unset just means the
Google button no-ops until real credentials are supplied."_

What is missing, in order:

1. **A hosted Supabase project.** `supabase.config.ts` is generated and currently
   points at `http://127.0.0.1:54321` — the local `supabase start` stack.
2. **A Google Cloud OAuth client** (web). `SUPABASE_AUTH_GOOGLE_CLIENT_ID` and
   `_SECRET` are commented out in `.env.local`; they belong in the hosted project's
   Auth ▸ Providers ▸ Google and in CI as repo variables.
3. **The redirect URI** — the Supabase project's `/auth/v1/callback`.
4. **The consent screen, and this is the long pole:** `drive.file` is a **sensitive
   scope**. Public use needs Google's verification (an app homepage, a privacy
   policy, a demo video, and a wait). `privacy.mdx` and `account-data.mdx` already
   exist and already cite the Google API Services User Data Policy, which is most of
   the paperwork. Until it clears, Testing mode allows up to 100 named test users —
   which is enough to exercise every path below.
5. **Then actually drive them once**: sign in, link a second method, connect Drive,
   upload, download, and force the `modifiedTime` conflict. None of it has ever run
   against a real Google grant, so "it typechecks" is the whole of the evidence today.

One thing already handled and worth not re-discovering: the persisted session
**strips `provider_token` and `provider_refresh_token`** on write (a storage adapter
in `supabase-client.ts`), because §7 forbids them sitting in the browser. The live
signal still holds the token for the page that minted it, which is where Drive uses
it — so a Drive action after a reload needs a fresh grant by design, not by bug.

---

## V2-11 · Buying premium `[v2]`

D7 in `PRD.md`, explicitly post-v1 there, and now on the v2 board by request.

Today premium activation is a **manual flip** of `profiles.plan` in the dashboard,
and `plan` is never written from the client. Premium is free during testing, so no
payment path ships — `tierGuard` is highlight-and-tooltip, never a block.

What buying it needs:

- **A merchant of record** (the research names one), so VAT/sales tax is theirs and
  not yours. A lifetime checkout, per `PRD.md`.
- **An Edge Function taking the webhook** → sets `profiles.plan`. The same function
  the **Drive token-broker (Flow B)** wants, which is why the two are one card in
  `PRD.md` and should stay one piece of work: an Edge Function holding the
  `provider_refresh_token` server-side gives a silent, no-redirect Drive token and
  fixes the reload gap in [V2-10] at the same time.
- **What premium is**, stated somewhere a buyer can read before paying. Today it is
  automatic Supabase sync + Audience hosting, and the tier table in `settings.mdx`
  is where it already lives.
- **The testing-period promise.** People are using premium free right now. Whatever
  ships has to say what happens to them, and `IS_TESTING` in `TierGuard` is the one
  switch that decides it.

---

## V2-12 · Sharing a slot `[blocked]`

Two songs side by side on one sheet, so a book of narrow songs is not a book of
half-white pages. Paper only.

`plans/sharing-a-slot.md` is **paused mid-grill**, and the vocabulary is already
settled into `CONTEXT.md` — **Slot** is the printable region of a sheet, **Share**
is a song's fraction of a slot's width, **Entry** is a positioned reference inside
a songbook (the `(slot)` alias was dropped so the word means one thing).

**The question that gates everything: is a share authored or derived?**

- **Derived** from the song's own aspect ratio: no field, no schema story, no UI, no
  "which control wins" — the shape ADR-0013 refused. Its strong property is that a
  derived pairing **never makes a song smaller**. Its cost is the deliberate shrink
  (two A4-shaped songs the user wants on one sheet at half size), and it makes
  pairing follow the paper, so a book's page count stops being a property of the
  book.
- **Authored**: an optional field on `Song`, additive and lossless under ADR-0007,
  outside the `SETTINGS` registry for the same reason `allSongsOrder` is.
- **Both**, derivation as the floor and an authored value as a request.

Nothing in `render-core` or `download-service.ts` implements any of it. **Do not
start until the fork is answered** — it decides whether there is a schema change
and a UI at all.

---

## V2-13 · The parked shelf `[discuss]`

Everything `PRD.md` §Future kept so it would not be lost. On the board by request,
tagged for discussion **as a whole**: these are not intentions.

| Area      | Item                                                                        |
| --------- | --------------------------------------------------------------------------- |
| Sync      | Concurrent multi-device sync + live Realtime updates (a premium upgrade)    |
| Sync      | In-app account merge — v1's escape hatch is Export → Import                 |
| Sync      | Unlink a sign-in method — add-only today, and unlinking Google breaks Drive |
| Sync      | Passwordless / magic-link login                                             |
| Sync      | Drive token-broker (Flow B) — folded into [V2-11], where it belongs         |
| Storage   | "Empty trash" — ever purging tombstoned rows                                |
| Rendering | Autofit (`PRD-RENDERING` §4.4); columns smart auto-fit                      |
| Rendering | Scrolling / multi-page for over-long songs                                  |
| Rendering | Key-aware transpose spelling — v1 is direction-based (ADR-0008)             |
| Rendering | A chord-collision / min-gap spacing setting                                 |
| Notation  | Solfège spellings (`Cis`/`Des`/`As`/`Es`) — see [V2-02]                     |
| Audience  | D9 — a viewer transposes their own copy                                     |
| Audience  | Audience over LAN with no internet                                          |
| Audience  | Host-facing performance history — v1 analytics are developer-only           |
| Fonts     | woff/woff2 support; a separate chord face                                   |
| Security  | Optional passphrase encryption-at-rest                                      |
| Import    | Re-import of downloaded PDFs — PNG already carries its `tEXt` metadata      |
| Toolchain | Angular 22 — gated on `@ngrx/signals@22` (no release, peers `^21` strictly) |
| Design    | `PRD-UI-SHELL` §13's four one-look questions — the colour itself is [V2-14] |

---

## V2-14 · A theme colour of your own `[v2]`

The app is one red. `--brand-h: 11`, `--brand-s: 80%`, `--brand-l: 42%` in
`_tokens.scss`, and every hover, active, subtle and focus ring is computed from
those three channels — which is the whole reason this is a card and not a
research project. **The palette is already a function of one colour; nothing
reads a literal hex.** What is missing is a way for the user to move it and a
place to keep it.

`DOC-REVISION-PLAN.md` has carried "theme colours, pending design" since the
first grilling session, and it is the last of that file's three open rows still
without a home. This is the home.

What it needs, in order:

- **A stored value.** A setting, so it cascades and syncs like the rest — but the
  app's own chrome is not a render setting, and the distinction matters: nothing
  here may reach `RenderTuning`. The theme is the desk, the render is the paper
  (`PRD-UI-SHELL.md` §6), and a brand colour that leaked into a chord sheet would
  print somebody's taste onto every page they hand out.
- **Three channels, not a hex.** Storing `h`/`s`/`l` separately is what lets the
  dark theme keep lifting lightness alone (`--brand-l: 55%` in dark, 3.8:1 →
  5.7:1). A hex would flatten that and every custom colour would fail contrast on
  one of the two themes.
- **A contrast floor.** `--brand-on: #fff` is 5.6:1 on today's red and would be
  1.9:1 on a yellow. Either the floor lifts the chosen lightness the way
  `liftInkForPaper` already lifts a chord colour against a dark page — the
  precedent exists, in `dark.ts` — or the on-colour flips between white and
  near-black at a measured threshold. **This is the one part that is real work**;
  the rest is a picker and a token.
- **What the picker offers.** A free hue wheel, or a short list of picked hues?
  A list keeps every option contrast-checked in advance and reads as design
  rather than as a settings screen; a wheel is what people expect. Worth deciding
  before building either.
- **The two neighbours it must not muddy.** `--premium` is gold (`hsl(45 90% 45%)`)
  and `--danger` sits at 358° — deliberately close to the brand's 11° so it reads
  as the same family. A user-chosen hue near either weakens a signal that has to
  survive being glanced at: danger stops looking like danger at h≈358, and gold
  stops looking like gold at h≈45. Whether the picker refuses those bands, warns,
  or simply allows them is a decision this card owes.

`PRD-UI-SHELL.md` §13's grey-ramp question (a warm tint beside a warm brand) is
the same question asked once per possible brand, so answering it generically —
neutral greys, always — is probably what a custom colour forces.

---

## Suggested order

1. **[V2-01]** — **the only `[now]` card left**, and two of its four items are
   done: Bing is registered and audited, and a refused IndexNow ping is loud.
   What remains has no decisions in it either — triage the 28 chromium failures
   (they cluster), wire e2e into CI, unstick the GSC sitemap record, and get one
   real inbound link, which is what both consoles now say is the whole problem.
2. ~~**[V2-03]**~~ — **done.** The epics are tagged, epics 16–28 are written down,
   and the three stale rows are corrected.
3. **[V2-02]'s warning half** — it needs no fork and closes the honest half of the
   notation complaint.
4. ~~**[V2-09]'s counter**~~ — **done.** It is counting picks, behind the opt-in,
   with the privacy page saying so. [V2-07]'s question — whether people ever open
   Settings — is still unmeasured, and the same beacon would answer it.
5. ~~**[V2-05]**~~ — **done.** Twenty-one title pages, one rectangle primitive, and
   a title page that is laid out on the page instead of boxed like a song — plus
   [V2-06]'s made-with mark on every one of them.
6. **Answer two questions** — `NOTATION-PLAN.md` §3, and authored-vs-derived in
   [V2-12]. Both unblock real work and neither needs code to decide.
