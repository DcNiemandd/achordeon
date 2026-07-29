# A fresh library gets the starter set

Date: 2026-07-28

## What changes

Today a first-time user gets exactly one song — the localized syntax tour — and the
several-song demo set is hidden behind `?seed`, a developer and e2e affordance. That
split was deliberate: `seed.ts` argues a starter library of somebody else's songs is
"a chore to delete".

That decision is reversed. A fresh library gets the whole starter set: the localized
guide song, the seeded songs, a songbook and a favourite. `?seed` is deleted, because
with the demo set arriving by default there is nothing left for it to trigger.

Separately, and in the same change: a new song stops opening as the full syntax tour
and opens as a small skeleton instead — a title, a subtitle, and one labelled section
with chords in it.

## Decisions

### A fresh library is one write, not two

`seedDatabase` and `applyGuideSong` both guard on `db.songs.count() > 0`, so they
cannot both run on the same boot — whichever writes first locks the other out. They
are re-split along ownership rather than sequenced:

- **`seed.ts` stops touching the database.** `seedDatabase(db)` becomes
  `starterLibrary(now): { songs: Song[]; books: Songbook[] }` — a pure content
  builder. It knows _what_ the starter content is, not _when_ it lands.
- **`guide-song.ts` becomes the sole first-run authority.** Its
  `stamped === null && count === 0` branch writes the guide row _and_
  `starterLibrary()` in one transaction, then stamps the guide row. `applyGuideSong`
  is renamed `applyFirstRun`, because seeding a library is now its job and the guide
  song is one row in it.
- **`providers.ts` loses the `?seed` branch.** `?empty` and the sticky
  `achordeon.seed` key are untouched.

The stamp still names a single row, so re-language keeps touching only the guide
song: editing _Amazing Grace_ must not make the tour go stale, and it doesn't.

### The guide song is what opens

The guide row is stamped `now`; starter songs get `now - (i + 1) * 1000`.
`SongsPresenter.autoSelect` selects `lastChanged()`, so a first-timer lands on the
tour, with the starter songs beneath it in a real recency order rather than a tie.

Book entries index into the starter songs only, so the guide song never appears
inside a songbook — as today.

### The songbook and the favourite ship

_Sunday Set_ and the pre-starred song arrive with the rest, so the songbooks module
has content on first run instead of its own empty state.

### Seed content is authored by hand, and is not localized

The seeded songs stay fixed source text with hand-authored `cache` — no `$localize`,
no parser in `seed.ts`. With the guide song remaining the only tour, nothing in the
seed set teaches anything, so nothing in it needs translating.

This spec does not change which songs are in `SEED_SONGS`; the entries are left
exactly as they are and replaced separately by hand. Three properties of the existing
shape are load-bearing for whoever swaps them:

- `SEED_BOOKS.songs` holds **indices** into `SEED_SONGS`. Nothing validates them, and
  `seed.spec.ts` only asserts entries resolve to _some_ seeded id, so a wrong-but-
  valid index passes silently.
- `title` / `subtitle` must match the `*` / `**` lines in `content`, because `cache`
  is authored rather than parsed. Disagreement shows one title in the list and
  another in the render pane until the first edit re-derives it.
- `settings: { columns: 2 }` on one entry is what gives the two-column render path a
  dev and e2e example.

Anything in the seed set ships in the repository, so it must be material we are free
to distribute.

### A new song opens as a skeleton, not as the tour

`@@songs.tutorial` stops being the body of every new song and becomes seed-only. A
new song gets its own localized message:

```
* New song
** Subtitle

Verse: A chord in [C]brackets lands over the [G]letter after it.
```

One line, one construct — where a chord lands — because that is the rule nothing else
in the UI can show. The rest of the language is the guide song's job, and the guide
song is in the library on first run.

The library label stays `@@songs.newName`, independent of the `*` line. Two messages
now say "New song" for two different jobs (the row label and the rendered title), and
nothing enforces that they agree — `check-locales.mjs` compares key sets, not
wording, so a translator changing one and not the other is a silent drift. Accepted:
the alternative is deriving `name` from the parsed title, which couples the library
label to song content for every new song in order to save one message.

`newSong()` keeps parsing its content for the cache, so the row shows a title
immediately (PRD-DOMAIN-MODEL §Song: derived, never authored).

### Where the two song texts live

`new-song.ts` currently holds the tour and opens with "A blank page teaches
nothing" — an argument for exactly what is being removed. One file per text:

- **`new-song.ts`** keeps its name, which is now accurate, and holds
  `NEW_SONG_CONTENT` (the skeleton) with a doc explaining why it is small.
- **`guide-song-content.ts`** is new and holds `GUIDE_SONG_CONTENT` — the existing
  tour, text unchanged, doc rewritten to be about the seeded song.

