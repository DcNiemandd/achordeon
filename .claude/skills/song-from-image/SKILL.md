---
name: song-from-image
description: Transcribe a song (or a whole folder of songs) from images — photos or scans of chord sheets / lyrics-with-chords — into Achordeon markup, syntax-check it against the real parser, and hand it back as printed content, a text file, or an Achordeon import JSON (a single song, or a whole folder as one songbook). A folder of songs is processed in parallel, one subagent per image. Use when the user gives a picture of a song, a screenshot of chords, a scan, or a folder of them.
---

# Song from image

Turn a picture of a song — or a folder full of them — into **Achordeon content
markup**, syntax-check it with the repo's actual parser, and hand it back the way
the user wants: printed in chat, a plain text file, or an **import JSON** they can
drop straight on Achordeon's Import button (optionally a whole folder wrapped into
one songbook named after the folder).

This file is the **orchestrator**. The actual image→markup transcription lives in
`song-worker.md`, a self-contained brief. For a folder you dispatch **one subagent
per image**, each running `song-worker.md` on its one image in an isolated context;
you then stitch their outputs into a single import JSON. For a single song you just
follow `song-worker.md` yourself — no subagent needed.

Achordeon content is the source text of a Song: lyrics + chords + title/subtitle.
Render **settings** (scale, columns, aspect ratio, colours) are never encoded in
that text — they live as structured metadata in the import JSON. The full
author-facing docs are `apps/docs/docs/songs/syntax.mdx`; the exact implementer
grammar is `docs/PARSER-GRAMMAR.md`. You do not need to read those to do the job.

---

## Which path

- **One song** (one image, or a few images of the *same* song) → **inline, no
  subagent.** Follow `song-worker.md` yourself, then deliver (steps 5–6 below).
  Spawning a subagent for a single song is pure overhead.
- **A folder of songs** (many images, each its own song) → **subagent per image.**
  Run steps 1–6 below. This is where the parallelism and the flat token cost come
  from: each image's transcription, validation, and fix loop happen in a subagent
  context that is thrown away, and only a tiny metadata blob comes back.

---

## 1. Take stock of the folder (no transcription yet)

Glob the folder for image files. The import file lives **inside the image folder
from the start**, named after it — **`<image-folder>/<Folder>.json`** (step 6) —
that is where you both look for it and write it.

Work out which images are **new** before spawning anything:

