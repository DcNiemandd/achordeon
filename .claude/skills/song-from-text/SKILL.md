---
name: song-from-text
argument-hint: path to a text file holding a song, or a folder of them (not pasted text)
description: Turn a song that already exists as text — a chord sheet copied off a tab site, a ChordPro file, a plain lyrics file, a folder of them — into Achordeon markup and an Achordeon import JSON, plus an editable text file. Chord rows sitting above the words are folded into inline brackets by a script, so the song is never retyped. Use when the user has song text in a file (or offers to paste one) and wants it formatted for Achordeon import.
---

# Song from text

Turn a text file holding a song into **Achordeon content markup**, syntax-check it
with the repo's actual parser, and hand back an **import JSON** the user can drop on
Achordeon's Import button, plus the editable markup file it was built from. A folder
of text files becomes one songbook, named after the folder.

## The intake: a file, always a file

**This skill takes a path to a file. It does not take pasted text.**

If the user pastes a song into the chat instead, the reply is:

> Save that to a text file — anywhere, any name ending in `.txt` — and give me the
> path. I'll take it from there.

**Do not offer to write the file for them, and do not write it.** Copying a pasted
song into a file is reproducing it just as surely as printing it, and the run gets
cut off part-way — usually before the import file exists. The user putting their own
text in their own file costs them ten seconds and makes the whole rest of the
pipeline work. Ask, wait, proceed.

Once you have a path, the song never passes through the chat again: file → working
file → import JSON, all on disk.

## The one rule that outranks the rest

**No song content in chat — ever.** Not a verse, not a line, not "here's the first
bit so you can check it", not a diff of a fix. Chat carries the report only: title,
subtitle, structure, settings, corrections, warnings, and the paths.
`.claude/skills/song-core/ORCHESTRATION.md` says why this is load-bearing.

## How to run it

Follow **`.claude/skills/song-core/ORCHESTRATION.md`** — the shared pipeline: what is
new, one subagent per file, assembling and building in code, the report, the
check-and-clean handoff. **Read it now**, with:

- `SOURCE GLOB` = text files — `*.txt`, `*.md`, `*.crd`, `*.cho`, `*.chopro`,
  `*.pro`, `*.chordpro`. If the user points at a file with some other extension and
  it opens as text, take it; the extension list is a default for globbing folders,
  not a gate.
- `WORKER BRIEF` = `.claude/skills/song-from-text/text-worker.md`.

For a **single** file you skip the subagent and follow `text-worker.md` yourself. For
a **folder**, dispatch one subagent per file.

Its **step 0 asks the user one question** — English or German note names — before any
conversion starts. Ask it once per run, not once per song, and not at the end where
the answer would cost a rebuild.

## What text does that images cannot

- **The conversion is mechanical, so a script does it.**
  `song-core/scripts/merge-chordlines.mjs` folds chord rows into inline brackets,
  file to file, with exact column arithmetic. This is the heart of the skill: it
  means the song is never retyped, by anyone, at any point.
- **There is no layout to read.** A text file shows no columns, no title font, no
  margins — so this intake infers **no settings at all**. The only ones written are
  what the user asked for outright: the chord spelling from step 0, and a chord
  colour or size if they wanted one.
- **The working file is kept.** It sits beside the source as
  `<Name>.achordeon.txt`, and it is what the user edits when a chord landed a
  character off. You delete it only when they say they're done (step 8 of
  `ORCHESTRATION.md`).

## Example

A file holding a chord sheet in the usual copied-off-a-tab-site shape — a row of
chord symbols, then the line of words it sits over, blank lines between verses,
`Chorus:` in front of the refrain — comes back as:

- `Song.achordeon.txt` — the same song with the chords inline, `* Title` /
  `** Artist` on top, `Chorus::` so the colon survives printing;
- `Song.json` — the import file;
- a chat report: title, subtitle, 6 blocks, 34 chords, one label, no warnings, one
  note that a lone `A` on line 12 was left alone because it could be a word.
