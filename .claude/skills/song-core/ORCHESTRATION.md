# Song orchestration — one source, or a folder of them

The shared pipeline behind every `song-from-*` skill: work out what is new, dispatch
one worker per source, stitch the fragments into an `.achordeon` file in code, report.
Nothing here depends on what the sources _are_ — your skill supplies two things:

- `SOURCE GLOB` — which files in a folder count as songs.
- `WORKER BRIEF` — the path to your skill's intake brief (`image-worker.md`,
  `text-worker.md`, …). The brief itself sends the worker on to
  `.claude/skills/song-core/WORKER-CORE.md` for the grammar and the contract.

and may supply one more:

- `NAME PREFIX` — a literal string stuck on the front of every song's library
  label. Empty unless your skill sets one. An intake whose output always wants
  proof-reading declares a prefix so the songs arrive in the library already
  flagged; see step 3.

## The lyrics never leave the files

Song content goes source file → working file → import JSON, all of it on disk. **It
never appears in chat, in your reply, or in a code block** — not as a preview, not
as a "here's what I made" confirmation, not even one verse. What you report is
_about_ the song: title, subtitle, structure, settings, corrections, warnings.

Two reasons, both practical. Reproducing lyrics is a copyright problem, and a reply
that trips it is cut off part-way — so the import JSON, the thing actually wanted,
never arrives. And the whole sharding design below exists to keep content out of
your context; printing it hands back the cost you just paid to avoid.

If the user asks to see the song, point them at the working file. It is theirs, it
is on their disk, and it is the thing they should be reading anyway.

## Which path

- **One song** (one source file, or a few files of the _same_ song) → **inline, no
  subagent.** Follow the worker brief yourself, then deliver (step 6). Spawning a
  subagent for a single song is pure overhead.
- **A folder of songs** (many files, each its own song) → **subagent per source.**
  Run steps 1–7. This is where the parallelism and the flat token cost come from:
  each song's conversion, validation, and fix loop happen in a subagent context that
  is thrown away, and only a tiny metadata blob comes back.

## 0. Ask which chord spelling — once, before anything else

**Ask the user: English or German note names?** Use `AskUserQuestion`, offer
**English (recommended)** and **German (H/B)**, and ask it **once per run**, up
front — never per song, never after the work is done, when it would mean a rebuild.

The two options, in the words to put in front of the user:

- **English** — B natural prints as `B`, B♭ prints as `Bb`. The default.
- **German** — B natural prints as `H`, B♭ prints as `B`. Usual in Czech and German
  songbooks.

This is a **rendering** choice and nothing else. It never changes the markup: the
content is written in English note names either way (`WORKER-CORE.md` explains why
that is load-bearing rather than tidy — writing a German bare `B` into the text moves
every B♭ up a semitone on the next parse). What the user picks becomes a
**`notation` setting**, and the same song flips between the two spellings with one
toggle in the app afterwards. Say that when you ask: it takes the weight out of the
question.

Do not infer the answer from the source. A sheet printed with `H` tells you what its
writer preferred; the person importing it is the one who has to read the result.

Then carry the answer down:

- **A folder → the songbook**, not the songs. The domain is explicit that a book
  should not be spelled two ways (`libs/shared/domain/src/lib/settings.ts`), so pass
  it at book scope in step 5 and leave every song's own settings empty.
- **A single song → that song.** Tell the worker, and it writes
  `"notation": "german"` into its fragment's settings. Omit it for English — that is
  the default, and a setting written to its default is noise the user then has to
  recognise as harmless.

## 1. Take stock of the folder (no conversion yet)

Glob the folder for `SOURCE GLOB`. The import file lives **inside the source folder
from the start**, named after it — **`<Folder>/<Folder>.achordeon`** (step 6) — that is
where you both look for it and write it.

Work out which sources are **new** before spawning anything:

