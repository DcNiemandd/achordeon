# Song worker core — the parts every intake shares

You are turning **one song** into **Achordeon content markup**, syntax-checking it
against the real parser, and writing it out as a per-song fragment. This file holds
everything that is the same no matter where the song came from: the grammar, the
check, the settings rules, and the output contract.

**It does not tell you how to read your source.** That is your skill's own intake
step (`image-worker.md`, `text-worker.md`, …), which you were sent here from. Do the
intake first, come back here for steps 3–5.

The orchestrator always gives you:

- `NAME` — the library label for this song (the source file's name without
  extension, e.g. `1.5. Vizovice - Fleret`). Use it verbatim; do not derive your own.
- `FRAGMENT_DIR` — a scratch directory to write your fragment into.

At the end you write **one fragment file** and **return one small JSON blob**. You
never write the shared songbook file.

## The lyrics never leave the file

**Song content — lyrics, in whole or in part — must never appear in your reply, in
your progress notes, or in any chat output.** It goes from the source into a file
and stays there. What you report is _about_ the song: title, subtitle, block count,
labels, chord count, corrections, warnings. Never a line of it.

This is not a stylistic preference. Reproducing lyrics is a copyright problem, and
an answer that trips it gets cut off mid-way — which usually means the import JSON,
the thing actually wanted, never arrives at all. Keep the content in the file and
the run finishes.

Practical consequences:

- Prefer file→file tools over retyping. A script that rewrites a file is always
  better than you emitting the rewritten lines.
- When you must edit, edit **surgically**: title markers, label colons, escapes. An
  `Edit` whose `old_string`/`new_string` is a whole verse is the wrong edit.
- Never echo a lyric back "to confirm". Report the structure the validator saw.

---

## Syntax reference (everything you need to write valid content)

Achordeon content is the source text of a Song: lyrics + chords + title/subtitle.
Render **settings** (scale, columns, aspect ratio, colours) are never encoded in
that text — they live as structured metadata in the import JSON. The full
author-facing docs are `apps/docs/docs/songs/syntax.mdx`; the exact implementer
grammar is `docs/PARSER-GRAMMAR.md`. You do not need to read those to do the job.

### Title `*` and Subtitle `**`

- `* Some Title` → the printed **Title** (usually the song name).
- `** Some Author` → the printed **Subtitle** (usually the author).
- Marker must be at **column 0 and followed by a space**. `*bold*` or `*x` (no
  space) is NOT a title — it falls through to a lyric.
- The whole rest of the line is plain text: no chords, no colons-as-labels, no
  escapes inside a title/subtitle. `* Live: [Acoustic]` prints literally.
- **Last one wins.** If several `*` lines exist, the last is effective and the
  earlier ones become warnings. Same for `**`. An empty `* ` sets nothing.

### Blocks and Labels

- A Song is a sequence of **blocks** (verse, chorus, bridge…).
- A **new block** starts after a blank line — and only there.
- A **label** is text at the start of a block ending in a **colon-run followed by a
  space or end-of-line**. The **last colon is the delimiter and is consumed**;
  earlier colons in the run stay as literal label text:
  - `1.: First verse` → label `1.`, content `First verse`
  - `R:: Chorus` → label `R:`, content `Chorus`
  - `1:::` → label `1::`, content empty (label-only block)
- **The delimiter colon is eaten — it is never printed.** A label renders as its
  label text alone, so to put a colon on the page you write **one more colon than
  the source shows**. Mirror the source exactly:
  - source shows `R:` → write `R:: …` → prints `R:`
  - source shows `1.:` → write `1.:: …` → prints `1.:`
  - source shows `Sólo` (no colon) → write `Sólo: …` → prints `Sólo`
  - source shows `Intro:` with the chords on the next row → write `Intro::`

  Writing `R: …` for a source's `R:` silently loses the colon. This is the single
  most common slip — check it in step 3, where the syntax check prints every label
  as it will render.

- A colon **not** followed by space/EOL is an ordinary character — `http://x`,
  `12:30` need no escaping.
- **Footgun:** `Narrator: hi` silently becomes a label `Narrator`. If it should be
  a lyric, escape the colon: `Narrator\: hi`.
- Content on the label line (`Verse: foo`) vs on the next line (`Verse:` then
  `foo`) both render, but differently (one line vs two). Keep whichever the source
  shows.
