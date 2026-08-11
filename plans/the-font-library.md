# Assignment — The font library

Decision records: [ADR-0016](../docs/adr/0016-a-font-is-acquired-not-referenced.md),
[ADR-0017](../docs/adr/0017-font-identity-is-a-family-slug.md).
Glossary: `CONTEXT.md` §Font, §Font library, §Custom font, §Render settings.
Spec: `docs/PRD-RENDERING.md` §4.10, `docs/PRD-INFRASTRUCTURE.md` §7, §8.

Identifiers below are descriptions, not names. Naming is yours. The two exceptions
are `bodyFont` and `italicFont`, which were settled as registry keys during the
grill.

## Scope

Two things the user asked for, which turn out to be one: a place to change the
font of the lyrics, and a library to change it _to_ — including fonts the user
brings themselves, by file or by link.

Out of scope: an in-app browser over the whole Google Fonts catalog (§9 explains
why it becomes cheap once this lands); woff/woff2 support; a separate chord face.

## The shape

Three seams carry everything. Get them right in §2 and the rest is filling in.

- **A font id is a family slug**, and the retired role names are aliases to it.
- **The catalog is injected**, so a user-added family is an ordinary row rather
  than a second code path.
- **A URL is acquired once, not referenced**, so a link becomes bytes on the
  device before the font is ever selectable.

---

## 1 — The body font setting

`libs/shared/domain/src/lib/settings.ts` — the commented-out row at the bottom.

`bodyFont`, scopes `['songbook','song']`, defaulting to the family the tuning
already names. It governs everything but the title block; §4.10 says why.

The row is free to add and free to name **right now** and never again: nothing is
stored under it yet, so this is not a schema change under ADR-0007. After it ships
a rename costs a migration.

`libs/shared/render-core/src/lib/context.ts:62` currently resolves the title's face
against tuning. The body face has to resolve the same way, from the same resolved
settings, or `titleFont: 'body'` keeps pointing at a constant instead of at the
setting the user just changed.

`apps/app/src/app/shared/settings-panel/setting-ui.ts` is an exhaustive record over
the registry keys — a key without a UI row will not compile. That is the guardrail
that makes "there is nowhere to change it" structurally impossible, and it is why
this step cannot be half-done.

## 2 — Slugs, and one catalog

`libs/shared/render-core/src/lib/font-catalog.ts` +
`libs/shared/data-access/src/lib/render/font-loader.ts:33`

Today the family names live in a `switch` in the pure library and the file paths
live in a constant in the platform library, hand-synced. A typo between them draws
a font nobody loaded, silently. Fold them into **one keyed table, one row per
family**, carrying: display label, category, the CSS family name it is measured and
emitted under, its fallback stack, which faces it has, where its bytes are, its
donor if it is short a face, and its license.

Then invert the dependency. The pure library declares the catalog's shape and takes
one as a parameter; the platform supplies the bundled table merged with whatever the
device has. `fonts.ts:27-36` already argues this for the byte resolver — the same
sentence with "families" for "faces".

Two consumers need different things from it and both are load-bearing: resolution
by id (layout, emit, PDF) and enumeration (the picker, the import warning).

The role names `'serif' | 'display' | 'script'` become aliases resolving to the
families they already meant. No stored record changes. The existing `'sans'` note
in `settings.ts:37-40` is the precedent and the wording to follow.

## 3 — Faces a family does not have

The tier rule and the donor, both derived from the catalog row so they cannot drift
from the bytes.

Four faces → offered for `bodyFont` and `titleFont`. Two → `titleFont` only, unless
a donor covers the rest. The reason is in §4.10: sub-labels are italic and markdown
emphasis resolves to the body family's italic, and `buildFontBook` **drops** a
face with no bytes (`fonts.ts:106`), so a missing italic means slanted lyrics on
screen and upright ones in the PDF.

The donor defaults to the body family — already precached by `ngsw-config.json`, so
it costs nothing to borrow from. `italicFont` is the registry row that lets the user
override it, and the panel shows a warning naming the borrowed face whenever one is
in use. Scopes match `bodyFont`.

## 4 — More families

`apps/app/public/fonts/` + `apps/app/ngsw-config.json`

The list is yours. Each family needs its faces, its own license file, and an
attribution string — the current single `OFL.txt` covering four families stops being
accurate the moment one Apache-licensed family joins.

The service worker's `title-faces` group widens to cover the directory rather than
naming three families. It is already `installMode: lazy`, so this is the whole of
"lazily loaded even for PWA" — the body face stays prefetched, everything else
arrives on first use.