- If `<Folder>.achordeon` already exists, read it and collect the song `name`s already
  present (each `name` is `NAME PREFIX` + a source file's name without extension).
- **Skip every source whose basename is already in that file — do not spawn a worker
  for it, do not even read it.** The builder keeps those songs untouched (step 6).
  Compare like for like: a source counts as present when `NAME PREFIX` + its
  basename is one of those names. A prefixed run does not re-convert the songs an
  earlier prefixed run already did, and it does not recognise unprefixed ones — if
  the same folder was once built without the prefix, the old entries stay, the new
  ones arrive prefixed, and the user gets told rather than silently given both.
- If every source is already present, there is nothing to do — say so and stop.

You only dispatch workers for the **new** sources.

### This is also how a run survives its own session

The check above is not just for a folder the user adds to later — it is the resume,
and it works mid-run because **`<Folder>.achordeon` is written after every wave, not once
at the end** (step 6). A run interrupted at song 40 of 70 leaves 40 songs recorded in
it, so the next session skips those 40 and picks up at 41. Nothing needs to be
remembered across the gap; the answer is on disk, in the folder the user pointed at.

Three things sit in that folder and each is load-bearing on its own:

- **`<Folder>.achordeon`** — the ledger. What is done.
- **`<Folder>/.achordeon-work/`** — the fragments and `order.txt` (steps 3 and 5).
  What is done _and how it was to be arranged_.
- **the working `.txt` files**, beside each source — the markup itself, which the
  fragments only point at.

So the expensive part — reading the sources — is never paid twice. Even the worst
case, a run that died before its first wave landed, leaves finished `.txt` files that
a fresh run's workers overwrite rather than anything being lost.

**If `.achordeon-work/` is there when you start, a previous run was interrupted.** Say
so before doing anything else, then carry on normally: the dedupe above already tells
you what is left, and the leftover fragments cost nothing — they are keyed by `NAME`,
so a re-run of the same source simply overwrites its own.

**Mixed folders need nothing special.** A folder holding both scans and text files
is handled by running each `song-from-*` skill over it in turn: the builder merges
incrementally by song `name` (step 6), so the second run keeps the first run's songs
and adds its own. Neither skill has to know the other exists — and neither should
touch sources outside its own `SOURCE GLOB`.

## 2. Decide the order (orchestrator only — workers don't touch this)

The songbook plays back in `songs[]` array order. Work out the intended sequence
now, from cheap signals, without reading any song's content:

- **From the file names** — sources are usually numbered (`1.1.`, `1.2.`, … `2.4.`);
  sort by that prefix. Absent numbering, fall back to the folder's natural sort.
- **From a contents page** — if the user includes an index / table-of-contents
  source (a photographed contents list, a plain list of titles), read _that one file_
  here in the orchestrator, and let its order override the file-name sort. You'll
  match its listed titles to workers by the `title` each worker returns (step 4).

The order is a list of `name`s — the `NAME`s exactly as step 3 builds them, `NAME
PREFIX` included, because that is what the fragments are keyed by. A prefix is the
same string on every song, so it never changes the sort; it just has to be there for
the assembler to find the fragment.

**Write it to `<Folder>/.achordeon-work/order.txt` now**, one name per line, covering
_every_ source in the folder and not only the new ones. Two reasons, and the second
is the one that matters:

- steps 5 and 6 both read it from there, every wave;
- a contents page is read **once**, here. If the order lived only in your context,
  an interrupted run would lose the one thing in the whole pipeline that cannot be
  re-derived from the folder — and a resumed run would silently fall back to file
  name, quietly undoing the sequence the user gave you a photo of.

## 3. Dispatch one subagent per new source

Launch the new sources **in parallel**, one subagent each, but **never more than 4
subagents running at once**. If there are more than 4, send them in waves of at most 4. The design is wave-safe because every worker is fully independent and writes a
distinct fragment file.

**Then run steps 4–6 on that wave before dispatching the next one.** Each wave ends
with its songs written into `<Folder>.achordeon`, so the ledger step 1 reads is never more
than one wave behind the work. Loop — dispatch, collect, build — until the new
sources run out. The build is cheap next to a wave of transcription, and it is the
only thing standing between an interrupted run and starting over.

Give each subagent this brief:

> Read and follow `WORKER BRIEF`. Convert the single source at `SOURCE`, using
> `NAME` as the song's library label, and write your fragment into `FRAGMENT_DIR`.
> Return only the JSON blob the worker brief specifies — do not return the song
> content.

with these values filled in per source:

- `SOURCE` = the source file's path.
- `NAME` = `NAME PREFIX` + the source file's name **without extension** (e.g.
  `1.5. Vizovice - Fleret`, or `[DRAFT] 1.5. Vizovice - Fleret` under a prefix).
  This is the library label and the merge key; pass it verbatim. The prefix is
  yours to add — the worker never knows there is one, and must not strip, repeat,
  or "tidy" it. It rides along into the fragment's file name, the song's `name`,
  and nothing else: the printed title comes from the content's `*` line, which the
  prefix never touches.