- A labelled line **inside** a block is a **sub-label** — it names that one line,
  not the block, and renders italic at the line's start. This is how a row of
  chords gets an annotation:

  ```
  Intro::
  Kl. + Bas:: [Am F G Am (2×)]
  Housle:: [Am F G Am (4×)]
  ```

  (Doubled because that source prints `Intro:`, `Kl. + Bas:`, `Housle:` — same
  eaten-delimiter rule; sub-labels are no exception.)

  Only the line that **opens** the block can name the block, so every later label
  in it is a sub-label.

### Chords `[ ]`

- Chords go **inside the lyric, in square brackets, at the exact character** they
  sit above. The chord renders above the character **immediately after** the
  closing bracket: `tr[C]ade` puts `C` above the `a`.
- **Multiple chords in one bracket**, space- or comma-separated, all sit at the
  same spot: `[Em G Em A]`. A line whose text is empty but has chords renders them
  **in** the line, at the size of the lyrics — the intro/solo/bridge look.
- **Doubled brackets** `[[C]]` put a chord in the line instead of above it. Only
  needed on a line that also has words; on a line of chords alone the single
  brackets already render in the line.
- A **valid chord** = root + optional accidental + quality, optional `/bass`
  (e.g. `C`, `Am`, `F#m7`, `Gsus4`, `D/F#`). Valid chords are transposable.
- Bracket content that is **not** a valid chord — `[Solo]`, `[x2]`, `[N.C.]`,
  `[||: … :||]` — is still rendered **verbatim above the line** and is **never
  transposed**. This is intentional and correct; do not "fix" such brackets.
- **Notation — the content is always English. Always.** This is not a preference
  and it is not the user's choice; German output is a **setting**, not a spelling
  in the text (see below).

  So whatever the source uses, write English into the markup: `H` → `B`, a German
  `B` (meaning B♭) → `Bb`, solfège → letters.

  The two rules that make this non-negotiable:
  - **Reading ignores the setting.** The parser rewrites a leading `H` to `B`
    unconditionally, whatever `notation` says. Leaving `H` in the text therefore
    buys nothing — it does not produce German output, it is just the same note
    spelled in a way the file did not need.
  - **A bare `B` in the source is B natural for everyone.** German prints B♭ as a
    bare `B`, which is fine on paper because nothing reads paper back. Write that
    printed spelling into the text and the next parse reads it as B natural —
    every B♭ silently moves up a semitone, on every device. `Bb` in the text,
    `B` on the page, and only the setting decides the page.

- **German on the page is `notation: "german"`** in settings — see the table in
  step 4. It re-spells the rendered chords (B natural prints as `H`, B♭ prints as
  `B`) and touches the source not at all. The orchestrator asks the user which
  spelling they want and passes the answer down; you never infer it from the source.
- To print a **literal `[`** in a lyric, escape it: `\[`.

### Escapes `\`

