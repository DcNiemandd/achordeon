# Assignment — The font library, round two

Follows [the font library](./the-font-library.md), which is implemented and
committed. Decision records: [ADR-0016](../docs/adr/0016-a-font-is-acquired-not-referenced.md),
[ADR-0017](../docs/adr/0017-font-identity-is-a-family-slug.md).
Glossary: `CONTEXT.md` §Font, §Font library, §Custom font.
Spec: `docs/PRD-RENDERING.md` §4.10.

Identifiers below are descriptions, not names. Naming is yours.

## Where things stand

The first assignment shipped across 11 commits on `feat/fonts`, plus one round of
fixes. Build, unit tests and lint were green across all nine projects at that
point, and the nine font-related Chromium e2e tests pass.

Four items came out of using it. All four have their design fork already decided —
the decisions are recorded under each item. Nothing here is implemented.

Order worth taking them in:

1. **§1** — say why a variable font imported one face. Small, self-contained.
2. **§4** — collapse the built-in rows behind a disclosure. Same file as most of §1.
3. **§3** — subset the ten bundled TTFs. Independent; has open sub-decisions.
4. **§2** — search the Google catalogue from the add dialog. The largest, and the
   one most worth grilling before any code.

The reports, verbatim:

> 1- I tried to import font, that clearly has normal and bold faces, but it imported only 1 face:
> `https://fonts.googleapis.com/css2?family=Bitcount+Prop+Single:wght,CRSV@100..900,0..1&display=swap`
> 2- I want to allow all default fonts as well, there is no aria etc.
> 3- The build-in fonts take a lot of space - Can it be compacted? Or just a note? Achordion?

---

## 1 — A variable font imports one face, and does not say why

`google/fonts` ships that family as exactly one file, and it is variable:

```
apps/app/public/fonts/google-index.json → bitcountpropsingle
  { "d": "ofl/bitcountpropsingle",
    "f": ["BitcountPropSingle[CRSV,ELSH,ELXP,slnt,wght].ttf"] }
```

No statics exist. The 100–900 the Google Fonts site offers is the `wght` **axis**,
not nine files. `filesFor` in `libs/shared/data-access/src/lib/fonts/font-url.ts`
correctly falls back to the variable file, `parseSfnt` registers its default
instance, and one face is genuinely all that can be printed — jsPDF's `addFont`
reads `glyf` and ignores `gvar`. Registering a synthetic bold would be the
screen/PDF divergence §4.10 forbids.

**The import behaved correctly and said nothing about it. The silence is the bug.**

`FontFaceRow.isVariable` is already stored
(`libs/shared/data-access/src/lib/persistence/db.ts`) and already carries a comment
explaining exactly this. `groupFamilies`
(`libs/shared/data-access/src/lib/fonts/font-library.ts`) drops it on the way to
`FontFamily`, so no UI can see it.

Carry it up to `FontFamily` in
`libs/shared/render-core/src/lib/font-catalog.ts`, and surface it where the count
already is — `FontList.faceSummary` in `apps/app/src/app/shared/fonts/font-list.ts`,
so "1 of 4 styles" gains its reason. The row's own `notice?: string` field exists
and is currently used for the licence file; decide whether it is the right home or
whether this wants its own flag.

The add dialog closes on success, so whatever is said has to be readable on the
list afterwards, not only at the moment of adding.

## 2 — All of Google Fonts, from the add dialog

"Default fonts" meant system fonts — Arial and the rest. **Rejected, for a reason
already scarred into the codebase.** `libs/shared/data-access/src/lib/download/download-service.ts`:

> The bundled body face, not jsPDF's built-in Helvetica: Helvetica is WinAnsi-encoded
> and has no `ě ř ů`, so a Czech title came out of the summary with holes in it while
> the song two pages later was perfect.

Offering Arial/Times/Courier means jsPDF's built-in base-14 in the PDF, which is
cp1252: no `ě š č ř ž ů ď ť ň`. The screen would look right and the PDF would have
holes. Metric-compatible OFL twins (Arimo, Tinos, Cousine) were offered as the safe
version of the same idea and also declined — they cost bundle weight, which fights
§3.

**Decided instead: the picker does not change, and the whole catalogue becomes
reachable through _add_.** This is the browser the first assignment deferred; its
"What this makes cheap" section is the prior art, including the one problem it
names — previewing at catalogue scale, where §5's load-on-visibility stops being
enough.

`AddFontDialog` (`apps/app/src/app/shared/fonts/add-font-dialog.ts`) grows a search
over `google-index.json`. Open questions worth settling first:

- **When the index loads.** Today `FontFetcher` fetches it lazily, only when someone
  pastes a `fonts.googleapis.com` link. A search box makes it the primary path. On
  dialog open is the obvious answer — 231 KB, once per session, never on a render
  path — but say so deliberately.
- **The index has no display names.** Rows are `{ d, f }` keyed by `familyKey`:
  lowercase, alphanumerics only, so `crimsontext` and not "Crimson Text". Either
  de-slug on the way out, which cannot recover the real capitalisation, or
  regenerate with a name per row (`apps/app/tools/gen-font-index.mjs`, run by hand,
  output committed). The second is honest and costs a little file size.
- **What a result row shows** before any bytes are fetched. It cannot show the face
  without becoming the catalogue-scale preview problem.

Adding from a result must go down the path that already exists — `filesFor` →
`jsdelivrUrl` → `FontFetcher.addFile` → `FontLibrary.add`. No second ingest.

## 3 — Subset the bundled faces to Latin + Latin-Ext