- `FRAGMENT_DIR` = **`<Folder>/.achordeon-work/`**, created if missing. Every worker
  writes into it; each writes a _distinct_ `<NAME>.song.json`, so there is no
  collision. **Not a `mktemp -d`.** A temp dir's name lives only in the context that
  made it, so a run that dies takes the way back to its own work with it; a dir
  beside the sources is found by anyone who looks at the folder — including you, in a
  session that has never seen this run before. Step 1 explains what that buys.
- If (and only if) the user explicitly asked for a chord colour/size, pass that
  through so the worker can set it.
- **German spelling, single song only.** If step 0 got `german` **and** this is a
  one-song run, tell the worker to set `notation`. For a folder it belongs on the
  songbook (step 5), so say nothing here and leave the songs' settings empty.

**Do not let workers write `<Folder>.achordeon`.** They write only their own fragment and
their own working file. The single merge is yours alone (step 6) — this is what
keeps the write race from happening.

## 4. Collect the returns

Each worker returns a small JSON blob: `{ name, title, subtitle, fragment, clean,
notes }`. Collect them — this wave's, and keep every earlier wave's too. These blobs
are all you hold in context — never the song content. From them you have everything
for ordering (step 2's title-matching), the build (step 6), and the result table
(step 7).

Handle misses gracefully: a worker with `clean: false` or no `fragment` is a
partial/failed source. Note it, keep going with the rest, and tell the user at the
end. Because failed songs never make it into `<Folder>.achordeon`, the dedupe in step 1
will naturally retry exactly those sources on the next run.

## 5. Assemble the wave's manifest **in code**, not by reading fragments

This is the step that keeps the whole thing cheap. **Do not Read the fragment files
into your own context to build the manifest** — that would pull every song's content
back into the orchestrator and rebuild the very cost you sharded to avoid. Instead,
hand the fragment directory to the assembler, which stitches the manifest without any
content passing through the model:

```bash
# wave.txt = just this wave's NAMEs, one per line — overwrite it each wave
printf '%s\n' "${WAVE[@]}" > "$FRAGMENT_DIR/wave.txt"
node .claude/skills/song-core/scripts/assemble-manifest.mjs \
  "$FRAGMENT_DIR" --only "$FRAGMENT_DIR/wave.txt" \
  --songbook "<Folder>" -o "$FRAGMENT_DIR/manifest.json"
```

**`--only` is not an optimisation — leave it off and the run corrupts itself.** The
builder mints a fresh id for every song in the manifest it is handed. Restate an
already-built song and it comes back with a new id, so the merge in step 6 has
nothing to recognise and the "same" song ends up imported twice. One wave, one
manifest, and the songs already in the file are left alone by never being mentioned.

Ordering is not this script's job any more — step 6 applies `order.txt` to the whole
file, which is the only place it _can_ be applied once the file is grown in batches.

Add `--songbook-settings '{"notation":"german"}'` when step 0 said German — that is
where a folder's spelling belongs. The same flag carries any other songbook-scope
setting the user asked for (`chordColor`, `chordSize`); `build-import` validates the
keys against the real registry, so a typo is caught loudly rather than dropped.

The assembler emits a manifest whose `songs[]` each carry the `{name,
content|contentFile, settings}` the worker wrote. (Omit `--songbook` for a plain
multi-song import with no songbook wrapper.)

## 6. Build the import file (folder as songbook) — every wave

Run the real builder on the wave's manifest. It computes the derived cache with the
actual parser, reads any `contentFile` off disk, generates ids/timestamps, stamps
`schemaVersion`, validates settings, and — crucially — **merges incrementally** into
the existing `<Folder>.achordeon`: it keeps the songs already there untouched, ids
and all, adds only the ones this wave converted (matched by `name`; a same-named song
is replaced), and reuses the songbook's id.

```bash
node .claude/skills/song-core/scripts/build-import.mjs "$FRAGMENT_DIR/manifest.json" \
  -o "path/to/Fleret/Fleret.achordeon" --order "$FRAGMENT_DIR/order.txt"
```

`--order` is what holds step 2's sequence together across waves. Without it a merge
falls back to sorting by file name, which is right often enough to hide the bug —
numbered sources sort the same either way — and wrong exactly when the order came
from a contents page, the one case that cannot be recovered afterwards. Pass it every
wave; names it lists that are not converted yet are skipped in silence.

**Write `.achordeon`, not `.json`.** That is the extension the app's own Export
writes and the one the OS hands back to Achordeon on a double-click. The bytes are
identical JSON — a `.json` file still imports, since every file exported before the
extension existed is one — but a file written today should be named the way the app
names its own.

Write the output **into the source folder**, named after it, so it sits next to the
sources from the first run onward. For a single song, write it **beside its source
file**, named after the song: `path/to/Vizovice.achordeon`. The builder prints a
per-song summary to stderr — and, when it merged, how many songs it kept vs. added —
check it before handing over.

(The manifest's `songbook` may also be the object form —
`{ "name", "title", "subtitle", "author", "settings" }` — for a title
or author the folder name cannot give; `--songbook-settings` writes the `settings`
half of it for you, which is the only part a normal run needs.)

### Delivery

**The file is the delivery.** Every run hands over paths and a report; never
content. There is no "print it in chat" mode — if the user wants to read the song,
they open the working file or import the songbook.

Two artifacts come out of a run, and the user needs to know about both:

- the **`.achordeon` file** — the thing they drop on Achordeon's Import button;
- the **working file(s)** — the converted markup, one `.txt` per song, sitting
  beside each source. This is what they edit when a chord landed a character off.

## 7. Report a result table

**End every run with a summary table**, built from the returned blobs (never by
re-reading content). One row per song, in songbook order:

| File                          | Title    | Subtitle  | Notes                                  |
| ----------------------------- | -------- | --------- | -------------------------------------- |
| `1.5. Vizovice - Fleret.jpg`  | Vizovice | Fleret    | —                                      |
| `2.0. Anděl - Precendens.jpg` | Anděl    | Precedens | 2-column layout; author spelling fixed |

- **File** is the source file's name (with extension).
- **Title** / **Subtitle** are the effective `*` / `**` the worker reported — `—`
  when a song has none.
- **Notes** is the worker's terse `notes` (corrections, dropped/kept margin notes,
  uncertain chords, inferred layout) — a few words, `—` when there were none. Flag
  any `clean: false` / failed source here too.

Below the table, expand the notable judgement calls in prose — the Notes column is a
scannable index, not a replacement for the detail. You have this straight from the
workers' `notes`; you don't need to reopen anything. Describe corrections, never
quote the line they were in.

## 8. Close with the check-and-clean handoff

The working files and `.achordeon-work/` are **kept on purpose** and **you never
delete them on your own**. They are the user's chance to catch a chord that landed
one character off, and to have the file rebuilt from a fix rather than reconverted
from scratch.

So end the run by telling them, in plain words — the user is not a programmer, so no
jargon, no file-format talk:

1. **what they got**: the import file, ready for the Import button;
2. **what to check**: open the `.txt` next to each song and see that the chords sit
   over the right words;
3. **what to do if something's off**: fix it in that file themselves, or tell you
   what's wrong, and you'll rebuild the import file;
4. **what to do when it's right**: say so, and you'll clear away the leftover
   working files.

Then **wait.** Only when the user says they are done, clear away both the `.txt`
files and `<Folder>/.achordeon-work/` — and only then, because until that moment the
work dir is what a fresh session would resume from. Rebuilding after a fix does not
need a reconversion: the fragments still point at the corrected `.txt`, so re-run
steps 5–6 and it is picked up.