- `\` before `:` `*` `[` `]` `\` or space → the char is literal (backslash
  consumed). Main uses: `\:` to keep a colon from becoming a label, `\*` for a
  literal leading asterisk, `\[` for a literal bracket.
- `\\` → one literal backslash. `\` before anything else stays a literal backslash
  (`C:\path` keeps `\p`).
- Leading whitespace on a lyric line is stripped; to force a real leading space use
  `\ `.

### Not in the text

Do **not** invent directives for transpose, columns, scale, colors, capo, tempo,
key, etc. Those are render settings, not content. If the source shows a capo or key
note, keep it as a plain lyric line or a verbatim bracket annotation, not a
directive.

---

## 3. Syntax-check it

Run the checker. It parses the content with the **real Achordeon parser**. **This
is a _syntax_ check, not a chord check** — it confirms the markup parses and reports
the structure the parser saw; it does **not** verify the chords are musically
correct or that they match the source. That faithfulness is on you (your intake
step).

```bash
node .claude/skills/song-core/scripts/validate.mjs "path/to/song.txt"
```

Point it at the **file**, not at content piped from your own output — same reason as
above. Read the output:

- **Warnings** (e.g. `SHADOWED_TITLE`) → duplicated title/subtitle; fix unless
  intended.
- **Brackets that render verbatim** → the parser didn't recognise them as chords,
  so they render literally. Fine for `[N.C.]`, `[2×]`, repeat signs. If a real
  chord shows up here (e.g. `[Cmajj7]`), that's a **syntax** typo in the symbol —
  fix it. (This flags unrecognised _symbols_, not wrong-but-valid chords.)
- **Labels, exactly as they will print** → compare against what the source shows.
  A source's `R:` surfacing here as a bare `R` means you lost the delimiter colon.
- **No title** → add `* Title` unless intentionally omitted.

Fix real problems and re-run until clean (or every remaining flag is intentional).
Track whether you reached a clean parse — you report it as `clean` below.

## 4. Choose settings

Set only what the source **plainly shows**, and leave the rest to the user's
defaults. These go in your fragment's `settings` object, never in the content text.
Intake steps say which of these are readable from their source at all — a plain text
file, for instance, shows no layout, so it sets none of them.

| Setting         | Value                     | Set it when                                                                                                                                                                                                                                                                               |
| --------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `columns`       | `1`, `2`, …               | the lyrics are visibly laid out in more than one column.                                                                                                                                                                                                                                  |
| `titlePosition` | `"top"` \| `"left"`       | `"left"` only if the title runs up the side as a rotated spine; almost always `"top"`.                                                                                                                                                                                                    |
| `titleLayout`   | `"stacked"` \| `"inline"` | subtitle under the title (`stacked`) vs beside it (`inline`).                                                                                                                                                                                                                             |
| `chordColor`    | `"#rrggbb"`               | **Never infer this from the source.** Chord ink stays the app default — a scan being red, black, or highlighted is irrelevant. Only ever set it if the **user explicitly asks** (the orchestrator will tell you if so).                                                                   |
| `chordSize`     | number (`1` = default)    | chords notably larger/smaller than the app default relative to the lyrics.                                                                                                                                                                                                                |
| `notation`      | `"english"` \| `"german"` | **only as the orchestrator tells you** — it asked the user. Never read it off the source: a sheet printed with `H` says what its writer preferred, not what this reader wants. Omit for English (the default). Song scope; for a folder the orchestrator sets it on the songbook instead. |
| `scale`         | `"auto"` or a number      | leave `"auto"` unless the user wants a fixed scale.                                                                                                                                                                                                                                       |
| `padding`       | number (em)               | leave default unless the source has an unusually wide/tight margin.                                                                                                                                                                                                                       |

**Never set `aspectRatio`.** It is absent from the table on purpose. The shape you
can read off a scan is the paper's, and the song will be read off a screen. Song is
the _only_ scope this setting can be overridden at (`scopes: ['song']`), so a value
inferred from a source document outranks the user's own global one permanently — a
portrait scan pins the song to a portrait page and pads the rest of the screen with
white. Leaving it out lets the user's global setting decide.

## 5. Write the fragment, return the metadata

**Write** one file to `FRAGMENT_DIR`, named `<NAME>.song.json` (use the Write tool
so spaces in `NAME` don't bite you). Its contents are exactly one song entry, and it
points at the markup rather than carrying it:

- **`contentFile`** — an **absolute** path to the file holding the markup. **Always
  use this.** The builder reads it off disk, so the song passes through you at most
  once, when it is first written.
- **`content`** — the markup inline, as a JSON string. Supported by the builder, but
  writing it means emitting the whole song in your own output. Don't, not even to
  "make the fragment self-contained": if you have the markup in a file, reference the
  file.

```json
{
  "name": "1.5. Vizovice - Fleret",
  "contentFile": "C:/songs/Fleret/1.5. Vizovice - Fleret.achordeon.txt",
  "settings": { "columns": 1 }
}
```

`name` is the `NAME` you were given, verbatim.

### Output contract

**Return — as your entire final message — only this JSON blob and nothing else.**
No song content, not one line of it; it lives in the file. The orchestrator reads
this to order the songbook and build the result table without ever loading content
into its context:

```json
{
  "name": "1.5. Vizovice - Fleret",
  "title": "Vizovice",
  "subtitle": "Fleret",
  "fragment": "<FRAGMENT_DIR>/1.5. Vizovice - Fleret.song.json",
  "clean": true,
  "notes": "corrected a misspelt author; kept [2×] verbatim; 2-column layout"
}
```

- `title` / `subtitle` — the effective `*` / `**` the parser saw; use `null` when
  the song has none.
- `clean` — `true` if the syntax check is clean (or all remaining flags are
  intentional), `false` if you had to hand over something that still warns; put the
  reason in `notes`.
- `notes` — terse shorthand of the judgement calls (corrections, kept/dropped
  margin notes, uncertain chords, inferred layout); `""` if there were none. Be
  specific enough that the orchestrator can surface it to the user — and short
  enough that it is a description, never a quotation.

If the source can't be read at all, still return the blob with `clean: false`, no
`fragment`, and a `notes` explaining why — the orchestrator will report the miss and
the source will simply be retried on the next run.
