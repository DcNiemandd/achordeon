# Notation — plan for the rest of it

Status: **research, not decided.** One fork (§3) has to be settled before any of
the work below is worth starting.

Companion to `PARSER-GRAMMAR.md` §Notation, which records what is _shipped_. This
records what is not, and why the obvious version of it is a trap.

---

## 0. Where it stands

Shipped, and not in question here:

- **Reading is unconditional.** `toEnglishNotation` (`chords.ts`) rewrites a
  leading `H` and a `/H` to `B`, always, for every reader. A source file's meaning
  does not depend on a setting.
- **`notation` (`english | german`) spells the printed page.** `respellChords`
  runs once at the top of the render (`RenderService.layout`); `content` is never
  touched.
- **Both settings spell** (just fixed). English writes `H`→`B` and `Hb`→`Bb`;
  German writes B natural→`H` and B♭→`B`. Before the fix English was the identity,
  which made the row `german | off`.
- **Transpose already takes a notation** and writes `H` for B natural under
  German, via `spellNoteInSource` — the subset of the German rule that survives
  being parsed again.

So today: `[H, Hb, B, Bb]` prints `[B, Bb, B, Bb]` in English and `[H, B, H, B]`
in German.

## 1. The complaint

Two things, and they are not the same thing.

**(a) Source and output disagree.** A German song's `Bb` prints as `B`. The editor
shows one string, the page shows another, and the only way to know which is which
is to know the rule. Wanted: what is in the file is what is on the page.

**(b) The setting's real job is transpose.** It exists so a German author's own
text does not turn English the first time they press ♯. That is a _source-writing_
concern, and it is currently a passenger on a _printing_ feature.

## 2. The reframe

`notation` stops being a print policy and becomes a **source-spelling policy**.
Mostly this is deletion:

- `respellChords` goes away. Render is identity. Source == output by
  construction rather than by promise.
- `spellNoteInSource` becomes the only speller — which is what its name already
  says. `transpose.ts` is its one consumer today and stays that.
- Switching notation on a song becomes a **one-time source rewrite**: explicit,
  visible in the editor, undoable, using the same normaliser the import path
  needs anyway.
- `germanNote` and its `Bb`→`B` half die, and with them the ~20 lines in
  `notation.ts` explaining why the print speller and the source speller must
  differ. They stop differing.

## 3. THE FORK — this is the decision

Source==output costs you the bare German `B`, and there is no way around it that
does not cost something bigger.

Reading is unconditional: `B` in source is B natural for everyone. If output must
equal source, German source can only ever spell B♭ as `Bb`. You get the `H`; you
never get the idiomatic bare `B`.

Normalised source, and what each prints (they are the same string — that is the
point):

| source typed | english | german |
| ------------ | ------- | ------ |
| `H`          | `B`     | `H`    |
| `Hb`         | `Bb`    | `Bb`   |
| `B`          | `B`     | `H`    |
| `Bb`         | `Bb`    | `Bb`   |

`Hb` and `Bb` collapse — correct, they are the same pitch. No `A` anywhere: `Bb`
as B♭♭ is right by theory and wrong by every user, since nobody writes `Bb`
meaning a double flat.

**Option A — `Bb` in German.** The table above. German is half-German: the `H` is
right, the B♭ is spelled English. Zero ambiguity, no new concepts, and the whole
feature collapses to a transpose concern plus a normaliser.

**Option B — strict reading.** `B` in source means B♭, so German prints
`[H, B, B, Bb]` and source still equals output. Fully idiomatic. The cost: a
song's _meaning_ now depends on state outside the chord token. Survivable only if
`notation` is stored per-song and **reading never consults the cascade** — the
song's own explicit value, or English, never the songbook, never the app default.
That makes one setting mean two different things depending on where it is
resolved from, and it needs a migration for every song already stored.

**Recommendation: A.** A German reader who sees `Bb` reads the right note and
tuts. A German reader under today's behaviour, or under a mis-resolved B, plays
the wrong note and does not know. Legibility nit vs. wrong pitch.

## 4. Strict German is an input dialect, not a storage format

Which does not mean the German `B` goes unhandled — it means it is handled at the
**import boundary** and never after.

A pasted or scanned German sheet declares itself German; the converter rewrites
once — `B`→`Bb`, `H` kept — into source the app reads unambiguously. The song is
then stored in the one reading everybody shares, and nothing downstream needs to
know where it came from.

- Fits the existing `song-from-image` / `song-from-text` skills, which already own
  the "turn foreign text into Achordeon markup" step.
- One-time, at the edge, where a human is present to confirm the dialect.
- The German user's `B`s get fixed once and correctly. Today every one of them
  renders a semitone off, silently — this is the actual bug in the pile.

## 5. The warning

Under §2 the source can drift out of its declared notation (hand edit, paste into
an existing song), so the warning stops being decorative and becomes what holds
the invariant up.

Make it symmetric — it is one predicate, and the pair covers the case worth
catching for free:

- `notation: english` and a root or bass is `H` → German spelling in an English
  song.
- `notation: german` and a root or bass is `B` → English spelling in a German
  song.

A song mixing `H` and `B` for B natural trips one of them whichever way it is set,
so mixed-spelling detection needs no third code.

**It cannot live in `parse`.** Parse is pure and notation-unaware; threading the
setting in would make `ast.warnings` depend on a preference, so the same file
would underline differently on two devices. Put it beside parse instead:

- `notationWarnings(ast, notation): Warning[]` in `shared/domain`.
- The editor concatenates it before `toMarkers`
  (`apps/app/src/app/songs/editor/warning-copy.ts`). New codes join `WarningCode`,
  and the `Record<WarningCode, …>` there refuses to compile until someone writes
  the copy — which is the point of that Record.
- Range comes off the anchor's `at` + `raw.length`. **Check first** that `at` is a
  column into `line.text` and not something else.

Offer the fix as an action, not only an underline: "spell this song in German"
runs the normaliser over `content`.

## 6. What breaks

- **Visible regression** for anyone already on German: B♭ printed `B`, will print
  `Bb`. The one-time convert action is the mitigation; under Option A there is no
  way to have both.
- `notation.spec.ts` — the `germanNote` half and the
  `spellNoteInSource`-vs-print-spelling divergence tests go.
- `apps/app-e2e/src/settings.spec.ts` asserts the setting is operable, not what it
  prints, so it survives. Worth adding a print assertion either way.
- Docs to rewrite: `notation.ts` header, `settings.ts` `notation` comment,
  `PARSER-GRAMMAR.md` §Notation, `docs/achordeon-implementation.md` (Epic 12),
  `apps/docs/docs/settings.mdx` + its `cs` twin, both `ai-import.mdx`.

## 7. Order of work, once §3 is settled

1. `respellSource(content, notation, theory)` in `shared/domain` — the normaliser.
   One function, the thing both the convert action and the importer need.
2. Delete `respellChords` from the render path; `RenderService.layout` loses a
   step and both languages render identically.
3. The convert action in the editor, wired to the `notation` setting changing.
4. `notationWarnings` + copy + markers.
5. The import dialect flag in `song-from-image` / `song-from-text`.
6. Docs.
