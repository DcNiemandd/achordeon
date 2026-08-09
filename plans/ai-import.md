# Assignment — Importing from an AI

Decision records:
[ADR-0007](../docs/adr/0007-schema-versioning-and-migration.md) — one ingest
gateway; every inbound path runs `migrate` first.
[ADR-0014](../docs/adr/0014-import-boundary-normalises-hand-written-envelopes.md) —
the boundary normalises hand-written envelopes; the schema asks only for what an
import reads.
Glossary: `CONTEXT.md` §Export, §Snapshot, §Share, §Import / re-import,
§Content syntax.

The names below are settled. What is still open is listed at the end.

## Scope

Getting a song out of somebody else's AI assistant and into the library in as few
steps as possible. Three receiving surfaces in the app, one distributable skill,
and the two published artifacts they both read — plus the one producing surface
that falls out for free, handing a song to a person as a link.

**No server.** Nothing here needs an account, a token, or a host we pay for. The
user brings their own assistant; we bring a format it can hit and a door it can
knock on.

Out of scope: MCP servers, remote connectors, personal access tokens, in-app AI.

## The rule

Everything converges on `ImportService.read → plan → apply`
(`libs/shared/data-access/src/lib/transfer/import-service.ts`). No surface below
writes a Song itself. A path that skipped the plan step would be a second write
path with no conflict resolution, and the reason `read/plan/apply` is three calls
is precisely that this must not happen.

**Everything the app ingests is an envelope.** A link, a picked file, a dropped
file — each one's whole job is to produce a Blob and hand it to `read`. There is no
second shape and no loose text on this side of the line.

Loose text — a chord sheet copied off a tab site, a ChordPro file — is converted
**inside the skill**, before it ever reaches the app. The app never sees it. That
is what keeps the three surfaces thin enough to be adapters rather than features.

## 1 — The published schema

`SnapshotEnvelope` (`libs/shared/domain/src/lib/snapshot.ts`) is already the
contract: `app`, `schemaVersion`, `deviceId`, `updatedAt`, `data.{user,songs,
songbooks}`. What is missing is a description of it that a model can read.

Two separate things, and they must not drift:

- The **runtime gate** stays the only thing deciding whether a file is ingestible —
  `isEnvelope` at `import-service.ts:117`, then `migrate`. It grows one step
  (`normalise`, below); it does not move and it does not get a rival.
- The **published schema** is a new build artifact from a `gen-json-schema` target:
  a JSON Schema describing the whole envelope, served at
  `https://achordeon.eu/achordeon.schema.json`.

**One stable URL, no version in the path.** Per ADR-0007 an additive change never
bumps `SCHEMA_VERSION`, so the document changes far more often than the number does
and a `v1` in the path would keep lying. The document says which `SCHEMA_VERSION` it
targets; the URL just says where current lives. It sits at the site root rather than
under `/app/` because it is a document, not part of the app bundle — and it is short
enough to paste into a chat by hand, which is the whole point of it.

Generate it, don't write it. The `SETTINGS` registry already knows every setting
key and which scopes may carry it, so the schema can enumerate the song-scope and
songbook-scope keys from the same source the app resolves them from. A
hand-written copy is wrong the first time a setting is added.

The schema is read by models, not by us. It carries descriptions and examples,
and it asks for as little as the import path actually reads.

### What an import actually reads

Of the envelope's five fields, an import reads `schemaVersion` (through `migrate`)
and `data.songs` / `data.songbooks`. `app` is read by nothing — it is a line for a
person who found the file. `deviceId` and `updatedAt` feed sync's per-row LWW and
mean nothing here.

`data.user` is a **Snapshot's** field, not an Export's (`CONTEXT.md` §Snapshot).
`planImport` and `applyImport` never look at it, and nothing a user picks should
ever carry an account row into their library. The schema must not ask a writer for
it.

So a song says: `name`, `content`, and its own `settings` if it has any. Everything
else on the record — `id`, `createdAt`, `updatedAt`, `deletedAt`, `favorite`,
`cache` — is ceremony that carries no information about a new song.

### Tolerance at the boundary

Demanding the ceremony anyway would be a minefield, because the three emptiest
fields fail in three different ways when a writer leaves them out:

- no `settings` on a song → `Object.keys(undefined)` throws in `migration.ts:66`
- no `data.user` → `undefined.map()` throws in `migration.ts:61`
- no `deletedAt` → `undefined === null` is false, so `import-plan.ts:75` **drops
  the song silently** and the preview reports an empty file with no reason given

