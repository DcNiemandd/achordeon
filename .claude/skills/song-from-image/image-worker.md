# Image worker — read one image

You are transcribing **exactly one** chord-sheet image into Achordeon content
markup. You do **not** know or care about the other images, the folder, the
ordering, or the final songbook — a parent orchestrator handles all of that. Your
job is one image, in isolation, done faithfully.

The orchestrator gives you `IMAGE` (the one image to transcribe), `NAME` (the
library label — the image's file name without extension, used verbatim) and
`FRAGMENT_DIR` (a scratch directory).

**This file covers the intake only — steps 1 and 2.** For the grammar you write in,
the syntax check, the settings rules and the output contract, read
**`.claude/skills/song-core/WORKER-CORE.md`** and follow its steps 3–5. Read it
before you start writing markup; the grammar has traps (the eaten delimiter colon
above all) that are cheaper to know than to debug.

**Song content never appears in your reply.** It goes in the fragment. See the
"lyrics never leave the file" section of `WORKER-CORE.md`.

## 1. Read everything on the image — and get it right

**Transcribe all of it.** Chord sheets carry more than lyrics: a capo note, a key, a
tuning, repeat counts (`2×`), section markers, performance notes ("Sólo = Sloka",
"pomalu", "koda"), a `–` before a refrain line. **Usually all of it is needed** —
capture it, don't quietly drop the handwriting in the margin. Put such notes where
they belong: a section note becomes a **label** (`Sólo:`), an inline annotation
becomes a verbatim bracket (`[2×]`, `[N.C.]`), a standalone remark becomes its own
lyric line. Only genuinely omit a note if it is purely about the paper (a page
number, a hole-punch).

**Correct what is clearly wrong.** You are transcribing a song, not photographing a
typo. Fix obvious misspellings, missing diacritics (Czech/other), OCR-style letter
swaps, and broken words so the result reads as the song actually goes. Keep
deliberate stylings, dialect, and the songwriter's actual word choices. When a
correction is a judgement call (a possibly-wrong chord, an ambiguous word), make the
sensible fix and **record it in your `notes`** rather than guessing silently. If a
spot is truly unreadable, say so in `notes` instead of inventing.

Extract:

- **Title / author** → `* Title` / `** Author`.
- **Section labels** (Verse 1, Chorus, Bridge, `R:`, numbers, "Sólo") → block labels,
  reproduced **exactly as printed**. Remember the delimiter colon is eaten: a sheet's
  `R:` is written `R:: …`, a bare `Sólo` is written `Sólo: …`.
- **Lyrics**, line by line, blocks separated by a blank line.
- **Chords**, and critically **which character each sits over**. Sheets print chords
  on a line _above_ the lyric; place each `[chord]` immediately **before the character
  under it**. Chord-only rows (intros, solos, turnarounds) become a bracket line like
  `[Em G D]`.

## 2. Write the markup to a file

Write the assembled markup with the Write tool to **`<FRAGMENT_DIR>/<NAME>.txt`**,
then work on that file from here on. Transcription is the one intake with no source
file to point at, so this write is unavoidable — but it is a single write of a file,
not content in a message, and everything after it (checking, fixing, building) reads
that file rather than passing the song around.

Because this file is a transcription rather than a converted source, it is **not**
kept beside the image — the orchestrator's working-file handoff does not apply to
the image path. The user's copy of the words is the photo they already have.

Now go to `WORKER-CORE.md` step 3 and check the file:

```bash
node .claude/skills/song-core/scripts/validate.mjs "<FRAGMENT_DIR>/<NAME>.txt"
```

Fix problems by editing that file, and re-run until clean.

## Settings, for this intake

The image is the one source that shows layout, so `columns` is worth reading off it —
count the columns the lyrics are printed in. Everything else in `WORKER-CORE.md`'s
settings table stays at the user's defaults unless the sheet is clearly styled, and
`aspectRatio` is never set at all.

## Fragment, for this intake

Follow `WORKER-CORE.md` step 5 and point `contentFile` at the **absolute** path of
your `<FRAGMENT_DIR>/<NAME>.txt`. Do **not** read that file back to embed it inline —
that would push the whole song through your own output for no gain. You wrote it
once; from here it is a path.