`apps/app/public/fonts` is 1.4 MB, but only **439 KB is prefetched**:
`apps/app/ngsw-config.json` prefetches `RobotoMono-*.ttf` as `body-face` and leaves
`title-faces` lazy. Hosting is GitHub Pages, so there is no `_headers` file to add
and TTFs are not gzipped on the wire — there is no compression win to buy.

Measured by walking each file's `cmap`:

| file                            | size        | glyf        | non-Latin cps        |
| ------------------------------- | ----------- | ----------- | -------------------- |
| RobotoMono-Regular / -Bold      | 85K / 86K   | 69K         | 450 of 876 (**51%**) |
| RobotoMono-Italic / -BoldItalic | 135K / 133K | 115K / 112K | 51%                  |
| Caveat-Regular / -Bold          | 251K each   | 188K        | 270 of 753 (36%)     |
| CrimsonText-Regular / -Bold     | 104K / 109K | 75K / 81K   | 227 of 675 (34%)     |
| Oswald-Regular / -Bold          | 85K / 86K   | 43K         | 349 of 850 (41%)     |

"non-Latin" is Cyrillic + Greek + Latin Extended Additional (Vietnamese).

**Decided: drop those three ranges from all ten files.** ~1.4 MB → ~750 KB, first
install 439 KB → ~230 KB. The cost was accepted knowingly: a Russian or Greek song
will print tofu, and Roboto Mono — the body face, the one always loaded — is where
that bites hardest.

Making the italics lazy was the alternative and was declined. Worth knowing why it
was a poor trade anyway: it would have cut the install to 171 KB with no glyphs
lost, but a song with sub-labels or `*emphasis*` opened offline before the italic
was ever fetched loses the face, and in the PDF a missing face is the Helvetica
hole above.

Open, and none of it decided:

- **Which tool.** `pyftsubset` (fontTools) is the standard; Python 3.12 is on the
  dev machine but fontTools is not installed. A JS subsetter avoids adding Python to
  a Node workspace. Worth one docs lookup before committing either way.
- **By hand or in the build.** The established pattern here is by hand with the
  output committed — `apps/app/tools/gen-font-index.mjs` says as much in its own
  header — and it keeps CI free of a Python step.
- **The exact ranges, written down.** `U+0000–024F` covers ASCII, Latin-1, Ext-A and
  Ext-B, which is where every Czech glyph lives. Then decide deliberately about the
  51–67 codepoints each file has in `U+2000–2BFF`: **losing a typographic quote, an
  ellipsis or an en dash would be a visible regression in ordinary lyrics**, so that
  block stays. `.notdef` and the layout tables survive too.
- **Verify, do not assume.** Re-run a cmap count over the output and confirm
  `ě š č ř ž ů ď ť ň á í é ú ó ý` all still map.
- **Licensing.** Subsetting is permitted under OFL; the reserved-name and notice
  rules still apply. `apps/app/public/fonts/OFL.txt` wants a line saying the shipped
  files are subsets.
- `ngsw-config.json` needs no change — its globs are by filename.

This probably owes an ADR. It is hard to reverse once the originals leave the repo,
surprising without context ("why does Cyrillic not print?"), and a real trade-off
with a rejected alternative on record.

## 4 — An accordion over the built-in rows

`FontList` shows the four bundled families expanded always, so the fonts a user
actually added sit underneath four rows they can do nothing with — each carries a
"Built in" badge and no delete button. Collapse the built-in ones behind a
disclosure, shut by default.

Two things to watch:

- The lazy previews are an `IntersectionObserver` over `[data-font]` nodes,
  re-observed in an `afterRenderEffect` that reads `families()`. Rows inside a
  collapsed section must not be observed, or collapsing saves the scrolling and
  still fetches ~440 KB of face. Equally the effect has to observe them **when the
  section opens**, which only happens if the open state is a signal it reads.
- `<details>`/`<summary>` unless there is a reason not to — keyboard and
  screen-reader behaviour for free, and this is a disclosure rather than a tab set.
  Check `apps/app/src/app/primitives/` for an existing one first.

---

## Practical notes

- **New `$localize` messages fail the build until translated.** The loop is
  `pnpm nx run app:sync-locales`, then fill the `null` entries in
  `apps/app/src/locale/cs.json` and delete the `stale` array, then
  `pnpm nx build app`. `nx lint` does not typecheck templates; the build does.
- **No control characters in a sentinel.** The last round shipped the add-font
  sentinel as a literal NUL, which made `setting-ui.ts` a binary file to git and
  broke Playwright's `selectOption`. It is `'@add-font'` now.
- `pnpm nx run-many -t build,test,lint --skip-nx-cache` is the full gate.
- Around 30 Chromium e2e failures are pre-existing and unrelated to fonts — they
  touch `shared/layout`, songbooks, songs and shell, none of which the font work
  modifies.
- `gen-font-index.mjs` uses the GitHub trees API, not jsDelivr: `data.jsdelivr.com`
  refuses a `google/fonts` listing with a 403, "Package size exceeded the configured
  limit of 50 MB".
- Still open from the first assignment, deliberately: which families to bundle. The
  mechanism is done, the picks are yours. The single `OFL.txt` covers all four
  current families and stops being accurate the moment a non-OFL family joins.

## Suggested skills

- **`grill-with-docs`** before §2, which is the one with real unresolved shape. It
  produced ADR-0016 and ADR-0017 for the first assignment. Grill the shape of the
  work, not the four decisions already taken.
- **`nx-workspace`** before navigating projects, targets or dependencies.
- **context7** for anything on jsPDF, svg2pdf, Dexie, Angular or the Angular service
  worker — §3 in particular should check current `ngsw-config` asset-group semantics
  rather than trusting recall.
