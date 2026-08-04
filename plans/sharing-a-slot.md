# Assignment — Sharing a slot

**Status: design paused mid-grill.** Everything under _Settled_ is resolved and
should not be re-derived. The open question in _Where it stopped_ gates the rest —
it decides whether there is a schema change and a UI at all, so nothing below it
is worth designing until it is answered.

Glossary: `CONTEXT.md` §Slot, §Share, §Songbook, §Download.
Decision record: [ADR-0013](../docs/adr/0013-rotation-is-derived-not-authored.md),
whose closing consequence names this work.
Predecessor: [turn-the-page.md](./turn-the-page.md), which deferred it.

Identifiers below are descriptions, not names. Naming is yours.

## Scope

Two Songs printed side by side on one sheet, so a book of narrow Songs is not a
book of half-white pages. **Paper only** — the songbook PDF and the on-screen
preview that must show what will print. Nothing about the Performance view
changes, and nothing about how a Song is drawn changes: a Song keeps its own
shape and is simply given a different amount of room.

Out of scope, and each for its own reason:

- **The single-song download** — one Song, one file, no book to pack.
- **The multi-song PDF** (`downloadSongs`) — these are N separate songs rather
  than a songbook, and each already gets its own page shape (`pageForBox`).
  Packing them would be imposing a book that was never assembled.
- **The songbook image ZIP** — every Song is its own file. There is no sheet, so
  there is nothing to share.

## The words

Three of them were already spoken for, and the collision was real: `slot` meant an
Entry in a Songbook _and_ the printable region of a sheet, while `columns` is a
Song's own internal text columns (`settings.ts:17`). The feature cannot be called
"slots" without a reader of `songbook-plan.ts` meeting the word in three senses.

Resolved, and written into `CONTEXT.md`:

- **Slot** — the printable region of a sheet, the paper minus its margins. This is
  the meaning `PRD-RENDERING.md:223` already gave it; nothing was renamed.
- **Share** — a Song's fraction of a slot's width.
- **Entry** — a positioned reference to a Song inside a Songbook. The `(slot)`
  alias was dropped from the glossary so the word means one thing.

## Settled

Carried from the grill that produced `turn-the-page.md`, and from this one. The
two grills disagree in two places; where they do, this file is the later word and
says so.

- **At most two Songs to a slot**, and the cut is **vertical** — two columns, side
  by side.
- **Order is never changed.** The walk is greedy and adjacent-only, front to back
  through the Songbook's entries (`entities.ts:30`, "a stored book's order IS its
  content"). Every lookahead strategy is a reordering strategy in disguise.
- **Two Songs pair when their shares sum to at most `1`.** A share of `1`
  therefore never pairs, which is how a Song says "the whole sheet".
- **A Song alone in a slot fills it**, whatever its share said. _This supersedes
  the earlier bullet that accepted a blank remainder after an unpaired half._ A
  share is permission to be paired, never an instruction to leave paper blank.
- **The slot divides in proportion to the shares of whoever is in it**, not by
  their absolute widths. Two halves take half each; a half beside a quarter takes
  two thirds and a third; a lone Song's ratio is 1:nothing, so it takes
  everything. The same number does two separate jobs — **sum ≤ 1 admits a pair,
  the ratio splits the slot** — and proportional division is what makes the lone
  case and the paired case one rule rather than two.
- **A share changes nothing about the drawn page.** It does not cascade and it
  reaches no render. The Song is the shape it always was.

### Numbering

Today a song's place in the book and its sheet are the same number, so nothing has
ever had to choose between them: `songbook-plan.ts:80` writes `number: i + 1`,
`summaryItems` writes `String(index + 1)`, and `drawSummary` links to
`frontMatter + entry.index + 1` — three copies of one piece of arithmetic that
holds only because one Song is one sheet. Pairing is the first time they diverge.
They are split rather than reconciled:

- **Every corner position numbers the sheet.** One number on sheet 3 whatever is
  on it, and the summary prints that sheet number against each title — so two
  paired Songs both read `… 3`. A reader sent to page 3 turns to page 3 and finds
  both titles at the head of their columns. Nothing is ambiguous; they arrived.
- **`before-title` numbers the Song.** "7. Wonderwall" beside "8. Yesterday" on
  one sheet, and the summary prints 7 and 8. This is how a book is used out loud —
  a song is called by its number, not by the leaf it landed on. _This resolves the
  case `turn-the-page.md` recorded as open:_ two Songs claiming one heading number
  was an artefact of the heading number and the corner number being the same
  number, and they never appear together anyway (`download-service.ts:447` already
  skips the corner for `before-title`).
- **The summary's hyperlink always targets the physical sheet**, in both modes.
  This is required either way — `entry.index + 1` stops being a sheet index the
  moment anything pairs — and it is what makes a clicked contents line land on the
  right page.

