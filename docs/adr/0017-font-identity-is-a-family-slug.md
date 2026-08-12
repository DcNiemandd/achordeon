# 17. Font identity is a family slug

Date: 2026-08-11

## Status

Accepted

## Context

A font setting stores a value, and that value outlives everything around it: it
sits in every export file, every synced record, every share link, and in Songs
written by builds that no longer exist. Deciding what the value _is_ is therefore
one of the least reversible decisions in the render settings.

Two pressures arrive together.

**The catalog outgrows role names.** `titleFont` today stores `'serif' | 'display'
| 'script'` — roles — and `resolveFontChoice` maps each to exactly one family. That
works only because there are three and each _is_ its category. With a library, two
serifs exist and `'serif'` stops being a name and becomes a lie. A companion
problem: the family names live in a `switch` in `render-core` while the file paths
live in a separate constant in `data-access`, hand-synced, and a mismatch between
them produces §4.10's silent failure — the geometry describes a font the browser
never draws with.

**Custom fonts have no build-time identity.** A font the user adds (ADR-0016) is
not in any constant. It exists on one device and not another, and the same font may
be added independently on two of the user's own devices.

Four questions turn out to have one answer between them: is deleting a font
destructive; do two devices agree; can an export's receiver tell they already have
it; does re-adding a deleted font restore the Songs that used it.

## Options

- **A — Random UUID minted at add-time.** The same family added on a phone and a
  laptop gets two ids, so a Song renders differently on its owner's own two devices.
  Deletion is permanent even though the id survives in the record. An export's
  receiver can never match.
- **B — Content hash of the bytes.** Stable and self-deduplicating, but a different
  _build_ of the same family is a total stranger, and the same family uploaded by
  hand versus fetched from jsDelivr will not hash equal.
- **C — A slug of the family's own name**, taken from the font's `name` table, with
  user-added families namespaced (`custom:` prefix).

## Decision

Adopt **C**, and make the catalog an injected lookup rather than a constant.

- **Bundled families are slugs** (`crimson-text`, `oswald`, `caveat`). `'body'`
  survives on `titleFont` as its one sentinel, meaning "whatever the song is set
  in". The retired role names resolve as **lookup aliases** to the families they
  already meant, so no stored record changes and this is not a schema break under
  ADR-0007 — the same mechanism the retired `'sans'` choice already uses.
- **User-added families are `custom:<slug>`**, the slug taken from the font's own
  `name` table during ADR-0016's single add-time parse. The prefix keeps a bundled
  `lora` and a user's `custom:lora` from colliding.
- **The id names a family, never a file.** A font file is one face; a family
  accumulates faces as the user adds them.
- **The catalog is injected, not static.** Which families exist is a function of the
  device, so the pure core declares the catalog's shape and takes one as a
  parameter, and the platform supplies the bundled table merged with whatever the
  user has installed. This is the argument `fonts.ts` already makes for
  `FontResolver` — "the platform therefore injects a lookup rather than a list" —
  applied one layer up. It also folds the hand-synced pair into a single keyed
  table, since a row can now own both a family's CSS identity and its file paths.
- **A family declares its faces, and missing ones come from a donor.** Four faces
  (regular, bold, italic, bold-italic) make a family usable for body text, because
  sub-labels are italic by spec and markdown emphasis resolves to the body family's
  italic. Two faces make it title-capable. A family short of a face names a donor
  — defaulting to the body family, which is already precached and so costs nothing
  — and the settings panel shows a warning saying which face is borrowed. The
  alternative, letting the browser synthesize an oblique, cannot work: the PDF has
  no synthesis, so the screen would slant and the export would not.
- **An unknown id is preserved verbatim and warned about, never repaired.** A value
  this build's catalog does not know renders as the setting's default and is
  reported by name in the import dialog. Repairing it at the boundary would destroy
  the only evidence, and the receiver updating the app or installing the font could
  then never recover the sender's page.

## Consequences

- Deletion is **non-destructive**: the id stays in the Song, and re-adding the
  family restores it. So deletion is never blocked — the confirmation says how many
  Songs are affected and proceeds.
- Two devices that add the same family independently agree without any
  font-identity reconciliation in sync.
- An export's receiver recognises a family it already has and skips the fetch.
- Two genuinely different fonts both self-declaring the same family name collide.
  Rare, bounded, and visible to the user.
- Because a variable font can only supply its default instance (ADR-0016), it is
  simply a family short of faces, and the donor rule covers it with no special case.
- The settings registry gains a row for the donor override, and that row is in the
  export schema permanently. This is the price of letting the user change a borrowed
  face rather than only being told about it.