None of the three reaches `ImportError`, so none of them shows the "could not be
imported" dialog. The silent drop is the dangerous one.

`ImportService.parse` is already documented as the boundary where "some text a user
picked" becomes a typed value. `normalise(value)` runs there, between `isEnvelope`
and `migrate`: absent `user`, `settings`, `favorite`, `deletedAt` and timestamps
take their empty values, and `cache` is dropped so it is re-derived rather than
believed. Nothing downstream changes, and `SnapshotData` stays honest for the sync
paths that really do carry an account row.

The cost is a second place that knows the record shape: every field added to `Song`
now carries a "does the boundary default this?" question. That is the same
discipline ADR-0007's preserve-unknown already imposes, at a different seam, and it
is worth paying — `applyImport:154` already defends against hand-edited files
("a hand-edited export is exactly where one comes from"), and this plan makes
hand-written files the normal case rather than the pathological one.

## 2 — The converter, extracted

`.claude/skills/song-core/scripts/merge-chordlines.mjs` **already implements both
of the dialects worth having**: a chord row folded into the words below it (exact
column arithmetic, tab expansion, printed-column mapping so an existing `[x2]` does
not shift anything, labels protected, one-letter ambiguity left for a human), and
ChordPro `{title:}`/`{artist:}` directives with block markers dropped.

It cannot be used as it stands: it is a file-to-file CLI, and it takes its chord
theory from `_domain.mjs`, which loads the repo's TypeScript through jiti.

Its only consumer is the skill, so it does not need to become an app-facing lib.
What it does need is to stop being a fork of the app's own chord recognition:

- Separate the pure core from the CLI shell: `toAchordeon(text, opts)` returning the
  converted text and a `ConversionReport`. No `fs`, no `process`, no `console`. The
  CLI stays as a thin wrapper. The name is the outcome rather than the mechanism,
  because the function does two unrelated jobs — folding chord rows into the words
  below, and turning ChordPro directives into `*` / `**` markers — and any
  mechanism-shaped name describes only one of them.
- Point it at the real chord-recognition port. `libs/shared/chord-theory` already
  defines one (ADR-0008); `_domain.mjs` reimplements it against tonal. That
  duplicate goes away.

The core then rides into the bundle in §3 alongside the parser, and the skill stops
needing the repo. This step removes a duplication rather than adding one.

## 3 — The bundled parser

The skill cannot ship the repo. Its sandbox has Node but **no network**, so
`npm install` is not available and jiti cannot load `.ts`.

A `gen-skill-bundle` target: bundle `parse`, the chord theory (tonal included),
`toAchordeon` from §2, `SETTINGS` and `SCHEMA_VERSION` into a single
dependency-free `.mjs`. Everything involved is pure and Angular-free already, so
this is a bundler config, not a refactor.

**The bundle ships as `_domain.mjs`** — the name the skill's scripts already import.
In the repo that file loads the real TypeScript through jiti; in the zip it is the
bundle. Same specifier, two implementations, so `validate.mjs`, `toAchordeon`'s CLI
and `build-import.mjs` are byte-identical in both places: **the scripts that ship
are the scripts that were tested**, with no packaging rewrite in between. Both files
need a comment saying the other exists, because two files with one name is exactly
the sort of thing that wastes an afternoon otherwise.

## 4 — Opening a link

A link carries a whole envelope in its fragment. Tapping it opens the import
preview, already filled in.

### No route of its own

The fragment is read **wherever the user lands**, so the link needs no path: a
writer appends the fragment to `ACHORDEON_URL` (`https://achordeon.eu/app/`) and
stops. Nothing to deploy, no route name for the skill or a model to get wrong, and
the base URL always resolves. The SPA fallback in `deploy.yml` means a dedicated
route _would_ work; it just would not earn the extra surface.

`ImportInbox`, the app-level owner from §7, already exists for dropped files. A link
is the same "something arrived, import it" event over a different transport — one
owner, two triggers.

### Two arrival shapes

Both must work, and the second is the one that gets missed:

- **Fresh load** — the link is tapped and the app boots with the fragment in the URL.
- **Already running** — the PWA is open and the link is routed into the existing
  window, or the URL is pasted into the address bar. This is a _navigation carrying
  a fragment_, not a boot.

A listener on router events catches both. A one-shot read of `location.hash` at
startup catches only the first, and the second is the one that gets reported as
"sometimes it does nothing".