The cost, stated so it is not a surprise later: the two modes now mean different
things by "the number", where today they agree. `before-title` stops being a
position on the paper and becomes a numbering scheme.

### Rotation

Each part of a shared slot asks ADR-0013's predicate about **its own box**,
inheriting the rule rather than restating it. `gainsRoomTurned` and `placeInto`
already carry it; a column is just a narrower `page` argument. This part is free.

## Where it stopped

**Is the share authored, or derived from the Song's aspect ratio?**

The geometry that raises it. A slot has ratio `R`, a Song's render box ratio `r`.
Fitted alone into the slot today, a Song with `r < R` is height-bound: it draws at
full height and uses exactly `r / R` of the width. That fraction _is_ the share,
and nothing had to declare it. `CONTEXT.md:95` says the aspect ratio exists "to
minimize empty space", so a Song that only needs half a page is one whose author
has already narrowed its ratio.

Two controls over one fact is the shape ADR-0013 refused — "a second control over
the same fact only raises the question of which one wins" — and here they do
disagree: an A4-shaped Song (`0.707`) told `share: 0.5` gets half the width, draws
at **50% linear scale**, and leaves the bottom of the sheet blank. Its natural
share was `1`.

- **Derived.** No field on `Song`, no schema story, no UI, no "which wins". Its
  strong property is that **a derived pairing never makes a Song smaller**: a Song
  whose natural share is `0.5` is height-bound alone in the slot — full height,
  half the width, half the sheet white — and paired with another `0.5` it is drawn
  at _identical_ size with the white gone. A free win with no trade, which is what
  would let it be automatic and control-free on the same argument that makes
  rotation automatic on paper.

  What it costs: the **deliberate shrink** — two A4-shaped Songs the user wants on
  one sheet at half size, trading print size for sheets. Their natural shares are
  both `1`, so they never pair, and only an authored share buys it.

  What it complicates: the pairing then follows the **paper**, since `R` depends on
  page size, orientation and margin. The same book prints two-up on A4 portrait and
  one-up on A5 landscape, and a book's page count stops being a property of the
  book alone.

- **Authored.** An optional field on `Song`, additive and lossless under ADR-0007 —
  no migration, no `SCHEMA_VERSION` bump — and outside the `SETTINGS` registry for
  the same reason `allSongsOrder` is (`entities.ts:78-84`): the registry is _render_
  settings, which cascade and resolve into a drawn page, and this does neither. The
  earlier grill enumerated the values `1`, `2/3`, `3/4`, `1/2`, `1/3`, `1/4`.

- **Both**, with derivation as the floor and an authored value as a request.

Everything still unasked hangs off this answer:

- If **authored** — where it is set. The Song settings dialog is driven entirely by
  the `SETTINGS` registry through `keysForScope` (`settings-panel.ts:602`), so a
  non-registry field cannot ride it without a special case; the alternatives are a
  Song-explorer row action or the editor's own metadata area. Then: closed set of
  fractions or a free value, and what the control is called.
- If **derived** — whether a book can refuse it. A hymnal that wants one Song to a
  sheet has no way to say so, and that would be a `SongbookPrint` field, which is
  where a book's print structure already lives. Then: what an existing book does on
  upgrade, since either default is a change — off hides the feature, on silently
  repaginates every narrow book that already exists.
- Either way: what the preview page becomes when it holds two renders, and what the
  e2e asserts.

## The seams

| File                          | What it assumes today                                                    |
| ----------------------------- | ------------------------------------------------------------------------ |
| `songbook-plan.ts:44,80`      | `songCount`, and "one numbered sheet per song". The pairing walk's home. |
| `download-service.ts:437-443` | The draw loop: one `addPage` per song.                                   |
| `download-service.ts:815`     | Summary link target `frontMatter + entry.index + 1`.                     |
| `download-service.ts:885`     | `summaryItems` numbers songs `index + 1`.                                |
| `download-service.ts:736-764` | `SongbookPreviewPage` holds exactly one `svg`.                           |
| `page-geometry.ts:83`         | `placeInto` is handed the whole sheet.                                   |
| `songbook-preview.ts:239`     | The `.page` element holds one render.                                    |
| `songbook-print.ts:25`        | `PageNumberPlace` — where the two numbering modes part.                  |
| `entities.ts:111`             | `Song`, if the share turns out to be authored.                           |

`gainsRoomTurned` (`aspect.ts:115`) and `turnedSvg` need no change.

## Notes on `CONTEXT.md`

Written during the grill, and standing:

- **Slot** and **Share** are new sections; `Entry` lost its `(slot)` alias.
- The **Share** entry states the settled semantics — ratio not width, sum ≤ 1
  admits, proportional split, a lone Song fills the slot — and all of that survives
  either answer to the open question. The one word contingent on it is in the
  opening sentence: a share is what a Song **asks for** if it is authored, and what
  a Song **uses** if it is derived. Fix that line when the question is answered.
