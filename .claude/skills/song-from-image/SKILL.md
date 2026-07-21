---
name: song-from-image
description: Transcribe a song (or a whole folder of songs) from images — photos or scans of chord sheets / lyrics-with-chords — into Achordeon markup, syntax-check it against the real parser, and hand it back as printed content, a text file, or an Achordeon import JSON (a single song, or a whole folder as one songbook). Use when the user gives a picture of a song, a screenshot of chords, a scan, or a folder of them.
---

# Song from image

Turn a picture of a song — or a folder full of them — into **Achordeon content
markup**, syntax-check it with the repo's actual parser, and hand it back the way
the user wants: printed in chat, a plain text file, or an **import JSON** they can
drop straight on Achordeon's Import button (optionally a whole folder wrapped into
one songbook named after the folder).

Achordeon content is the source text of a Song: lyrics + chords + title/subtitle,
using the markup below. Render **settings** (scale, columns, aspect ratio, colours)
are never encoded in that text — they live as structured metadata. This skill still
sets them, but in the **import JSON**, not in the content string (see step 5).

The full author-facing docs are `apps/docs/docs/songs/syntax.mdx`; the exact
implementer grammar is `docs/PARSER-GRAMMAR.md`. This skill is self-contained — you
do not need to read those to do the job, but they are the source of truth if a rule
here is ever unclear.

---

## Syntax reference (everything you need to write valid content)

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
- A **new block** starts after a blank line, or at any labelled line.
- A **label** is text at the start of a block ending in a **colon-run followed by a
  space or end-of-line**. The **last colon is the delimiter and is consumed**;
  earlier colons in the run stay as literal label text:
  - `1.: First verse` → label `1.`, content `First verse`
  - `R:: Chorus` → label `R:`, content `Chorus`
  - `1:::` → label `1::`, content empty (label-only block)
- A colon **not** followed by space/EOL is an ordinary character — `http://x`,
  `12:30` need no escaping.
- **Footgun:** `Narrator: hi` silently becomes a label `Narrator`. If it should be
  a lyric, escape the colon: `Narrator\: hi`.
- Content on the label line (`Verse: foo`) vs on the next line (`Verse:` then
  `foo`) both render, but differently (one line vs two). Keep whichever the image
  shows.

### Chords `[ ]`

- Chords go **inside the lyric, in square brackets, at the exact character** they
  sit above. The chord renders above the character **immediately after** the
  closing bracket: `tr[C]ade` puts `C` above the `a`.
- **Multiple chords in one bracket**, space- or comma-separated, all sit at the
  same spot: `[Em G Em A]`. A line whose text is empty but has chords is a
  **chord-only line**; a block made only of chord-only lines renders larger — the
  bridge convention.
- A **valid chord** = root + optional accidental + quality, optional `/bass`
  (e.g. `C`, `Am`, `F#m7`, `Gsus4`, `D/F#`). Valid chords are transposable.
- Bracket content that is **not** a valid chord — `[Solo]`, `[x2]`, `[N.C.]`,
  `[||: … :||]` — is still rendered **verbatim above the line** and is **never
  transposed**. This is intentional and correct; do not "fix" such brackets.
- **Notation:** English names, plus German **`H`** as an alias for B natural (`B`
  stays B natural, `H` is the other name for it). Both are accepted.
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
key, etc. Those are render settings, not content. If the image shows a capo or key
note, keep it as a plain lyric line or a verbatim bracket annotation, not a
directive.

---

## Workflow

Two modes, same steps:

- **One song** → one image (or a few images of the same song).
- **A folder of songs** → many images, each its own song, wrapped into **one
  songbook named after the folder** (see step 6).

### 1. Load the image(s)

Read each image with the Read tool (it accepts PNG/JPG). For folder mode, glob the
folder for image files and read them all. If no image is actually available, ask
for it (or whether the user would rather type/paste the song).

### 2. Read everything on the image — and get it right

**Transcribe all of it.** Chord sheets carry more than lyrics: a capo note, a key,
a tuning, repeat counts (`2×`), section markers, performance notes ("Sólo = Sloka",
"pomalu", "koda"), a `–` before a refrain line. **Usually all of it is needed** —
capture it, don't quietly drop the handwriting in the margin. Put such notes where
they belong: a section note becomes a **label** (`Sólo:`), an inline annotation
becomes a verbatim bracket (`[2×]`, `[N.C.]`), a standalone remark becomes its own
lyric line. Only genuinely omit a note if it is purely about the paper (a page
number, a hole-punch).

**Correct what is clearly wrong.** You are transcribing a song, not photographing a
typo. Fix obvious misspellings, missing diacritics (Czech/other), OCR-style
letter swaps, and broken words so the result reads as the song actually goes. Keep
deliberate stylings, dialect, and the songwriter's actual word choices. When a
correction is a judgement call (a possibly-wrong chord, an ambiguous word), make
the sensible fix **and tell the user** what you changed rather than guessing
silently. If a spot is truly unreadable, say so instead of inventing.

Extract, per song:

- **Title / author** → `* Title` / `** Author`.
- **Section labels** (Verse 1, Chorus, Bridge, "R:", numbers, "Sólo") → block
  labels (`Label:`).
- **Lyrics**, line by line, blocks separated by a blank line.
- **Chords**, and critically **which character each sits over**. Sheets print
  chords on a line _above_ the lyric; place each `[chord]` immediately **before the
  character under it**. Chord-only rows (intros, solos, turnarounds) become a
  bracket line like `[Em G D]`.