## 5 — Previews that do not cost a megabyte

`apps/app/src/app/shared/settings-panel/settings-panel.ts:670`

The effect there currently fetches every sample face when the panel opens. Four
families is fine; a library is not.

Load a row's face when the row becomes visible, and let the fallback stack cover
the gap. `FontLoader`'s in-flight map already makes repeated asks free, and the
epoch signal already re-runs the render when a face lands, so both halves exist.

One path for bundled, custom and future-browsed fonts. No special cases.

## 6 — The fonts section

`apps/app/src/app/shared/settings-panel/setting-ui.ts:67` — the group list.

A fourth group for the three font rows; the title group keeps position and layout.
The deciding reason is not taxonomy: the add-a-font affordance needs exactly one
home, and scattering the fonts across two sections leaves it without one.

"Add font…" sits at the foot of any font picker and opens one dialog — file or
link — reachable identically from a Song's panel and the global settings page. The
full list, with delete and license, lives in the settings page only.

Adding a font from inside a Song's settings changes **device** state. That is
deliberate; §8 handles what it means for a Song that travels.

## 7 — Adding a font

A new Dexie table. `db.ts` is the only thing that touches IndexedDB, and its
`.version()` is the physical store version — a new table is exactly what it is for.
Being a table is also what puts custom fonts into the whole-DB dump
(`snapshot-blob.ts:14`) for free, which is the entire backup and cross-device story.

**One parse at add-time answers everything** (ADR-0016): is this really TrueType,
what family does it call itself (→ the id), does it have an `fvar` table (→ variable,
so default instance only, so a family short of faces, so §3 covers it), and which
face is this file. Refuse anything that fails, right there, with the reason.

A file is one face. A family accumulates them. The id is the family, never the file
— §2's table already knows how to hold a family with gaps.

Deleting is always allowed; the confirmation says how many Songs are affected. The
id survives in those Songs, so re-adding the family restores them. That is what
makes the slug id worth its collision risk.

## 8 — Links, and Songs that travel

**Acquiring.** Two hosts on `connect-src`, generated into the policy by
`apps/app/tools/gen-index.mjs` beside the origins already there. A pasted `.ttf` URL
on an allow-listed host is used as-is. A Google Fonts embed URL is read for its
**query string only** — the CSS is never fetched, because Google answers it by
User-Agent and a browser cannot ask for the TrueType variant. Family names from that
query string resolve through a build-time index to a jsDelivr URL. Everything after
the fetch is §7's path, unchanged.

**The index** is generated against `google/fonts`: family → license directory →
filenames → weights → variable or static. It has to be generated because the repo
layout is irregular; probing for it would be guessing against something that moves.

**Travelling.** An export names the fonts its Songs use and, where known, where to
get them. Never the bytes — `PRD-INFRASTRUCTURE.md` §8 has the reasoning. The
receiver recognises a family it already has by id and fetches nothing.

**Arriving.** An id this build does not know is **preserved verbatim** and reported
by name. `migration.ts:18` is emphatic that settings bags are never rebuilt from a
whitelist, and the same argument applies to a value: repair it and the receiver can
never recover the sender's page by updating the app or installing the font.

The existing warning channel (`import-service.ts:41`) already means "this file knows
more than this build" — it detects unknown _keys_, and this is an unknown _value_ on
a known key, so it needs its own check. Font-specific, naming the missing fonts. Not
a general per-setting predicate; that was considered and rejected as over-built for
one case.

A file that names fonts this device lacks must not silently reach a third-party
host. Confirm in the import dialog, where ADR-0014 already puts boundary decisions.

## 9 — Documentation

`apps/docs/docs/settings.mdx:111` and its Czech mirror at `:115` already promise
"add your own fonts for titles and lyrics" as an upcoming item. Promote it, and
document the new rows beside the existing title-font entry at `:81` / `:76`.
Preserve the author's wording; add, don't rewrite. Build both locales with
`pnpm nx build docs`.

## What this makes cheap

The font browser, deferred deliberately. Once §8's index ships, a searchable list
over the Google Fonts catalog is a list view over data already present, feeding
URLs into an acquisition path already built. Its only new problem is previewing at
catalog scale, where §5's load-on-visibility stops being enough and pre-rendered
name images take over.

A separate chord face, if it is ever wanted: §2 asks the catalog per role, so it is
a registry row and a UI row, not a re-plumb.
