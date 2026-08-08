# Text worker — convert one file

You are converting **exactly one** text file holding a song into Achordeon content
markup. You do **not** know or care about the other files, the folder, the ordering,
or the final songbook — a parent orchestrator handles all of that.

The orchestrator gives you `SOURCE` (the one file to convert), `NAME` (the library
label — the file's name without extension, used verbatim) and `FRAGMENT_DIR` (a
scratch directory for the fragment).

**This file covers the intake only — steps 1 and 2.** For the grammar, the syntax
check, the settings rules and the output contract, read
**`.claude/skills/song-core/WORKER-CORE.md`** and follow its steps 3–5. Read it
before you start editing; the grammar has traps (the eaten delimiter colon above
all) that are cheaper to know than to debug.

## Never retype the song

The whole point of this intake is that the words already exist in a file, so nobody —
not you, not the user — has to type them again. Three rules follow, and they are not
negotiable:

- **No song content in your reply.** Ever. Report structure, not lines.
- **Let the script do the bulk conversion.** `merge-chordlines.mjs` handles chord
  placement, tab expansion, ChordPro directives and bracket escaping, exactly, in
  code.
- **Your own edits are surgical.** Title markers, label colons, escapes, a stray
  blank line. If you find yourself writing an `Edit` whose `old_string` is a whole
  verse, stop — you are doing the script's job by hand and doing it worse.

## 1. Copy the source, then work on the copy

**Never edit `SOURCE` in place.** It is the user's file, it is the only pristine
record of what they started with, and a half-converted source makes a re-run
meaningless. Copy it first, with the shell — a copy is a file operation, and the
content stays out of your context:

```bash
cp "$SOURCE" "$WORK"     # WORK = <source's folder>/<NAME>.achordeon.txt
```

`WORK` sits **beside the source**, named `<NAME>.achordeon.txt`. It is kept after
the run — it is the file the user checks and fixes — so it belongs next to their
song, not in a scratch directory.

## 2. Fold the chord rows in, mechanically

Run the merger on the copy:

```bash
node .claude/skills/song-core/scripts/merge-chordlines.mjs "$WORK" -o "$WORK"
```

It rewrites the file in place-ish (reads, then writes the same path) and prints a
summary that contains counts, line numbers and chord symbols — never a lyric. Read it:

- **Merged / bare rows / chords placed** — the shape of what happened. Zero merged
  on a file that plainly had chord rows means the rows weren't recognised; look at
  the file yourself before assuming the script is right.
- **Inline** — lines that already carried `[chords]` were left alone. A file that is
  all-inline (ChordPro, or already-Achordeon markup) is a legitimate near-passthrough:
  little to merge, the rest of the job is structure.
- **Clamped** — a chord that had to move to the nearest legal spot. A few are normal
  (a chord hanging past the end of a short line). Many suggest the file's alignment
  was mangled in copying; check those lines and say so in `notes`.
- **Left alone / ambiguous** — a one-letter token that is a chord in one reading and
  a word in the other. **Go look at those line numbers** and decide; the script
  refuses to guess on purpose. Whichever way you call it, put it in `notes`.
- **Directives** — ChordPro `{title}`/`{artist}` became `*`/`**`; block markers were
  dropped; anything else was left as text and named for you. If a left-over directive
  would render as a stray word, delete that one line.

Then read the file and finish the structure by hand — small edits only:

- **Blocks**: verses separated by a blank line, and only that. If the source used
  something else (a row of dashes, a `[Verse 2]` header), turn it into a blank line
  plus, where it names the section, a label.
- **Labels**: a section name at the start of a block, ending in a colon. Remember the
  delimiter colon is eaten, so a source's `Chorus:` is written `Chorus::` and a bare
  `Chorus` is written `Chorus:`. This is the most common mistake in the whole job.
- **Accidental labels**: a lyric line with a colon in it (`Narrator: hello`) silently
  becomes a label. Escape it: `Narrator\: hello`.
- **Junk**: a tab-site header, a "submitted by", a hit counter, an ASCII rule, a
  strumming grid, ASCII chord-voicing diagrams. Delete it. Keep anything about the
  _song_ — capo, key, tuning, "slowly", repeat counts. A page copied off a tab site
  can easily be more chrome than song; the song usually starts at the first section
  header, and everything above it is worth reading with a sharp eye.
- **`[Section]` headers → labels**, since tab sites bracket them: `[Verse 1]` becomes
  `Verse 1:`, `[Chorus]` becomes `Chorus:`. **Convert named sections only.** A
  chord row is also a bracket line starting with a letter — `[F Dm C]` — so a rule
  like "bracketed line at the start of a block is a header" turns the intro's chords
  into a label called `F Dm C` and loses all three. If you script this pass, match
  the section words (Intro, Verse, Pre-Chorus, Chorus, Bridge, Solo, Outro, Ending…),
  never "starts with a letter".
- **Keep a line of song info** if the source carries one — key, tempo, capo, tuning.
  Escape its colons (`Key\: F major`), or the first one turns the line into a label
  and eats the colon.

## 3. Title and subtitle, in this order

Stop at the first one that yields an answer:

1. **In the file.** Either `*` / `**` markers already there (leave them), or a header
   the source put at the top — `Wish You Were Here — Pink Floyd`, `Title:` / `Artist:`
   lines, a `{title}` the merger already converted. Turn it into markers and delete
   the original line.
2. **From the file name.** Same convention the image intake uses: strip a leading
   numeric prefix (`1.5. `), then split on `-` — `1.5. Vizovice - Fleret` gives
   title `Vizovice`, subtitle `Fleret`. No separator: the whole name is the title.
3. **Ask the user.** If neither yields anything, **ask** — name the file and ask what
   the song and the artist are. Do not invent an artist from the words, and do not
   quietly ship a song with no title.

If you are a subagent and cannot ask, return `clean: false` with a `notes` saying
which file needs a title, and let the orchestrator ask.

## Settings, for this intake

**Infer nothing.** A text file shows no layout — no columns, no fonts, no margins —
so there is nothing to read off it, and guessing would override the user's own
defaults. `WORKER-CORE.md`'s settings table is there for intakes that can see a
page; this one cannot.

The only settings you ever write are ones the orchestrator hands you because the
**user asked** — `notation` when they chose German spelling and this is a one-song
run, or a chord colour/size. Otherwise `"settings": {}`.

`notation` in particular is never inferred from the file. A sheet full of `H` chords
tells you what its writer preferred, not what this reader wants — and either way the
markup you write stays in English note names. Converting `H` → `B` and a German `B`
→ `Bb` is part of the conversion, not a setting.

## Fragment, for this intake

Follow `WORKER-CORE.md` step 5, with `contentFile` set to the **absolute** path of
`WORK`. Never inline the content. The builder reads the file itself, so the song goes
source → copy → import JSON without once passing through you.