### 3. Produce the song content

Assemble the markup per the syntax above.

### 4. Syntax-check it

Run the checker. It parses the content with the **real Achordeon parser** (the same
grammar the app ships). **This is a _syntax_ check, not a chord check** — it
confirms the markup parses and reports the structure the parser saw; it does **not**
verify that the chords are musically correct or that they match the image. That
faithfulness is on you (step 2).

```bash
# from the repo root; a file, or content on stdin with -
node .claude/skills/song-from-image/scripts/validate.mjs path/to/song.txt
printf '%s' "$CONTENT" | node .claude/skills/song-from-image/scripts/validate.mjs -
```

Read the output:

- **Warnings** (e.g. `SHADOWED_TITLE`) → duplicated title/subtitle; fix unless
  intended.
- **Brackets that render verbatim** → the parser didn't recognise them as chords,
  so they render literally. Fine for `[N.C.]`, `[2×]`, repeat signs. If a real
  chord shows up here (e.g. `[Cmajj7]`), that's a **syntax** typo in the symbol —
  fix it. (This flags unrecognised _symbols_, not wrong-but-valid chords.)
- **No title** → add `* Title` unless intentionally omitted.

Fix real problems and re-run until clean (or every remaining flag is intentional).

### 5. Choose settings to match the original (for JSON output)

When you build an import JSON (step 6), set per-song **settings** so the render
resembles the source sheet. Set only what the image clearly shows; leave the rest
to defaults. Settings go in the JSON's `settings` object, never in the content
text. Song-scope settings and how to read them off an image:

| Setting         | Value                               | Read from the image                                                                                                                                                     |
| --------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `aspectRatio`   | `"A4"`, a number, `"3/4"`, `"16/9"` | the sheet's shape. Portrait page → `"A4"`; else width÷height of the content, e.g. a squat landscape scan → `"4/3"`.                                                     |
| `columns`       | `1`, `2`, …                         | how many columns the lyrics are laid out in.                                                                                                                            |
| `titlePosition` | `"top"` \| `"left"`                 | `"left"` only if the title runs up the side as a rotated spine; almost always `"top"`.                                                                                  |
| `titleLayout`   | `"stacked"` \| `"inline"`           | subtitle under the title (`stacked`) vs beside it (`inline`).                                                                                                           |
| `chordColor`    | `"#rrggbb"`                         | the **ink colour of the printed chords**, if distinct. Highlighter over black text ≠ chord colour — that's still black (`"#000000"`). Omit to keep the app default red. |
| `chordSize`     | number (`1` = default)              | chords notably larger/smaller than the app default relative to the lyrics.                                                                                              |
| `scale`         | `"auto"` or a number                | leave `"auto"` unless the user wants a fixed scale.                                                                                                                     |
| `padding`       | number (em)                         | leave default unless the sheet has an unusually wide/tight margin.                                                                                                      |

Only `aspectRatio` and `columns` are worth inferring on most sheets; the rest stay
default unless the image is clearly styled. Unknown/out-of-scope keys are dropped by
the builder with a warning, so a typo is loud.

### 6. Deliver

Follow what the user asked; if they didn't say, ask (default: print in chat).

- **Print in chat** → the final content in a fenced code block.
- **Text file** → write the raw content to a `.txt`. Content only, no JSON wrapper.
- **Import JSON (one or more songs)** → build a `manifest.json` and run the builder.
  The builder computes the derived cache with the real parser, generates
  ids/timestamps, stamps `schemaVersion`, and validates settings. The result is a
  `SnapshotEnvelope` the user drops on Achordeon's **Import** button.

  ```bash
  node .claude/skills/song-from-image/scripts/build-import.mjs manifest.json -o import.json
  ```

  Manifest for a single song:

  ```json
  {
    "songs": [
      {
        "name": "Vizovice",
        "content": "* Vizovice\n** Fleret\n\n[G]Když se s vínem [D]probouzí [G]den\n...",
        "settings": { "aspectRatio": "A4", "columns": 1 }
      }
    ]
  }
  ```

- **A whole folder as a songbook** → one manifest, a `songbook` key set to the
  **folder name**, and one entry in `songs[]` per image. The builder wraps them into
  a songbook (entries in manifest order) plus the songs themselves — importing the
  file adds the songbook _and_ its songs in one go.

  ```json
  {
    "songbook": "Fleret",
    "songs": [
      { "name": "Vizovice", "content": "* Vizovice\n...", "settings": { "aspectRatio": "A4" } },
      { "name": "Zafíráček", "content": "* Zafíráček\n...", "settings": { "aspectRatio": "A4" } }
    ]
  }
  ```

  (`"songbook"` may also be an object: `{ "name", "title", "subtitle", "author",
"settings" }` for songbook-scope overrides like `chordColor`/`chordSize`.)

  Write the manifest to a scratch file, run the builder, and give the user the
  resulting `import.json` (or its path). The builder prints a per-song summary to
  stderr — check it before handing over.

---

## Example

Input (a chord-sheet photo of the intro + first line):

```
* Wish You Were Here
** Pink Floyd

[Em G Em G Em A Em A G]

2.: And did they get you to [C]trade your heroes for[D] ghosts,
```

`validate.mjs` reports: Title `Wish You Were Here`, Subtitle `Pink Floyd`, 2 blocks
(one chord-only bridge block), no warnings. Wrapped in a manifest and run through
`build-import.mjs`, it becomes an import JSON carrying that one song, settings and
all.
