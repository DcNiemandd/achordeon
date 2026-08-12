# 18. The bundled faces ship subset

Date: 2026-08-12

## Status

Accepted

## Context

The app bundles ten static TTFs — four Roboto Mono faces and two each of Crimson
Text, Oswald and Caveat (ADR-0017). They are static rather than variable because
jsPDF's `addFont` reads `glyf` and ignores `gvar`, so a variable file would embed
as its default instance only and a bold title would print unbold (ADR-0016).

Together they are 1.3 MB on disk. That number is not the interesting one. The
service worker prefetches only the body family, `RobotoMono-*.ttf`, and leaves
the title faces lazy — so what a cold install actually pays for before it can
draw anything is **439 kB of font**.

Against a first load of 262 kB of JavaScript that arrives gzipped as 75 kB. The
app is hosted on GitHub Pages, which does not compress a TTF and offers no
`_headers` file to make it, so those 439 kB arrive uncompressed. Fonts are
roughly six times the weight of the whole application on the wire, and there is
no compression lever left to pull.

Walking each file's `cmap` says where the bytes are:

| file                            | size        | non-Latin codepoints |
| ------------------------------- | ----------- | -------------------- |
| RobotoMono-Regular / -Bold      | 85K / 86K   | 450 of 876 (**51%**) |
| RobotoMono-Italic / -BoldItalic | 135K / 133K | 51%                  |
| Caveat-Regular / -Bold          | 251K each   | 270 of 753 (36%)     |
| CrimsonText-Regular / -Bold     | 104K / 109K | 227 of 675 (34%)     |
| Oswald-Regular / -Bold          | 85K / 86K   | 349 of 850 (41%)     |

"non-Latin" being Cyrillic, Greek and Latin Extended Additional (Vietnamese).
Half of the one file every install is required to download is alphabets the app
has no interface language for and no user has yet asked for.

## Options

- **A — Leave them whole, write the measurement down.** Costs nothing, loses
  nothing, and the first install stays six times heavier than the app.
- **B — Move the italics out of `prefetch`.** No tool, no glyph lost, and the
  first install drops to 171 kB, which is better than any subset achieves. But a
  song with a sub-label or a markdown `*run*`, opened offline before the italic
  was ever fetched, loses the face — and a missing face in a PDF is the
  Helvetica hole that `download-service` already carries a scar about. It trades
  a coverage problem for a correctness one.
- **C — Ship variable files instead.** Three of the four families are published
  upstream only as variable now. Measured, they are not smaller than four
  subset statics, and the default-instance limit above means Oswald and Caveat
  would print no bold at all. Turning them back into statics needs an instancing
  step, which is strictly more tooling than subsetting is.
- **D — Subset the ten files to the Latin ranges.**

## Decision

Adopt **D**. Keep `U+0000-024F`, `U+0300-036F` and `U+2000-2BFF`; drop
everything else. 1.3 MB becomes 766 kB and the prefetch becomes 213 kB.

- **`0000-024F`** is ASCII, Latin-1, Latin Extended-A and Latin Extended-B —
  every Czech letter, and every other Latin-alphabet language the interface
  could plausibly grow.
- **`0300-036F`**, the combining marks, because a font is free to build `ě` as a
  composite and mark positioning needs the components present.
- **`2000-2BFF`**, punctuation and symbols, kept **whole** rather than picked
  over. The entire span is only 51-67 codepoints in any of these files, and
  losing one curly quote, one ellipsis or one en dash would be a visible
  regression in ordinary lyrics.

**Cut by hand, output committed, in place** — `apps/app/tools/subset-fonts.mjs`,
the same convention as `gen-font-index.mjs`. A lossy transform is a decision, not
a build step, and a build that silently deleted glyphs would be one. The tool is
harfbuzz compiled to wasm (`subset-font`), which is the engine Google Fonts
itself serves subsets with; fontTools would have been the other reference
implementation but adds a Python toolchain to a Node workspace for a transform
that runs once a year.

The tool **verifies rather than assumes**: it reads each output file's `cmap`
back and fails if any of `ě š č ř ž ý á í é ú ů ď ť ň ó`, their capitals, or the
typographic quotes, ellipsis and dashes stopped mapping. A retained set is a
request; what survives is whatever the font had in that range to begin with, and
the failure is silent until someone prints a PDF.

## Consequences

- A cold install fetches 213 kB of font instead of 439 kB, and the whole folder
  is 766 kB instead of 1.3 MB.
- **A Russian or Greek song prints tofu**, in every family, including the body
  face that is always loaded. This is the price and it was accepted knowingly.
  Undoing it is restoring the originals and re-running nothing.
- Re-cutting with different ranges means restoring the originals first, since
  subsetting a subset can only take more away. They are in this repo's git
  history and in `google/fonts`.
- The OFL is satisfied: subsetting is a permitted modification, name IDs 0, 13
  and 14 — copyright, licence text, licence URL — are preserved in every file,
  `apps/app/public/fonts/OFL.txt` says the shipped files are subsets, and none of
  these four families carries a Reserved Font Name, so they keep their own names.
- `ngsw-config.json` needs no change: its asset groups match by filename.
- Adding a family to the bundle now has a step — cut it before committing it —
  and a family that arrives uncut is not wrong, only heavy.
