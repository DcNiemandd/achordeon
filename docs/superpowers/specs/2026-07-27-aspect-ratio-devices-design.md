# Aspect ratio: more shapes, this device, and a device list

Date: 2026-07-27

## Problem

`aspectRatio` offers six presets (`A4`, `1:1`, `16:9`, `16:10`, `4:3`, `3:4`) plus a
free-text field. Two things are missing:

1. **"I want the song to fill my screen."** The user's own device shape is the single
   most useful value the setting can hold, and today the only way to reach it is to
   look up a spec sheet and type a fraction.
2. **"I know the device, not the ratio."** Someone rendering for a bandmate's tablet
   knows the word "iPad", not `41:59`.

The current preset list explicitly refuses device names:

> **Named ratios only — no device names.** A row like "Galaxy Tab S11" claims an exact
> spec, and a wrong one is invisible: the song just renders cropped and nobody notices.

That objection is real and this design answers it rather than ignoring it (see
_Keeping the device rows honest_).

## Decisions

| Question         | Decision                                                                                                                                                                                                         |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What is measured | The **physical screen** (`screen.width × screen.height`), not the visible render box. Stable, and identical in a browser tab and an installed PWA.                                                               |
| What is stored   | The **exact reduced fraction** — `393×852 → "131:284"`. No snapping to marketing ratios, no rounded decimal.                                                                                                     |
| Detection is a…  | **an action, not a mode.** Picking it computes a value and stores that value. A phone that sets `131:284` syncs `131:284` to the desktop — never a "this device" token that would re-resolve to the wrong shape. |
| Orientation      | **As currently held.** No portrait normalisation; detect the way you will hold it.                                                                                                                               |
| Device list UI   | The **existing control's `<select>`, with `<optgroup>`s.** No new component; the native mobile picker is already a good long list.                                                                               |
| List breadth     | **~29 rows**, one per family that shares a shape.                                                                                                                                                                |

## Data: one grouped list, three kinds of claim

`ASPECT_PRESETS` leaves `setting-ui.ts` (already ~280 lines) for a sibling
`aspect-options.ts`, and becomes grouped:

| Group       | Rows                                                                                       | The row claims            |
| ----------- | ------------------------------------------------------------------------------------------ | ------------------------- |
| This device | `Match this screen`                                                                        | nothing — it is an action |
| Paper       | `A4 (210:297)`, `Letter (17:22)`                                                           | true by definition        |
| Portrait    | `9:19.5`, `9:16`, `5:8 (Galaxy Tab)`, `2:3 (Surface Pro)`, `3:4 (iPad 9.7", 10.2")`, `1:1` | true by definition        |
| Landscape   | `21:9`, `16:9`, `16:10`, `3:2`, `4:3`                                                      | true by definition        |
| Phones      | 11 rows — `iPhone 14 Pro, 15, 16 (131:284)`, `Pixel 6, 7, 8 (412:915)`, …                  | a spec claim              |
| Tablets     | 4 rows — `iPad Air 11", iPad 10.9" (41:59)`, …                                             | a spec claim              |

No laptop group: laptop shapes **are** the named landscape ratios, so a device row
there would add a name and no information.

### Keeping the device rows honest

Two properties, both deliberate:

- **A device row's value is exactly what "Match this screen" writes on that device** —
  the reduced CSS-px screen fraction, not the marketing ratio. So `iPhone 15` is
  `131:284`, not `9:19.5`. This makes a wrong row **checkable by anyone holding the
  device**: pick the row, pick "Match this screen", compare. That is the answer to
  "a wrong one is invisible".
- **Every row's value is unique across the whole list.** Two `<option>`s sharing a
  value would make the picker display the first one's label after the second was
  chosen — picking "Galaxy S24" and being shown "iPhone 13 mini". Where several
  families share a shape they share one row (`iPhone 12/13 mini, Galaxy S21–S25`), and
  where a device's exact shape _is_ a named ratio the device names ride along on the
  named row (`3:4 (iPad 9.7", 10.2")`) instead of getting a duplicate row.

Every label carries its ratio, so the claim is visible without picking it.

Device names are proper nouns and are **not** `$localize`'d; group labels are. Values
come from measured CSS-px viewports (yesviz.com), cited in the file header. Note that
modern phone rows differ by well under 1% from one another — that is a property of the
hardware, not a rounding bug, and the rows stay separate because the user finds their
row by name, not by comparing fourth decimal places.

## Detection: a formatter in render-core, a probe in the app

Split so the arithmetic is testable without a DOM.

- **`formatAspectRatio(width, height)`** joins `render-core/aspect.ts` as the inverse of
  `tryParseAspectRatio` — GCD-reduce to `` `${number}:${number}` ``, `null` for
  non-finite or non-positive input, unreduced for non-integers (still exact). Same file
  because it is the same knowledge: what a legal aspect value looks like.
- **`ScreenShape`** (`shared/layout/`, `providedIn: 'root'`) reads
  `DOCUMENT.defaultView.screen` and feature-detects it, following `Viewport`'s shape.
  `detect(): AspectRatio | null` — `null` under jsdom or any host without `screen`, and
  the panel then omits the row rather than offering a button that does nothing.

The panel calls `detect()` twice for different questions: once at construction to
decide whether the row exists at all, and again at click time for a value that is
current for the orientation the device is in _now_.

## Control: `select` learns optgroups, plus one sentinel

```ts
export interface OptionGroup {
  readonly label: string;
  readonly options: readonly Option[];
}
// `select` only — a segmented `choice` row has no groups.
| { kind: 'select'; options: readonly (Option | OptionGroup)[]; custom?: boolean }
```

`titleFont` is untouched: a flat list is still valid, and the panel normalises flat to
"one group with no label" so the option markup is written once for both the closed
select and the collapsed picker.

"Match this screen" is an `<option>` with the value `'@screen'`. `onPick` intercepts it,
calls `ScreenShape.detect()`, and stores **that** — the sentinel is never written. `@`
can never parse as a ratio, so even if it reached the text field, the existing
`validate` rejects it.

The panel gains one injected service. Its doc comment says it holds no state and
injects no store; a browser-capability probe is neither, and the comment will say so.

## Tests

- `aspect.spec.ts` — `formatAspectRatio` reduction, degenerate input, non-integers, and
  a round trip: `tryParseAspectRatio(formatAspectRatio(w, h)) ≈ w / h`.
- `screen-shape.spec.ts` — reduces a stubbed `screen`, and returns `null` when absent.
- `aspect-options.spec.ts` — every row's value parses via `tryParseAspectRatio`, values
  are unique across all groups, no group is empty, and every device row names its ratio.
- `settings-panel.spec.ts` (new) — picking a device row emits its ratio; picking
  `@screen` emits the probe's value and never the sentinel; the row is absent when the
  probe returns `null`; `titleFont`'s flat list still renders.
- e2e `settings.spec.ts` — pick "Match this screen" and assert the field holds a `w:h`
  derived from the real `window.screen` in-page.

## Out of scope

- A search/filter field over the device list (the native picker types-to-jump).
- A flip/transpose control for ratios.
- Any change to how the renderer consumes `aspectRatio` — `tryParseAspectRatio` already
  accepts every value this design can produce.
