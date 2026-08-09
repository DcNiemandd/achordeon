---
name: song-from-image
argument-hint: path to a photo or scan of a chord sheet, or a folder of them
description: Transcribe a song (or a whole folder of songs) from images — photos or scans of chord sheets / lyrics-with-chords — into Achordeon markup, syntax-check it against the real parser, and write it out as an Achordeon import JSON (a single song, or a whole folder as one songbook) plus an editable text file. A folder of songs is processed in parallel, one subagent per image. Use when the user gives a picture of a song, a screenshot of chords, a scan, or a folder of them.
---

# Song from image

Turn a picture of a song — or a folder full of them — into **Achordeon content
markup**, syntax-check it with the repo's actual parser, and hand back an **import
JSON** the user can drop straight on Achordeon's Import button, plus the editable
markup file it was built from. A folder becomes one songbook, named after the folder.

This skill is the image **intake**. Everything downstream of "I can read the sheet"
is shared with the other `song-from-*` skills:

- **`.claude/skills/song-core/ORCHESTRATION.md`** — the pipeline: what is new, one
  subagent per image, assembling and building in code, the report, the handoff.
  **Read it now** and follow it, with:
  - `SOURCE GLOB` = image files — `*.jpg`, `*.jpeg`, `*.png`, `*.webp`, `*.heic`,
    `*.gif`, `*.bmp`, `*.tif`, `*.tiff`.
  - `WORKER BRIEF` = `.claude/skills/song-from-image/image-worker.md`.
- **`.claude/skills/song-core/WORKER-CORE.md`** — the grammar, the syntax check, the
  settings rules, the fragment contract. The worker brief sends you there; the
  orchestrator does not need it.

For a **single** song (one image, or a few images of the same song) you skip the
subagent and follow `image-worker.md` yourself. For a **folder**, dispatch one
subagent per image.

Its **step 0 asks the user one question** — English or German note names — before any
transcription starts. Ask it once per run, not once per image, and not at the end
where the answer would cost a rebuild. Do not answer it from the scan: a sheet
printed with `H` says what its writer preferred, not what this reader wants.

## The one rule that outranks the rest

**No song content in chat — ever.** Not a verse, not a line, not "here's the first
bit so you can check it". The markup goes into a file and the user reads it there.
Chat carries the report only: title, subtitle, structure, settings, corrections,
warnings, and the paths. `ORCHESTRATION.md` says why this is load-bearing and not
merely tidy.

## What images do that text cannot

Two things are unique to this intake, and they are why the image worker exists at
all:

- **Layout is visible.** `columns` can genuinely be read off a scan, so the image
  worker sets it. (Everything else stays default — and `aspectRatio` is banned
  outright; see `WORKER-CORE.md`.)
- **The content has to be transcribed, not transformed.** There is no source file to
  point at, so the image worker is the one intake that writes `content` inline in its
  fragment rather than `contentFile`.

## Example

A chord-sheet photo of an intro and a first line becomes:

```
* Wish You Were Here
** Pink Floyd

[Em G Em G Em A Em A G]
```

`validate.mjs` reports: title `Wish You Were Here`, subtitle `Pink Floyd`, 2 blocks
(one a row of chords only), no warnings. Wrapped in a one-entry manifest and run
through `build-import.mjs`, it becomes an import JSON carrying that one song,
settings and all.
