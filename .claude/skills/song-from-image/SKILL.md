---
name: song-from-image
description: Transcribe a song from an image (photo or scan of a chord sheet / lyrics-with-chords) into Achordeon markup, validate it against the real parser, then print it or save it to a file. Use when the user hands over a picture of a song, a screenshot of chords, or a scanned sheet and wants it as Achordeon song content.
---

# Song from image

Turn a picture of a song into **Achordeon content markup**, validate it with the
repo's actual parser, and hand it back the way the user wants (printed in chat, or
written to a file).

Achordeon content is the source text of a Song: lyrics + chords + title/subtitle,
using the markup below. Render settings (scale, columns, aspect ratio, colors) are
**never** part of this text — they live in GUI metadata. Only produce content.

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

### 1. Load the image

Read the image the user provided with the Read tool (it accepts PNG/JPG). If they
referenced a file path or pasted an image, read it. If no image is actually
available, ask for it (or ask whether they instead want to type/paste the song).

### 2. Find the lyrics and the chords

From the image, extract:

- **Title / author** if shown → `* Title` / `** Author`.
- **Section labels** (Verse 1, Chorus, Bridge, "R:", numbers) → block labels.
- **Lyrics**, line by line, preserving line breaks and blocks (blank line between
  sections).
- **Chords** and, critically, **which syllable/character each chord sits over**.
  Chord sheets print chords on a line _above_ the lyric; place each `[chord]` right
  **before the character it sits above** in the lyric line. Chord-only rows (intros,
  solos, turnarounds) become a bracket line like `[Em G D]`.

Be faithful to the source. Don't correct the songwriter's chords or spelling.
If the image is blurry or a spot is unreadable, transcribe what you can and flag
the uncertain spots to the user rather than guessing silently.

### 3. Produce the song content

Assemble the markup per the syntax above. Keep one song = one screen in mind, but
that's a render concern — your job is faithful, valid content.

### 4. Validate it

Run the bundled validator, which parses the content with the **real Achordeon
parser** (same grammar the app ships) and reports title/subtitle, block count,
warnings, and every bracket that will render verbatim:

```bash
# from the repo root; pass a file, or pipe content on stdin with -
node .claude/skills/song-from-image/scripts/validate.mjs path/to/song.txt
# or:
printf '%s' "$CONTENT" | node .claude/skills/song-from-image/scripts/validate.mjs -
```

Read the output:

- **Warnings** (e.g. `SHADOWED_TITLE`) → a duplicated title/subtitle; fix unless
  intended.
- **Brackets rendered verbatim** → confirm each is meant to be a non-chord
  annotation (`[N.C.]`, `[x2]`) and not a chord you mistyped (`[Cmaj7]` typo'd as
  `[Cmajj7]` would show up here).
- **No title** note → add `* Title` unless the user wants it omitted.

Fix any real problems and re-run until the report is clean (or every remaining flag
is intentional).

### 5. Deliver

Ask (or follow what the user already said) how they want it:

- **Print in chat** → show the final content in a fenced code block.
- **Save to a file** → write it where they ask; a plain `.txt` (or `.song`) holding
  the raw content is fine. This is song _content_, not the JSON export/`.svg`
  download — don't wrap it in JSON unless asked.

Default to printing in chat if they didn't say.

---

## Example

Input (a chord sheet photo of the intro + first line):

```
* Wish You Were Here
** Pink Floyd

[Em G Em G Em A Em A G]

2.: And did they get you to [C]trade your heroes for[D] ghosts,
```

`validate.mjs` on that reports: Title `Wish You Were Here`, Subtitle `Pink Floyd`,
2 blocks (one chord-only bridge block), all chords valid, no warnings.