### Clearing it

**Cleared as soon as it is read** — before the preview opens, not after apply. By
then the payload is in memory; the URL was transport, not state. Left until confirm,
a reload while the dialog is open re-offers the same import, and a multi-kilobyte
blob sits in the address bar where it gets bookmarked or copied by accident.
Cancelling loses nothing: the link is still wherever it was tapped from.

`replaceState`, never push — Back must not return to the payload, and the rewrite
must not itself trigger a navigation the listener then re-reads. The owner also
marks a payload consumed, so a restored session cannot run it twice.

### The payload

- **The fragment, never the query.** It must not reach a server, must survive with
  no network, and must not land in anyone's logs. It is also why this works for a
  user who installed the PWA and is offline.
- **Two forms, one reader.** Both are URL-encoded; they differ in whether the JSON
  is compressed first.
  - **`z1`** — gzip (`CompressionStream`) then base64url. Roughly halves a song.
    Written by the app (§5) and by the skill, which both have a compressor.
  - **`j1`** — the JSON, percent-encoded, nothing else. Written by a model.

  A model cannot produce the compressed form. Gzip is a byte-level transform with
  no reasoning in it, and a model asked for one emits a plausible string that
  decodes to nothing. Without the plain form the link would be a tooling-only
  feature and §1's public schema would have no way to reach the app.

  Each writer emits exactly one form; the reader branches on **which parameter
  carries the payload**, so the two are never told apart by sniffing. The digit is
  what lets a third form arrive later without guessing — a new encoding takes a new
  parameter, and old links keep meaning what they meant.

- The compressed form is what makes a QR code possible later — Audience already
  uses one, and a QR tops out near 3KB where plain JSON for one song runs 3–5KB.
- **Size-bound, and the app enforces nothing.** A payload too long to survive being
  pasted arrives truncated, fails to decode, and gets the existing "could not be
  imported" dialog — truncated and corrupt are indistinguishable and have the same
  answer. Deciding a song is too big to link belongs to the writers: §5 disables the
  option and says why, the skill writes a file instead.
- Anything that does not decode, or decodes to something that is not an envelope,
  gets the same dialog. No new failure vocabulary — `ImportFailure` already has the
  two cases a user can act on.

Because the payload is a full envelope it goes through `migrate` like everything
else, which is what makes a link made today still openable after a schema bump.

This is also the phone's path. There is no share target and nothing is fetched (see
_Not doing_), so on a phone the ways in are a tapped link and the file picker.

## 5 — Share as link

The other half of §4: the app writing the link it can read. Not an AI feature at
all — handing a song to a person (`CONTEXT.md` §Share) — but the same code, so it
is cheaper built together than bolted on.

`SHARE_LINK_FORMAT = 'share-link'` joins `DownloadChoice` beside `DATA_FORMAT`, as a
third choice in the download dialog — copied to the clipboard rather than written to
disk. The dialog's own justification already covers it (`transfer-model.ts:34`): a
person deciding what to take away should not have to know which of our words applies
to which file. The presenter fans the choice out to `ShareLinkService`, the way it
already splits `DownloadService` from `ExportService`.

- Offered **wherever an export is** — one song, several, a songbook.
- **Disabled, never hidden, when the selection will not fit**, reading _"This
  selection is too big to share as a link. Download it instead."_ A greyed row that
  explains itself teaches the limit; a row that vanishes reads as a missing feature.
  It names the _selection_ so nobody reads it as a permanent restriction, and it
  says size rather than song count — the limit is length, and one long song can trip
  it where three short ones would not. The length is only knowable once the payload
  is built, so the dialog measures the real thing.
- Compressed form only. The app has `CompressionStream`; the plain form exists for
  writers that do not.
- The uuid travels, so two people passing a song back and forth get replace rather
  than duplicate — the _Untrusted input_ rule paying off in a case with no AI in it.
- The Song's own settings travel too, because the envelope carries them. Correct
  per `CONTEXT.md` §Render settings — a Song-scope override is the Song's wherever
  it goes — but worth saying, because "share a song" sounds lighter than "share a
  song and how I set it up".

## 6 — The file extension

Three changes that are easy to conflate:

- What Export names the file. The bytes are unchanged — still the same JSON.
- What the file input accepts: `import-panel.ts:42` currently lists
  `application/json,.json,image/png,.png`. `.achordeon` joins it; `.json` stays,
  because every file already exported is one.
