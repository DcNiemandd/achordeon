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

| # | Decision |
|---|---|
| Q1 | Proxy allowed under the bounds above. |
| Q2/Q9 | Song sites v1: **plnyzpevnik** only. Supermusic: paste only. Adapter seam in the function so a site can be added. |
| Q3 | The Import button opens an **Import dialog** that mirrors Download. Its rows: *Achordeon file* · *ChordPro / chord-sheet file* · *From a song site…*, and the last one opens its own dialog. A dropped file or an opened Share link skips the dialog and goes straight to the **Import preview**. |
| Q4 | **Export as ChordPro** is a third section of the Download dialog, under a hairline after the Achordeon file / Share link section. Glossary: Export = Achordeon file (lossless, canonical) or ChordPro file (lossy). |
| Q5 | Paste into the editor → the text lands as pasted → if it looks like a chord sheet, an inline bar offers *Convert / Keep as pasted*. Convert is **one** undo step, so Undo brings back the paste. Any further edit dismisses the bar. Detection runs only on paste. |
| Q6/Q8 | German is an **input dialect** (NOTATION-PLAN §4). Wherever text is converted, the user confirms *Chords written as: English / German (H, B = B♭)*, pre-set from a guess (an `H` or `mi` among the chords → German). German rewrites `B`→`Bb`, `Fis/Cis/Es/As…`→`F#/C#/Eb/Ab`, `mi`→`m`, and `H`→`B` (WORKER-CORE rule: content is always English, until NOTATION-PLAN §3 is settled). `notation` is **never** set from the source. |
| Q7 | A ChordPro file with `{new_song}`/`{ns}` becomes one Song per section, shown in the normal Import preview. Every one is new, because there is no id to match on. |
| Q12 | The Song keeps no source URL in v1. The site is named and linked in the preview only. |
| Q13 | ChordPro export: several songs go into one `.cho` with `{new_song}` between them. Title/Subtitle → `{title}`/`{subtitle}`. A block labelled like a chorus (`R`, `Ref`, `Chorus`, …) → `{start_of_chorus}…{end_of_chorus}`. Any other label → `{comment: label}`. `[[Am F]]` → `[Am] [F]`. Chords go out as written. |
| Q14 | Song site names and URLs live **only in the edge function**. The app knows a site by a number and gets its display name and link hint from the function. |
| Q15 | One input field. If it parses as an `http(s)` URL, the app fetches that song. Anything else runs a search. The function decides whether a URL is supported. An unsupported one shows "can't read that site" plus the hint list. |
| Q16 | Results are grouped by site, each in the site's own order, with duplicates not merged. A site that fails or times out (~5 s) shows a one-line notice in its group, and the other sites still show. |
| Q18 | The Song site dialog and the Song preview dialog **replace** each other, never stack. *Back* restores the input, results and scroll, with no new search. The state lives in a presenter owned by the flow. |
| Q19 | The Song preview shows our real render (unsaved), the English/German toggle (switching re-converts and re-renders on the spot), a version picker when the site has several versions, title · artist, and "from <site>" linking to the original. Nothing is editable there. |
| Q20 | *Import* creates one new Song (Name "Title – Artist", converted Content, no settings beyond the user's choices), closes both dialogs and opens the editor. No Import preview, no duplicate check. |
| Q21 | The song-site row is always shown. Offline it is disabled with a tooltip. Signed-out users can use it (anon key). |
| Q22 | Files: one *English / German* control at the top of the Import preview for the whole import. It only appears when the import holds converted files, and is pre-set to German if any file looks German. |
| Q23 | `.txt`/`.crd`/`.cho` decode as UTF-8, falling back to windows-1250. No encoding picker. |
| Q24 | ChordPro metadata on import: `{title}`→`*`, `{subtitle}`→`**`. With no subtitle, `{artist}`→`**`. Song Name "Title – Artist". `{key}`/`{capo}` → one plain line at the top. Everything else is dropped. On export: `{title}`/`{subtitle}` only. No new Song fields. |

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
- **song** `site + id` *or* `url` → `{ site, title, artist, versions?, text, format: chordpro | chord-sheet, url }`

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

*Done when:* the domain specs cover every row of Q8/Q13/Q24 and the detection
cases, and the `song-from-text` skill still produces the same output on its
fixtures.

### 2. Convert bar on paste

`song-editor.presenter.ts` gets paste handling: detect → bar → convert as one
transaction (Q5, Q8). Pin the behaviour in `song-editor.spec.ts` (red first).

*Done when:* paste → Convert → Undo restores the exact paste, a non-sheet paste
shows no bar, and the German toggle changes the result.

### 3. Import dialog + chord-sheet files

The Import button opens the Import dialog (Q3). The ChordPro row accepts
`.cho .chordpro .crd .txt` (Q23) and feeds the existing `ImportInbox` /
Import preview, with the English/German control (Q22) and multi-song files (Q7).
The song-site row is present but disabled until phase 6. Drag-drop of these file
types also works.

*Done when:* a multi-song `.cho` and a windows-1250 `.txt` import correctly from
both the songs and the songbooks pages.

### 4. Export as ChordPro

A third section in the Download dialog (Q4). It downloads one `.cho` for any
selection (Q13).

*Done when:* exporting a song and re-importing the `.cho` gives the same
Content, apart from the documented losses.

### 5. Song sites edge function

The function with the contract above and the plnyzpevnik adapter, which
reproduces the POC's RSC parsing. A shape test runs against a recorded
response, so CI never hits the real site.

*Done when:* `sites`, `search` and `song` work locally under
`supabase functions serve`, the rate limit trips, and an unsupported URL returns
the 4xx.

### 6. Song site dialog + Song preview dialog

The single input (Q15), grouped results (Q16), the preview with render, toggle,
versions and attribution (Q19), Back that keeps state (Q18), and Import → editor
(Q20). Offline handling (Q21).

*Done when:* a song can go from typing an artist name to editing it in the
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
