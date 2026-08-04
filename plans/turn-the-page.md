# Assignment — Turn the page

Decision record: [ADR-0013](../docs/adr/0013-rotation-is-derived-not-authored.md).
Glossary: `CONTEXT.md` §Performance view, §Turn the page, §Aspect ratio.

Identifiers below are descriptions, not names. Naming is yours.

## Scope

Reading a landscape Song on a device held sideways, and printing one without
wasting half the sheet. **No new render setting.** Rotation is derived from one
predicate everywhere it happens.

Out of scope: slots / two Songs on a sheet (see the last section).

## The predicate

The page's ratio and the ratio of the box it must fill fall on opposite sides of
1 — transposing the fit gains area. One implementation, shared by everything
below. It is the only thing that decides whether a rotation happens.

## 1 — The armed flag

`apps/app/src/app/shared/layout/ui-store.ts`

A device-local boolean beside `isSongDarkFollowingTheme`: persisted to
`localStorage`, in the persisted state shape, restored in the same reader, absent
in older stored state resolving to off. One flag for the whole Performance view —
Stage and Audience read the same one. It is **armed**, not applied: it never
resets on a song change, and it means nothing on its own until the predicate holds.

## 2 — The frame change

A pure helper mapping a screen-space delta into page space for a `-90°` page
(`dx, dy → dy, -dx`). No DOM, no Angular. Two callers, and both are required:

- `apps/app/src/app/shared/layout/page-zoom.ts` — pointer deltas before they reach
  the zoom maths.
- `apps/app/src/app/stage/stage-perform.page.ts` — the swipe detector, which today
  counts horizontal travel only (`SWIPE_MIN` at line 41). Unmapped, a turned
  performer swipes and nothing happens.

## 3 — The frame

`apps/app/src/app/shared/layout/blank-page.ts`

- A new input: is this page turned. The component decides nothing about _whether_
  — callers apply the predicate.
- Turned, `.page` fits the **transposed** desk:
  `min(100cqb, 100cqi * var(--page-ratio))` in place of the current
  `min(100cqi, 100cqb * var(--page-ratio))` at line 82.
- The transform becomes `rotate(-90deg) translate(...) scale(...)` — rotation
  **outermost**, so `translate` stays in page space. Keep the existing "no
  transform at all while fitted" behaviour when there is nothing to apply.
- The swapped `inline-size` and the rotation must come from the **same** flag in
  the template. Under this transform the pre-rotation box is wider than the desk;
  only the rotation brings it back on screen. State this in a comment.

## 4 — Zoom, unchanged

`apps/app/src/app/shared/layout/zoom.ts` **is not edited.** Its callers hand it a
`Desk` with `width` and `height` swapped when turned; the fit at lines 146–147 and
the clamps at 148–149 then produce page-space results that match the transform.
If this file needs a change, the transform order in step 3 is wrong.

## 5 — Control and discovery

`apps/app/src/app/shared/layout/stage-bar.ts`, `audience-bar.ts`

- A toggle beside the dark page and Hide chords, whose **icon changes with the
  state** the way the dark-page button's does.
- Icon: a screen with a rotating arrow. `icon-set.generated.ts` has nothing
  matching — add a glyph to the icon source and regenerate, composing the two
  shapes if no single one fits.
- Hidden where it cannot act (the predicate false), not shown and inert.
- Discovery: when the predicate first goes true, surface the control. The bar
  auto-hides in fullscreen, so a badge alone is invisible exactly when it matters —
  it needs to be something transient that reaches the reader. **Wording and
  lifetime (once ever / once per session / every time) are still open.**

## 6 — The preset

`apps/app/src/app/shared/settings-panel/aspect-options.ts`,
`apps/app/src/app/shared/layout/screen-shape.ts`

`Match this screen, sideways` in the `This device` group — a second sentinel
beside `MATCH_SCREEN = '@screen'`, resolved by `ScreenShape.detect()` swapping the
measured pair before `formatAspectRatio`. Both existing invariants must survive:
every option value appears exactly once, and a sentinel fails
`tryParseAspectRatio`.

## 7 — Paper

The PDF/print path turns a Song a quarter whenever the predicate holds against the
sheet. Automatic, no control, no setting. The songbook preview must show what will
print.

## 8 — Tests

Everything, per the request:

- The predicate — pure, table-driven over ratio pairs including the degenerate ones
  (square, zero, non-finite) that `zoom.ts`'s own `isUsable` guard already treats
  as unusable.
- The frame-change helper — pure, DOM-free, in the shape of `zoom.spec.ts`.
- `UiStore` — persistence, restore, and absence in older stored state.
- `blank-page` — that the swapped `inline-size` and the rotation come from one
  flag, and that an unturned page is byte-identical to today's output.
- `page-zoom` — pan direction under rotation.
- `stage-perform` — a swipe turns the page while turned.
- `screen-shape` — the swapped measurement, including the iOS non-swapping branch
  `isLandscape` already corrects for.
- `aspect-options` — the two invariants above, with the new row.
- Print — a landscape Song is rotated on portrait paper and a portrait one is not.
- e2e — the toggle appears in Stage and in Audience, and does nothing on a desktop
  viewport.

## 9 — i18n

`$localize` with `@@` ids for the toggle, the discovery wording, and the preset
row; `cs` alongside `en`.

## Done when

`pnpm nx build app` passes (lint does not typecheck templates), the suites above
are green, and a landscape Song on a rotation-locked portrait phone fills the
screen when turned.

---

## Deferred — slots

Settled in the grill, to be designed next; recorded so it is not re-derived.

- A Song declares a **width share** of a sheet: `1`, `0.5`, `0.75`, `0.25`, `1/3`,
  `2/3`. Per Song, never per Songbook — "this song only needs half a page" is a
  fact about the song, and imposition-for-the-whole-book is the printer's job.
- **Max two Songs per sheet.** Two pair when their shares sum to at most 1. Unequal
  shares are allowed and give unequal **columns** — `0.75 + 0.25` is the same
  arrangement as `0.5 + 0.5` at a different width.
- The cut is **vertical**: two columns, side by side.
- **Order is never changed.** Greedy and adjacent-only, walking the Songbook's
  entries front to back — `entities.ts:30`, "a stored book's order IS its content".
  A half followed by a full leaves the rest of that sheet blank, and that is
  accepted. Every lookahead strategy is a reordering strategy in disguise.
- Not a render setting: a share changes nothing about the drawn page, only where
  that page is placed. Same test `allSongsOrder` failed at `entities.ts:78-84`, so
  it stays out of the `SETTINGS` registry — an optional field on `Song`, additive
  and lossless under ADR-0007, no migration, no `SCHEMA_VERSION` bump.
- **One page number per sheet.** A page number numbers the sheet, not the Song, and
  it does not rotate with a Song inside it. The one unresolved case is
  `pageNumberPosition: 'before-title'`, which puts the number into a Song's heading
  — two Songs on a sheet would both claim it.
- Each slot applies ADR-0013's predicate to its own box, inheriting the rotation
  rule rather than restating it.
