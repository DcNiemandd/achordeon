# Achordeon markup

Everything a song is made of. Rules once, examples over prose, and an explicit
list of what is **not** valid.

A song is one string. Newlines are significant. Nothing else about the file is.

---

## Chords

A chord goes in square brackets **immediately before the character it sits over**.

```achordeon
And the [G]trees are sweetly [D]blooming
```

`G` prints above the `t` of `trees`. There is no space between the bracket and
the character — a space would put the chord over the space.

- **Several chords at one spot** share a bracket: `[Am G]`, separated by spaces.
- **A bracket at the end of a line** hangs past the last word: `the [C]end[G]`.
- **A bracket that is not a chord is kept and printed verbatim, never
  transposed.** This is how annotations are written:

```achordeon
Round and round we [Am]go [x2]
[N.C.]Silence, then the [C]band comes back
```

- **A line of brackets with no words** is a chord row — an intro, a solo, a
  turnaround. It prints in the line, at lyric size:

```achordeon
[Am] [C] [G] [G]
```

- **German `H`** is B natural, and is understood. How a chord is _printed_ is the
  reader's `notation` setting, not something the source decides.
- Chords never nest. Inside `[…]`, everything up to the first unescaped `]` is
  chord text.

---

## Title and subtitle

`*` and `**` at **column 0**, marker then **one space**, then the text.

```achordeon
* Wild Mountain Thyme
** Traditional
```

- The rest of the line is plain print text: no chords, no label, no escapes.
- **Last one wins.** Two `*` lines means the second is the title and the first is
  reported as a problem — so write each exactly once.
- `*bold*` and `*x` are not titles: the space after the marker is what makes one.

---

## Blocks

A **blank line** separates blocks. Consecutive blank lines count as one. That is
the only way to start a new block.

```achordeon
* Song

First verse, first line
First verse, second line

Second verse
```

---

## Labels

A label is text at the start of a line followed by a colon and **a space or the
end of the line**.

```achordeon
Verse 1: Oh the summer time is coming
R: And we'll all go together
```

- A label on the line that **opens** a block names the whole block.
- A label further into an open block annotates **that line only** — which is how
  an instrument or a voice is marked:

```achordeon
Intro:
Guitar: [Am] [C]
Bass: [Am] [G]
```

- **A colon not followed by a space or end of line is not a label**, so `12:30`
  and `http://x` are ordinary lyrics and need no escaping.
- Label text is plain: no chords, no escapes.
- **The colon is consumed.** To print `R:` as the label, write `R::`.

---

## Emphasis

`*italic*`, `**bold**`, in lyric lines only.

```achordeon
He sang it [C]*quietly*, then **all at once**
```

An asterisk with nothing to match it prints as itself, so a stray `*` is safe.

---

## Escapes

A backslash before `[` `]` `:` `*` `\` or a space makes that character literal and
is consumed.

```achordeon
The chord is written \[C\] in the source
Narrator\: not a label
```

A backslash before anything else is a literal backslash, so `C:\path` is fine as
written.

---

## Not valid here

None of these is Achordeon markup. Convert before writing.

- **ChordPro directives** — `{title: …}`, `{artist: …}`, `{start_of_chorus}`,
  `{soc}`, `{comment: …}`. Use `*` / `**` and blank lines.
- **A row of chords above the words**, aligned by spaces:

  ```
  Am        F
  Some words of a song
  ```

  Fold it into brackets: `[Am]Some words[F] of a song`. Count the printed
  columns; do not guess. `merge-chordlines.mjs` does this exactly — use it rather
  than doing the arithmetic yourself.

- **Markdown headings** (`# Title`), lists, tables, links, images.
- **HTML** of any kind.
- **Tablature** — it is not a lyric, and a chord spliced into it turns a readable
  diagram into rubble. Leave tab lines out.
- **Nested brackets**: `[C[m]]`.
- A chord **after** the character it belongs over.

---

## The file an import reads

One JSON object. {{SCHEMA_LOCATION}}

```json
{
  "app": "{{ACHORDEON_URL}}",
  "schemaVersion": {{SCHEMA_VERSION}},
  "data": {
    "songs": [
      {
        "id": "9f6b2c14-3d5e-4a71-9c08-1b2e5d7a4f36",
        "name": "Wild Mountain Thyme",
        "content": "* Wild Mountain Thyme\n** Traditional\n\nOh the [G]summer time is [C]coming"
      }
    ],
    "songbooks": []
  }
}
```

Required: `schemaVersion`, `data`, and per song `name` and `content`. Everything
else Achordeon writes for itself — leave it out.

- **`name`** is the library label, what the song is called in the list.
  **`content`** carries the printed title. They are usually the same and do not
  have to be.
- **`id`**: mint a **fresh** uuid per song. Never reuse the RFC 4122 example
  `123e4567-e89b-12d3-a456-426614174000` — a second song carrying it claims the
  first one's identity, and the import offers to replace it. Keep the same id
  across versions of the _same_ song, and a re-import replaces rather than
  duplicates.
- **`songbooks[].entries`** are song ids in order. The order _is_ the book.
- **`data.user`** does not exist here. Never write it.

### Settings

`settings` on a song or a songbook is sparse — write only the keys you mean, or
leave it out. Anything absent falls back to the songbook's value and then to the
library's.

Song-scope keys: {{SONG_SETTING_KEYS}}

Songbook-scope keys: {{SONGBOOK_SETTING_KEYS}}

---

## Handing the file over

Two ways, and the file is the same either way.

- **Write it to disk** and tell the person to open it in Achordeon — the file
  picker, or dropped anywhere on the page.
- **A link.** Append a fragment to `{{ACHORDEON_URL}}`:

  ```
  {{ACHORDEON_URL}}#j1=<encodeURIComponent(JSON.stringify(file))>
  ```

  Tapping it opens the import preview, already filled in. Nothing is uploaded —
  the song travels inside the link.

  Keep the whole URL under about {{SHARE_LINK_MAX_URL}} characters. Longer than
  that and it will be cut short somewhere on the way and arrive unreadable; write
  a file instead. `build-import.mjs --link` builds a compressed link, which fits
  roughly twice as much.