- `file_handlers` in `apps/app/public/manifest.webmanifest`, so double-clicking one
  opens the installed app. Chromium desktop only; harmless elsewhere.

The registered type is **`application/vnd.achordeon+json`**. The vendor tree is the
right space for an unregistered vendor format, and the `+json` suffix means anything
that has never heard of Achordeon can still tell the bytes are parseable JSON.
Registering plain `application/json` instead would put the handler in competition
with every JSON reader installed, and which one wins a double-click would stop being
our decision.

The embedded-metadata path (`readEmbeddedSnapshot`, PNG downloads) is untouched.

## 7 — Dropping files on the page

Drop a file anywhere in Achordeon and it imports.

**Window-level handling is mandatory, not a design choice.** Without a
`preventDefault` on `dragover`/`drop` at the window, a file dropped outside a
registered zone makes the browser navigate to it, and the app is replaced by a wall
of raw JSON. Since that listener has to exist anyway, the whole window is the
target: a drop in Stage or Settings behaves like a drop in Songs.

- The flow moves to `ImportInbox`, the app-level owner §4 also hands a link to.
  Today `ImportPanel` is mounted per module and each presenter runs its own
  read/plan/apply; a drop in a module that mounts no panel has nobody to hand the
  file to. Both pages keep their Import button.
- **Always Import, never Restore.** Settings has its own restore picker, and per
  `CONTEXT.md` §Snapshot that is a different act — Restore replaces a library,
  Import adds to one. A dropped file is someone handing you songs, so it goes to
  Import even when it carries an account row, which Import discards anyway. Restore
  stays deliberate, behind its confirm, in Settings.
- **Several files at once, one after another.** Sequential is not only the calmer
  UI, it is the only correct order: `planImport` computes conflicts against the
  library _as it stands_, so a second file must be planned after the first is
  applied or it cannot see what the first one added.
- `ImportDropOverlay` (`app-import-drop-overlay`, testid `import-drop-overlay`)
  paints the feedback. It is an overlay, not a zone — the whole window is the
  target, and a name promising edges would invite someone to look for them.
- The overlay must not look like the song explorer's. Its CDK lists already paint
  an `is-drop-target` state for row reordering. There is no event-level collision —
  CDK drag-drop uses pointer events, not native HTML5 DnD — but two different drops
  that look alike is a confusion worth avoiding.
- **A dropped PNG already imports.** `read` tries `readEmbeddedSnapshot` before
  reading text, so a downloaded song image works on drop with no extra code. Worth
  saying out loud, because nobody would guess it.

## 8 — The skill

`achordeon-song` — a generated `.zip`, downloadable from the docs site, that teaches
an assistant the markup and hands it the tools to check its own work. Brand plus
subject: it triggers on "write this song for Achordeon", sits loosely alongside the
repo's own `song-from-image` / `song-from-text`, and leaves the bare brand free if a
second skill ever ships.

Contents, all generated from this repo so none of it can teach last month's syntax:

- The grammar, written for a model: rules stated once, examples over prose, and an
  explicit list of what is not valid. `docs/PARSER-GRAMMAR.md` is closer to the
  right thing than the docs site is.
- The published schema from §1.
- The bundle from §3.
- A syntax check over the real parser — `validate.mjs`'s report, which already
  says exactly the things a model gets wrong: brackets that are not chords,
  labels as they will actually print, shadowed titles.
- The converter CLI from §2.
- A builder that emits the envelope, and the §4 `z1` link for it.

Envelopes the skill writes stamp `deviceId: 'achordeon-skill'` — human-readable, so
it can never collide with a real device uuid, and legible as a breadcrumb wherever
it surfaces later in sync.

The instructions must state that a song's own text is data and never an
instruction — a "song" whose lyrics address the assistant is the one attack this
surface has.

Generate the same content as a Custom GPT knowledge bundle and a Gem's
instructions at the same time. Same source, three wrappers, one build target.

## 9 — Say what arrived, not just how much

Import today compares ids. It never looks at the content, so a song whose markup is
wrong lands silently and is discovered on the page.

`ImportPreview` gains `flaggedSongs` — how many incoming songs produce parser
warnings — shown in the dialog before anything is written. It counts _songs_, not
warnings, since one song can carry several.