- If `<Folder>.json` already exists, read it and collect the song `name`s already
  present (each `name` is a source image's file name without extension).
- **Skip every image whose basename is already in that file — do not spawn a worker
  for it, do not even read it.** The builder keeps those songs untouched (step 6).
- If every image is already present, there is nothing to do — say so and stop.

You only dispatch workers for the **new** images.

## 2. Decide the order (orchestrator only — workers don't touch this)

The songbook plays back in `songs[]` array order. Work out the intended sequence
now, from cheap signals, without reading any song's content:

- **From the file names** — scans are usually numbered (`1.1.`, `1.2.`, … `2.4.`);
  sort by that prefix. Absent numbering, fall back to the folder's natural sort.
- **From a summary image** — if the user includes an index / table-of-contents page
  (a photographed contents list), read *that one image* here in the orchestrator,
  and let its order override the file-name sort. You'll match its listed titles to
  workers by the `title` each worker returns (step 4).

Hold the order as a list of `name`s. You'll feed it to the assembler in step 5.

## 3. Dispatch one subagent per new image

Launch the new images **in parallel**, one subagent each. If there are many, send
them in waves (~4 at a time) — the design is wave-safe because every worker is
fully independent and writes a distinct fragment file.

Give each subagent this brief:

> Read and follow `.claude/skills/song-from-image/song-worker.md`. Transcribe the
> single image at `IMAGE`, using `NAME` as the song's library label, and write your
> fragment into `FRAGMENT_DIR`. Return only the JSON blob the worker brief
> specifies — do not return the song content.

with these values filled in per image:

- `IMAGE` = the image's path.
- `NAME` = the image's file name **without extension** (e.g. `1.5. Vizovice -
  Fleret`). This is the library label and the merge key; pass it verbatim.
- `FRAGMENT_DIR` = one shared scratch dir for this run (e.g. a `mktemp -d`). Every
  worker writes into it; each writes a *distinct* `<NAME>.song.json`, so there is
  no collision.
- If (and only if) the user explicitly asked for a chord colour/size, pass that
  through so the worker can set it.

**Do not let workers write `<Folder>.json`.** They write only their own fragment.
The single merge is yours alone (step 6) — this is what keeps the write race from
happening.

## 4. Collect the returns

Each worker returns a small JSON blob: `{ name, title, subtitle, fragment, clean,
notes }`. Collect them. These blobs are all you hold in context — never the song
content. From them you have everything for ordering (step 2's title-matching), the
final build (step 6), and the result table (step 7).

Handle misses gracefully: a worker with `clean: false` or no `fragment` is a
partial/failed image. Note it, keep going with the rest, and tell the user at the
end. Because failed songs never make it into `<Folder>.json`, the dedupe in step 1
will naturally retry exactly those images on the next run.

## 5. Assemble the manifest **in code**, not by reading fragments

This is the step that keeps the whole thing cheap. **Do not Read the fragment files
into your own context to build the manifest** — that would pull every song's
content back into the orchestrator and rebuild the very cost you sharded to avoid.
Instead, hand the fragment directory and your order list to the assembler, which
stitches them into a manifest without any content passing through the model:

```bash
# order.txt = your step-2 order, one NAME per line
printf '%s\n' "${ORDER[@]}" > order.txt
node .claude/skills/song-from-image/scripts/assemble-manifest.mjs \
  "$FRAGMENT_DIR" --order order.txt --songbook "<Folder>" -o manifest.json
```

The assembler emits a manifest whose `songs[]` are in your order, each carrying the
`{name, content, settings}` the worker wrote. (Omit `--songbook` for a plain
multi-song import with no songbook wrapper.)

## 6. Build the import file (folder as songbook)

Run the real builder on the assembled manifest. It computes the derived cache with
the actual parser, generates ids/timestamps, stamps `schemaVersion`, validates
settings, and — crucially — **merges incrementally** into the existing
`<Folder>.json`: it keeps the songs already there, adds only the newly-read ones
(matched by `name`; a same-named song is replaced), reuses the songbook's id, and
re-orders by file name. So the manifest need only carry the images you newly read.

```bash
node .claude/skills/song-from-image/scripts/build-import.mjs manifest.json \
  -o "path/to/Fleret/Fleret.json"
```

Write the output **into the image folder**, named after it, so it sits next to the
images from the first run onward. The builder prints a per-song summary to stderr —
and, when it merged, how many songs it kept vs. added — check it before handing
over. Give the user that `<Folder>.json` path.

(A _fresh_ build keeps manifest order, honouring a summary-image sequence; an
incremental merge orders by file name. `--songbook` may instead be given as an
object in the manifest — `{ "name", "title", "subtitle", "author", "settings" }` —
for songbook-scope overrides like `chordColor`/`chordSize`; set that on the
manifest before building if the user asked for it.)

### Other delivery modes (single-song / inline path)

When you followed `song-worker.md` yourself for a single song, deliver as the user
asked (default: print in chat):

- **Print in chat** → the final content in a fenced code block.
- **Text file** → write the raw content to a `.txt`. Content only, no JSON wrapper.
- **Import JSON (one song)** → make a one-entry `manifest.json`
  (`{ "songs": [ { "name", "content", "settings" } ] }`, `name` falling back to the
  title when the song was typed/pasted rather than read from a file) and run
  `build-import.mjs` on it as above.

## 7. Report a result table

However you delivered, **end every run with a summary table**, built from the
returned blobs (never by re-reading content). One row per song, in songbook order:

| File                          | Title    | Subtitle  | Notes                                   |
| ----------------------------- | -------- | --------- | --------------------------------------- |
| `1.5. Vizovice - Fleret.jpg`  | Vizovice | Fleret    | —                                       |
| `2.0. Anděl - Precendens.jpg` | Anděl    | Precedens | 2-column layout; `Precedens` (typo fix) |

- **File** is the source image's file name (with extension).
- **Title** / **Subtitle** are the effective `*` / `**` the worker reported — `—`
  when a song has none.
- **Notes** is the worker's terse `notes` (corrections, dropped/kept margin notes,
  uncertain chords, inferred layout) — a few words, `—` when there were none. Flag
  any `clean: false` / failed image here too.

Below the table, expand the notable judgement calls in prose — the Notes column is
a scannable index, not a replacement for the detail. You have this straight from
the workers' `notes`; you don't need to reopen anything.

---

## Example (single-song, inline path)

Input (a chord-sheet photo of the intro + first line):

```
* Wish You Were Here
** Pink Floyd

[Em G Em G Em A Em A G]

2.: And did they get you to [C]trade your heroes for[D] ghosts,
```

Following `song-worker.md`, `validate.mjs` reports: Title `Wish You Were Here`,
Subtitle `Pink Floyd`, 2 blocks (one chord-only bridge block), no warnings. Wrapped
in a one-entry manifest and run through `build-import.mjs`, it becomes an import
JSON carrying that one song, settings and all.