**The `@@songs.tutorial` message id does not change.** Renaming it orphans the Czech
translation in `cs.json` and `cs.sources.json`, which is real translated work, and the
id is invisible to users.

## Implementation

1. `libs/shared/data-access/src/lib/persistence/seed.ts` — `seedDatabase(db)` →
   `starterLibrary(now)`. Drop the emptiness guard and the transaction; return
   `{ songs, books }`. `SEED_SONGS` and `SEED_BOOKS` contents untouched. Rewrite the
   header comment, which currently states the decision being reversed.
2. `libs/shared/data-access/src/lib/persistence/guide-song.ts` — rename
   `applyGuideSong` → `applyFirstRun`. In the first-run branch, build the guide row at
   `now` and `starterLibrary(now)` beneath it, and write songs + songbooks + stamp in
   one `db.transaction('rw', ...)`. Later-boot behaviour (stamp check, re-language,
   stamp clearing) unchanged.
3. `libs/shared/data-access/src/lib/providers.ts` — delete the `params.has('seed')`
   branch, and with it the only `setSeedOff(false)` call; the helper itself stays for
   the `?empty` branch, and `isSeedOff()` still gates first-run. Call
   `applyFirstRun`. Rewrite the
   `provideAchordeonSeed` doc: two behaviours now, not three. Keep the `SEED_OFF_KEY`
   doc but drop the "`?seed` clears it" half.
4. `apps/app/src/app/songs/guide-song-content.ts` — new file; move the existing
   `$localize` block across verbatim as `GUIDE_SONG_CONTENT`, id unchanged, doc
   rewritten.
5. `apps/app/src/app/songs/new-song.ts` — replace the tour with `NEW_SONG_CONTENT`, a
   new `@@songs.newContent` message carrying the skeleton above. Keep the
   `$localize` description note pattern: it must warn a translator to keep the syntax
   and translate only the words, and it must contain no literal `:` `\` `|` `@`.
6. `apps/app/src/app/songs/songs.presenter.ts` — `newSong()` uses
   `NEW_SONG_CONTENT`. `name: NEW_SONG_NAME` unchanged.
7. `apps/app/src/app/app.config.ts` — import `GUIDE_SONG_CONTENT` from its new home.
8. `pnpm nx run app:sync-locales` — the new message lands in `cs.json` as `null`.
   Write the Czech skeleton, and let the tool record its source in
   `cs.sources.json`. `pnpm nx run app:check-locales` must pass.
9. Docs — `docs/PRD-INFRASTRUCTURE.md` §2 (lines 149-150) describes the three-way
   branch and `?seed`. Rewrite to the two-way one.

## Tests

**Unit**

- `seed.spec.ts` shrinks to `starterLibrary`: it returns songs and books, book entries
  resolve to ids in the returned songs, and timestamps descend by index.
- `guide-song.spec.ts` gains: a first run writes the guide **and** the starter songs
  **and** the songbook; the guide carries the newest `updatedAt`; a second boot writes
  nothing; editing a _starter_ song leaves the guide stamp intact; re-language replaces
  the guide row only and leaves starter songs alone.
- `new-song.spec.ts` currently checks the tour against every shipped catalog. It
  splits, and the catalog reader becomes a shared helper:
  - `guide-song-content.spec.ts` keeps the full construct-coverage suite — that text
    is the language's shop window and every catalog must show the whole language.
  - `new-song.spec.ts` gets the lighter contract for the skeleton, per catalog: parses
    with zero warnings, has a title and a subtitle, has at least one labelled block,
    and has at least one valid chord.

**e2e**

- `songs.spec.ts` first-run test — asserts exactly one song today. Becomes the starter
  count, still asserting the guide is the row showing in the render pane, and that a
  reload is not a second first run.
- `songs.spec.ts` `?seed` test — deleted. Its "does not duplicate" coverage moves into
  the first-run test above.
- `songs.spec.ts` new-song test — currently asserts the full tour in the editor
  (`[[C]]`, `Softly:`, `***both***`). Becomes the skeleton: the title line and a
  chord, and still no parse warnings on sight.
- `stage.spec.ts` (3 call sites) and `mobile-layout.spec.ts` (2) — `page.goto('…?seed')`
  becomes a shared helper. These run in a fresh context, so the database is already
  empty and only the sticky flag needs clearing:
  ```ts
  await page.goto('songs');
  await page.evaluate(() => localStorage.removeItem('achordeon.seed'));
  await page.reload();
  ```
- `playwright.config.ts` — the `storageState` comment names `?seed` as how a test asks
  for content. Rewrite: the flag is now cleared by hand only.

## Known consequence

`mobile-layout.spec.ts` relies on the seeded titles being "some longer than a phone is
wide" — that is what makes the overflow test meaningful. Replacing the seed songs with
short-titled ones weakens that test without failing it.