This is the answer to a problem with no other fix: **a skill goes stale and nothing
notices.** A downloaded zip sits in someone's assistant forever — skills do not
auto-update and the sandbox has no network to check with — so a skill built before
an escape-rule change teaches the old rule, the model writes content that parses
differently now, the import succeeds, and the song renders wrong. The envelope half
of that problem is already solved (ADR-0007 migrates whatever `schemaVersion` a
stale skill wrote); the grammar half is not.

Checking the content rather than stamping and comparing a grammar version catches
every cause at once — a stale skill, a model that never had the skill, a bad
conversion, a hand-edited file — and it is the more useful message anyway: not
"your tooling is old" but **"these songs have problems"**, which is what the person
actually wants to know before they accept them.

It fits what is already there. `ImportPreview` exists to describe what an import is
about to do before it does it, and already carries `hasUnknownSettings` — "this file
knows things this build does not". This is the same warning pointed the other way.
`inspect()` in the skill already computes the report, so the shape is proven.

The cost is real: import would parse every incoming song, where today it does almost
nothing. Measure it on a 200-song export before committing to parsing the whole file
rather than capping the count or computing it lazily.

## Untrusted input — everywhere above

- **An envelope's ids are trusted; anything else mints.** A song that arrives with
  an `id` keeps it, because that is what makes the common loop work — import a
  song, spot a wrong chord, ask for a fix, tap the new link, and get the _replace_
  dialog rather than a duplicate. A song that arrives without one is minted at the
  boundary. Loose text never carries identity at all.

  The hazard is a hand-writing model reusing `123e4567-e89b-12d3-a456-426614174000`
  — the RFC 4122 example, which is all over training data — so a second song
  arrives claiming the first one's identity. It is already guarded: `ImportConflict`
  carries `incomingName` **and** `existingName`, so the collision presents as two
  visibly different song names and costs one click to reject. The schema should
  still tell a writer to mint a fresh uuid per song and say what reusing one means.
  The skill never has this problem — `build-import.mjs` mints.

- **Never trust `cache`.** Re-derive title and subtitle from the parser. It is a
  cache of something we can compute, and an incoming file's copy may disagree
  with its own content.
- **Cap everything that has a size**: fragment length, dropped file, song count in
  an envelope.
- **Linear scanners, not backtracking regex**, in the converter. It runs in the
  skill rather than the app, so a catastrophic pattern hangs a user's own terminal
  rather than their library — but the input is still arbitrary text off the
  internet, which is exactly what one needs.
- Confirm that a setting key `migrate` preserves but this build does not know
  cannot reach the renderer as an arbitrary value. Preserving unknown settings is
  deliberate (`ImportPreview.hasUnknownSettings`); passing them through to a
  renderer would be a different decision.

## Where ImportInbox lives

Four rules, three of them mechanized in `apps/app/eslint.config.mjs`, decide this
between them — so it is worth settling here rather than by failing lint:

- `apps/app/src/app/shared/**` may never import `@achordeon/shared/data-access`
  ("components never inject a store — that is the presenter rule").
- `*.page.ts` and `*.component.ts` may never import it either, for the same reason.
- A feature folder may not import a sibling feature.
- A root shell file may import features, but nothing may import _it_ — `from:
feature` allows only `app-shared` and `primitives`.

`ImportInbox` injects `ImportService`, and both the shell (a link, a drop) and two
feature presenters (the Import buttons) must reach it. Every in-app location fails
one of the four. **It belongs in `libs/shared/data-access`, beside `ImportService`** —
a shared lib is outside the boundaries graph, governed by the Nx project rule
instead, and presenters already inject data-access services today.

Two consequences:

- It hands back an `ImportPlan`, not an `ImportPreview`. The dialog's vocabulary is
  deliberately declared in `app/shared/transfer/transfer-model.ts` rather than
  imported from data-access, and presenters keep doing that mapping. `flaggedSongs`
  (§9) crosses the same way every other preview field does.
- `ImportDropOverlay` stays controlled, exactly like `ImportPanel`: it injects
  nothing and emits the dropped files. The window-level `dragover`/`drop` listeners
  are its own, since it is mounted once at the shell.

## Proving it

What each step's test looks like, so none of this lands unverified:

- **§1** — `normalise` is pure and unit-testable beside `transfer.spec.ts`. The
  three landmines are three cases: an envelope with no `user`, a song with no
  `settings`, a song with no `deletedAt`. Each must reach the preview intact rather
  than throwing or vanishing.
- **§2** — `toAchordeon` is pure text-to-text. The existing chord-row fixtures are
  the corpus; add the ChordPro directives and a line already carrying `[x2]`.
