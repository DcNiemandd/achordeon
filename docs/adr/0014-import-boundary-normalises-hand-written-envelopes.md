# 14. The import boundary normalises hand-written envelopes

Date: 2026-08-08

## Status

Accepted

## Context

Until now every Achordeon file was written by Achordeon. `ExportService` produced
the envelope, `ImportService` consumed it, and the only hand-editing anyone did was
to a file that had been machine-written first. `applyImport` already assumes this
happens — it drops dangling songbook entries because "a hand-edited export is
exactly where one comes from" — but the assumption was that a person tweaks a field
in a file that is otherwise complete.

Publishing a JSON Schema so that an assistant can author an envelope from nothing
ends that. A **hand-written envelope** — one produced by a model reading the schema,
never by our own code — becomes an ordinary inbound file, arriving through the file
picker, a drop, or a link's fragment.

Models write the fields that carry information and omit the ones that do not. Three
of the record's emptiest fields fail, differently, when omitted:

- no `settings` on a song → `Object.keys(undefined)` throws in `hasUnknownKeys`
- no `data.user` → `undefined.map()` throws in the same function
- no `deletedAt` → `undefined === null` is false, so `planImport` filters the song
  out and the preview reports an empty file

None of the three raises `ImportError`, so none reaches the "could not be imported"
dialog. The first two surface as an unhandled `TypeError`; the third is worse — the
import succeeds, silently, having imported nothing, with no explanation available to
the user or to us.

`data.user` is the sharpest case, because it is a field an import must never honour
in the first place. It belongs to a **Snapshot** (the whole library, account row
included, which is what sync and backup move) and not to an **Export** (Songs and
Songbooks, which is what a person hands to another person). `planImport` and
`applyImport` never read it. Requiring a writer to supply it would be demanding a
field we provably discard.

Two ways out. Either the schema demands the full record and the generated skill
becomes the only sanctioned writer — every other assistant producing files that fail
in the three ways above — or the boundary accepts less than the type declares.

## Decision

**`ImportService.parse` normalises an inbound envelope before it reaches `migrate`.**
Absent `user`, `settings`, `favorite`, `deletedAt` and record timestamps take their
empty values; `cache` is discarded so it is re-derived from the parser rather than
believed.

The published schema asks only for what an import actually reads: per song, `name`,
`content`, and `settings` where the song has any. `id` is honoured when present and
minted when not. `data.user` is not in the schema at all.

**The gate does not move and does not gain a rival.** `isEnvelope` then `migrate`
remains the single decision about whether a file is ingestible (ADR-0007), and
normalisation is a step inside it — not a second door, and not a pre-pass any caller
can skip. Every inbound path keeps arriving through `read`.

**`SnapshotData` stays as declared.** The sync and backup paths genuinely carry an
account row and genuinely require these fields; loosening the type to match the
wire's tolerance would push the leniency into code that should not have it.

## Consequences

- The three silent failures become impossible, and the schema a model reads is short
  enough that writing an envelope by hand is a reasonable thing to ask of one. That
  is what makes the link and the file paths work for assistants we never packaged
  for.
- **A discipline cost, app-wide: every field added to `Song` now carries a "does the
  boundary default this?" question.** Forget it and the field simply behaves as
  before for machine-written files while throwing or vanishing for hand-written
  ones — the same class of asymmetry ADR-0007's preserve-unknown rule guards
  against, at a different seam. The two rules should be read together.
- The wire format is now **more permissive than the type**, deliberately. A reader
  comparing `SnapshotData` against the schema will find them disagreeing; this
  record is the answer to why.
- **Hard to reverse.** Once the schema is public, envelopes written against it exist
  in files and in links that people keep. Tightening later breaks data already in
  the wild, so the permissiveness is effectively permanent — which is the reason it
  is written down rather than left as a defensive `??` in `parse`.
- Export/Import and Snapshot/Restore are now distinct in the glossary (`CONTEXT.md`
  §Export, §Snapshot) as well as in the code. A dropped or linked file is always an
  Import; Restore stays a deliberate act in Settings.
- Nothing downstream of `parse` changes. `migrate`, `planImport` and `applyImport`
  keep seeing complete records and stay unit-testable against plain objects.
