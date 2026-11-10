# Plan — Chord sheets in and out

**Status: planned, not started.** Grilled 2026-11-10 against the code and the
first assignment (2026-10-17, main checkout `plans/import-chord-sheets.md`).
Identifiers below are descriptions, not names; naming is yours. Terms follow
`CONTEXT.md`: **Import dialog**, **Import preview**, **Song site**, **Export**
(Achordeon file / ChordPro file).

## Why

Songs found elsewhere come in two shapes: ChordPro, or chords on their own row
above the lyrics. The app reads neither, and writes no format another chord app
can read. This plan adds both directions, plus fetching a single song from a
Song site.

**The legal line.** Fetching moves to our side for Song sites, but stays bounded:
one song per explicit user action, nothing cached or stored on the server, only
what the site's own search returns, an identifiable User-Agent, and the site
named and linked in the preview. A site that refuses automated reading is **not**
a Song site — supermusic is one (robots.txt blocks search; song pages sit behind a
proof-of-work JS challenge, `/js/smc.js`). Its songs come in by copy and paste
through the Convert bar, never through the proxy. Ultimate Guitar: never.
Recorded in `docs/adr/0019-song-sites-live-behind-the-proxy.md`.

## Decisions

| #     | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1    | Proxy allowed under the bounds above.                                                                                                                                                                                                                                                                                                                                                                                                   |
| Q2/Q9 | Song sites v1: **plnyzpevnik** only. Supermusic: paste only. Adapter seam in the function so a site can be added.                                                                                                                                                                                                                                                                                                                       |
| Q3    | The Import button opens an **Import dialog** that mirrors Download. Its rows: _Achordeon file_ · _ChordPro / chord-sheet file_ · _From a song site…_, and the last one opens its own dialog. A dropped file or an opened Share link skips the dialog and goes straight to the **Import preview**.                                                                                                                                       |
| Q4    | **Export as ChordPro** is a third section of the Download dialog, under a hairline after the Achordeon file / Share link section. Glossary: Export = Achordeon file (lossless, canonical) or ChordPro file (lossy).                                                                                                                                                                                                                     |
| Q5    | Paste into the editor → the text lands as pasted → if it looks like a chord sheet, a bar floating over the top of the text (no content shift) offers _Convert_ and a cross that keeps the paste as it is. Convert is **one** undo step, so Undo brings back the paste, and the bar goes away with it. Any further edit dismisses the bar. Detection runs only on paste.                                                                 |
| Q6/Q8 | **Content is always English; `notation` only spells the rendered page.** Conversion never asks for the dialect and never reads it from a setting: it is read off the sheet's own spelling (an `H` or `mi` among the chords → German) and German is rewritten `B`→`Bb`, `H`→`B`, `Fis/Cis/Es/As…`→`F#/C#/Eb/Ab`, `mi`→`m`. `notation` is **never** set from the source. (Revised 2026-11-10: the dialect toggle was dropped everywhere.) |
| Q7    | A ChordPro file with `{new_song}`/`{ns}` becomes one Song per section, shown in the normal Import preview. Every one is new, because there is no id to match on.                                                                                                                                                                                                                                                                        |
| Q12   | The Song keeps no source URL in v1. The site is named and linked in the preview only.                                                                                                                                                                                                                                                                                                                                                   |
| Q13   | ChordPro export: several songs go into one `.cho` with `{new_song}` between them. Title/Subtitle → `{title}`/`{subtitle}`. A block labelled like a chorus (`R`, `Ref`, `Chorus`, …) → `{start_of_chorus}…{end_of_chorus}`. Any other label → `{comment: label}`. `[[Am F]]` → `[Am] [F]`. Chords go out as written.                                                                                                                     |
| Q14   | Song site names and URLs live **only in the edge function**. The app knows a site by a number and gets its display name and link hint from the function.                                                                                                                                                                                                                                                                                |
| Q15   | One input field. If it parses as an `http(s)` URL, the app fetches that song. Anything else runs a search. The function decides whether a URL is supported. An unsupported one shows "can't read that site" plus the hint list.                                                                                                                                                                                                         |
| Q16   | Results are grouped by site, each in the site's own order, with duplicates not merged. A site that fails or times out (~5 s) shows a one-line notice in its group, and the other sites still show.                                                                                                                                                                                                                                      |
| Q18   | The Song site dialog and the Song preview dialog **replace** each other, never stack. _Back_ restores the input, results and scroll, with no new search. The state lives in a presenter owned by the flow.                                                                                                                                                                                                                              |
| Q19   | The Song preview shows our real render (unsaved), a version picker when the site has several versions, title · artist, and "from <site>" linking to the original. No dialect toggle (Q8). Nothing is editable there.                                                                                                                                                                                                                    |
| Q20   | _Import_ creates one new Song (Name "Title – Artist", converted Content, no settings beyond the user's choices), closes both dialogs and opens the editor. No Import preview, no duplicate check.                                                                                                                                                                                                                                       |
| Q21   | The song-site row is always shown. Offline it is disabled with a tooltip. Signed-out users can use it (anon key).                                                                                                                                                                                                                                                                                                                       |
| Q22   | Files: no dialect control (Q8); each file is read in the dialect its own spelling shows.                                                                                                                                                                                                                                                                                                                                                |
| Q23   | `.txt`/`.crd`/`.cho` decode as UTF-8, falling back to windows-1250. No encoding picker.                                                                                                                                                                                                                                                                                                                                                 |
| Q25   | A pasted multi-song ChordPro is converted into **one** Content, with all songs joined. Splitting into several Songs is what file import is for.                                                                                                                                                                                                                                                                                         |
| Q35   | An editor toolbar button converts the **selection** straight away, with no bar, always into English chords: the dialect is read off the text's own spelling (Q8), never from the song's `notation`. One undo step brings the original back.                                                                                                                                                                                             |
| Q36   | The button converts text the detector would not call a sheet (a single chord row) as chord rows: pressing it already says it is a sheet. Directives still make it ChordPro.                                                                                                                                                                                                                                                             |
| Q37   | With nothing selected, the button converts the whole song. Its tooltip says which: _Convert selection_ / _Convert song_.                                                                                                                                                                                                                                                                                                                |
| Q38   | Lucide's `replace` glyph, added to the set as `convert` (nothing in the set fitted; a wand would promise magic), and `Alt+K`, free and outside the browser's menu letters (ADR-0015). It is a toolbar group of its own, between the transpose group and the history group.                                                                                                                                                              |
| Q45   | A ChordPro export carries Achordeon's own metadata as `x_` directives (ChordPro leaves those to the app that wrote them), **one per setting**: `{x_achordeon_columns: 2}`, after `{title}`/`{subtitle}`. A string that would read back as something else is quoted (`"2"`); anything not a string is JSON.                                                                                                                              |
| Q46   | What travels: the Song **name** (`x_achordeon_name`) and its own render settings (overrides only). No id, so every ChordPro import is still a new Song and the Achordeon file stays the one canonical round trip.                                                                                                                                                                                                                       |
| Q47   | Glossary: a ChordPro file is Content, name and render settings; still lossy (no id, favourite, songbook membership).                                                                                                                                                                                                                                                                                                                    |
| Q48   | A paste or the Convert button converts Content only: `x_achordeon_*` lines are read into the draft, never into the text, and the song's settings are left alone. File import is where settings come in.                                                                                                                                                                                                                                 |
| Q49   | Settings from a file go through the same gate as a hand-written JSON file (ADR-0014): unknown keys raise the Import preview's existing warning, values are not filtered. Another app's `x_` directives are dropped and named.                                                                                                                                                                                                           |
| Q50   | The songbook download dialog offers ChordPro too, beside the Achordeon file and Link: the book's songs, in book order, each once.                                                                                                                                                                                                                                                                                                       |
| Q51   | A ChordPro file is named like an Achordeon file: `achordeon-<item>-<date>.cho`.                                                                                                                                                                                                                                                                                                                                                         |
| Q52   | Row text: **ChordPro file**, hint "Words and chords for other chord apps. Achordeon also reads back the settings. Songbooks and favourites stay behind."                                                                                                                                                                                                                                                                                |
| Q53   | A converted song sets its title lines (and the Key/Capo line) off from the words with a blank line, as songs are written — so a ChordPro export comes back as the Content it went out as.                                                                                                                                                                                                                                               |
| Q54   | The function is tested with `deno test` through an Nx project `song-sites` (`test` + `lint` targets). CI sets up Deno so `run-many -t test` covers it.                                                                                                                                                                                                                                                                                  |
| Q55   | Rate limit in its own table `song_sites_throttle` (salted IP hash and a timestamp, nothing about the song), as `feedback` does. Default 60 requests per IP per 10 minutes.                                                                                                                                                                                                                                                              |
| Q56   | One `POST` with a JSON body: `{ action: 'sites' }`, `{ action: 'search', q }`, `{ action: 'song', site, id }` or `{ action: 'song', url }`. `verify_jwt = true`. Errors are codes (`{ reason }`); the app owns the wording.                                                                                                                                                                                                             |
| Q57   | plnyzpevnik is site `1`, its song id opaque to the app. `song` returns the first variant as `text`; with several, `versions: [{ label, text }]` lists all, labelled by key/capo or "Version n". `format` is `chordpro`.                                                                                                                                                                                                                 |
| Q58   | User-Agent `Achordeon/1 (+<ACHORDEON_URL>; song import on a user's request)`. robots.txt of plnyzpevnik allows all (checked 2026-11-11).                                                                                                                                                                                                                                                                                                |
| Q24   | ChordPro metadata on import: `{title}`→`*`, `{subtitle}`→`**`. With no subtitle, `{artist}`→`**`. Song Name "Title – Artist". `{key}`/`{capo}` → one plain line at the top. Everything else is dropped. On export: `{title}`/`{subtitle}` only. No new Song fields.                                                                                                                                                                     |

## Detection — "looks like a chord sheet"

Used by the paste bar (Q5) and to choose the conversion for `.txt` files.

- **ChordPro**: any line that is a `{directive}` the converter knows.
- **Chord rows**: ≥ 2 lines made only of chord tokens (in either alphabet, plus
  bar marks like `|` and repeat marks), each followed by a non-chord line.
- Neither → it is not a chord sheet. A pasted plain text stays as it is with no
  bar, and a `.txt` file comes in as plain lyrics.

## Edge function contract

One new Supabase function, holding one adapter per Song site. The client sends
the anon key, the function applies a per-IP rate limit (as `feedback` does) and
stores nothing.

- **sites** → `[{ site: number, name, urlHint }]`
- **search** `q` → `[{ site, groupError?, results: [{ id, title, artist }] }]`, all sites at once
- **song** `site + id` _or_ `url` → `{ site, title, artist, versions?, text, format: chordpro | chord-sheet, url }`

The function never converts. All conversion happens in the client through the
domain function, the same one that handles paste and files.

## Phases

Tracer-bullet slices, each shippable and tested on its own.

### 1. Conversion in the domain

Port `.claude/skills/song-core/scripts/to-achordeon.mjs` and
`merge-chordlines.mjs` to TypeScript in `libs/shared/domain` as pure functions,
with their tests as spec files. Add the following to the same conversion:

- the detection rules above
- the German dialect (Q8), from the POC's `germanNote`/`englishChord` in `pocs/plnyzpevnik/poc.mjs`
- `{chorus: R: text}` references and labelled sections (POC `chordproToMarkup`)
- the metadata mapping (Q24)
- `{new_song}` splitting (Q7)

Add the reverse direction as well: Achordeon → ChordPro (Q13). The skill's
`_domain-core.mjs` then takes the conversion from the domain the way it already
takes `parse`, and the old `.mjs` scripts go away.

**Interface shape** (chosen 2026-11-10 out of four designs; naming is yours):

- **One convert function, used by every inbound caller**: paste bar, file
  import, Song site preview and the skill. It takes the foreign text, the
  injected theory and optional choices: dialect (omitted → use the guess),
  format (omitted → detect; the Song site passes its own), and a fallback title
  and artist (used only where the text has none). It returns one of two kinds:
  - **not a chord sheet**: the type forces every caller to handle this case.
  - **converted**: carries
    - the format found
    - the dialect applied
    - the guessed dialect (always present, for pre-setting a toggle)
    - the whole input as **one** Content (for paste and preview, Q25)
    - the **songs** split on `{new_song}` (for file import), each a **draft**
      (name + Content, no id, timestamps or cache) with its own report
- **A toggle flip calls the function again** with the chosen dialect. Nothing is
  cached and nothing is kept between calls.
- **The report** has counts, line numbers and directive names only. Its type has
  no field that can hold lyric text.
- **Reuse the existing `ChordNotation` type** (`chords.ts`) for the dialect. Do
  not add a second English/German type.
- **One export function**: drafts/Contents in, one `.cho` text out. It takes
  the theory and reads titles, labels and `[[ ]]` through the real `parse`
  (ADR-0005), never a second hand-written grammar.
- **Not chosen:** a public intermediate sheet model (it widens the contract and
  makes lyric text public), a registry of format plug-ins (only one format goes
  both ways), and a separate examine step (the single call already returns the
  guess).

_Done when:_ the domain specs cover every row of Q8/Q13/Q24 and the detection
cases, and the `song-from-text` skill still produces the same output on its
fixtures.

### 2. Convert bar on paste

`song-editor.presenter.ts` gets paste handling: detect → bar → convert as one
transaction (Q5, Q8). Pin the behaviour in `song-editor.spec.ts` (red first).

_Done when:_ paste → Convert → Undo restores the exact paste, a non-sheet paste
shows no bar, and the German toggle changes the result.

### 2b. Convert button (selection or song)

A toolbar button converts the selection, or the whole song, always into English
chords (Q35–Q38). The editor applies a text transform to the selection as one
undo step and knows nothing about chord sheets (ADR-0010). The page supplies the
conversion.

_Done when:_ selected German chord rows turn into English brackets on one click, one Ctrl+Z restores them, and the button acts on the
whole song with nothing selected.

The same group holds a second button, **German chords → English** (Q40–Q41):
it respells only the chords in the selection or song (`H`→`B`, `B`→`Bb`,
`Fis`→`F#`, `mi`→`m`), with the converter's own German table, one undo step,
always enabled. Lucide's `languages` icon, `Alt+G`.

### 3. Import dialog + chord-sheet files

The Import button opens the Import dialog (Q3). The ChordPro row accepts
`.cho .chordpro .crd .txt` (Q23) and feeds the existing `ImportInbox` /
Import preview, with the English/German control (Q22) and multi-song files (Q7).
The song-site row is present but disabled until phase 6. Drag-drop of these file
types also works.

_Done when:_ a multi-song `.cho` and a windows-1250 `.txt` import correctly from
both the songs and the songbooks pages.

### 4. Export as ChordPro

A third section in the Download dialog (Q4). It downloads one `.cho` for any
selection (Q13).

_Done when:_ exporting a song and re-importing the `.cho` gives the same
Content, apart from the documented losses.

### 5. Song sites edge function

The function with the contract above and the plnyzpevnik adapter, which
reproduces the POC's RSC parsing. A shape test runs against a recorded
response, so CI never hits the real site.

_Done when:_ `sites`, `search` and `song` work locally under
`supabase functions serve`, the rate limit trips, and an unsupported URL returns
the 4xx.

### 6. Song site dialog + Song preview dialog

The single input (Q15), grouped results (Q16), the preview with render, toggle,
versions and attribution (Q19), Back that keeps state (Q18), and Import → editor
(Q20). Offline handling (Q21).

_Done when:_ a song can go from typing an artist name to editing it in the
editor, and Back keeps the results list.

### 7. Docs

Update `apps/docs/docs/export-import.mdx` (Import dialog, ChordPro files,
ChordPro export, Song sites, pasting from supermusic) and `guides/ai-import.mdx`
where the skill's role changes, in both `en` and `cs`. Check with
`pnpm nx build docs`.

## Out of scope

- Song metadata fields (artist, key, capo…): that is a schema change (ADR-0007)
  and a feature of its own.
- Settling NOTATION-PLAN §3. Conversion follows the current rule and changes
  with it.
- Any Song site that blocks automated reading, and any bulk fetch.