- **§3** — one smoke test that matters more than it looks: run the bundle under
  `node` in a directory with **no `node_modules`**. That is the sandbox's condition,
  and it is the only way to catch a dependency that slipped in.
- **§4** — e2e (`apps/app-e2e`). Both arrival shapes: a cold load carrying a
  fragment, and a fragment arriving while the app is already running. Assert the URL
  is clean before the dialog is dismissed, and that reload does not re-import.
- **§5** — unit for the encoder (round-trip `z1` against §4's reader), e2e for the
  dialog row appearing and going disabled.
- **§7** — e2e for a single drop and a multi-file drop, plus the one nobody writes:
  a file dropped on a page that mounts no `ImportPanel`, which is the case the
  app-level owner exists for.
- **§9** — unit: a song with a shadowed title counts once, a clean song counts zero.

The round trip worth having above all of these: **build a link with §5, open it with
§4, and assert the song that lands equals the song that left.** It exercises the
encoder, the reader, `normalise`, `migrate` and `planImport` in one test.

## Order

§1 first, and it is the only one with real reach: the schema and the boundary
tolerance that goes with it are what make every hand-written envelope work at all.
§2 then §3, which together make the skill shippable.

§4, §6 and §7 are independent adapters over a `read` that already works and can
land in any order — though §4 and §7 share the app-level owner, so whichever comes
first builds it. §5 needs §4, since it writes what §4 reads. §8 needs §1, §3 and
§4. §9 is independent of all of them and gets more valuable the more of them ship.

Nothing here is blocked on anything outside the repo.

## Not doing

Three things that belong to this problem and are deliberately left out.

**Smart paste.** Detecting a ChordPro or chords-above-lyrics blob on paste and
converting it in the editor. The conversion belongs to the skill, which already has
it; doing it again in the app would be a second implementation of the same fold for
a user who, by then, has already been given a link or a file. Note the shape it
would take if it comes back: ADR-0010's insert-at-cursor hook, converting in place —
**not** the import dialog. A paste is typing, not a write path, and CodeMirror's
undo is a better escape hatch than a preview.

**Importing from a fetched URL.** The one path that would need network in an
offline-first app, and CORS makes it fail precisely where people would try it —
Drive links, Dropbox, ordinary websites — while working on the raw-git hosts only
developers use. What is left over once dropping files covers bulk is "here is a
link to a songbook", which is a _sharing_ feature and deserves its own design
rather than a raw file URL and a hopeful fetch.

**The share target.** Registering as a destination in the phone's own share sheet.
Shared _text_ is cheap — a manifest entry and a GET parameter. Shared _files_ are
not: they arrive as a `multipart/form-data` POST, and with no server the service
worker has to intercept it. Two paths in, one entangled with the service worker,
for something Android and Chromium support and iOS does not. The link (§4) already
reaches every phone.

Worth revisiting if the phone turns out to be where imports actually happen —
text-only, without the file half, is a small change on its own.

## Settled while building

All six, and the reasoning where there was any.

- **Export writes `.achordeon`.** The extension is not only something the picker
  accepts — every new export gets the file-handler association for free and the
  format has a visible identity. `.json` stays in the picker, because every file
  already exported is one.
- **Cancel skips one file; a second button cancels the rest** (§7). Cancel means
  "not this one", so a five-file drop is triaged in one pass — but that needs a way
  out, or leaving costs five clicks. The second button appears only when there is
  something behind the current file, and the first one's label changes to say what
  it does.
- **8000 characters of whole URL** (§5/§4), one named constant, deliberately a
  conservative floor across chat clients, mail and address bars rather than a
  derived number. Raising it is a one-line change once it has been tested against a
  real client.
- The three names: the zip is `achordeon-song.zip`, and the Custom GPT and the Gem
  are both **Achordeon Song** — the same name as the skill, because it is the same
  thing in three wrappers. The `flaggedSongs` line reads "Achordeon could not make
  sense of the markup in _n_ of these songs. They will still import — open them
  afterwards to check."

Two things the plan asked to be checked rather than assumed, and their answers:

- **§9's cost.** A 200-song export — 175 KB of content — parses in ~28 ms, so the
  whole file is checked rather than a capped sample or a lazy count.
- **§3's sandbox condition.** The bundle is 92 KB with no imports at all, and the
  build fails on a surviving bare specifier rather than leaving it to be found in
  somebody else's assistant.
