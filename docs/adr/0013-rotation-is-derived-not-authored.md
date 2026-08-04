# 13. Rotation is derived, not authored

Date: 2026-08-04

## Status

Accepted

## Context

A Song's shape is its `aspectRatio` (Song scope), which accepts `N:N`. A landscape
Song is therefore simply one that is wider than it is tall; there has never been a
"landscape" flag and the setting registry needs no new row to express one.

A landscape Song is nonetheless badly served in two places.

**On a phone.** `blank-page.ts` fits the page into the desk with
`min(100cqi, 100cqb × var(--page-ratio))`. In a portrait desk a 2.17 page fits by
_width_ and ends up occupying roughly a fifth of the screen — worse than the A4 it
was changed away from. It fills the screen only if the **viewport** turns
landscape.

**On paper.** A landscape Song scaled to fit portrait A4 (CONTEXT.md §Aspect ratio:
"the Song keeps its aspect ratio but is scaled to fit the page") leaves more than
half the sheet white.

The screen case cannot be fixed by asking the device to rotate:

- `screen.orientation.lock()` is not supported in Safari at all, and where it does
  exist it requires fullscreen — which ADR-0012 already established we cannot enter
  freely, because fullscreen disables the pinch that zoom depends on.
- The web app manifest's `orientation` applies only to an installed PWA and is
  ignored on iOS.
- And the readers who need help are exactly the ones this could never reach: a
  device with **rotation lock on** does not follow the phone, so the page stays a
  strip however it is held.

So the rotation has to be ours. The question is what kind of thing it is.

### Options

- **A — a `renderSideways` Song setting** that inverts the aspect ratio. Wrong
  twice. `aspectRatio` already decides shape, so a second control over the same
  fact only raises the question of which one wins (`297:210` plus
  `sideways: true` — portrait again?). And it does not solve the phone at all: a
  landscape page in a portrait viewport is _smaller_, not bigger.

- **B — derive it and apply it everywhere.** Rotate whenever the page and the box
  it must fill disagree about which axis is long. One rule, no state, nothing to
  sync. But it fires on a desktop with a narrow browser window, and rotated text on
  a monitor nobody can turn is strictly worse than a small page.

- **C — derive it everywhere, but let the reader arm it on screen.** Same single
  predicate; two policies over it, split on a physical fact rather than a technical
  one.

## Decision

Adopt **C**, under one rule:

> **Rotation is never authored and never stored.** It is derived from the page's
> shape against the space that page has to fill. The only thing that differs
> between a screen and a sheet is who decides whether the derivation applies —
> the reader on screen, because only they know whether their device will turn;
> nobody on paper, because a sheet always turns.

- **No `renderSideways` setting at any scope.** Shape remains `aspectRatio`'s, and
  a landscape Song is one whose ratio says so.
- **One predicate**, evaluated per render: the page's ratio and its container's
  ratio fall on opposite sides of 1, so transposing the fit gains area.
- **On screen — an armed request, not a state.** Persisted device-local in
  `UiStore` (`localStorage`, beside `isSongDarkFollowingTheme`), one flag for the
  whole Performance view, so Stage and Audience share it. It takes effect only
  where the predicate holds, which is what stops it lying: a portrait Song
  mid-setlist renders upright with the flag still armed, and the next landscape one
  is turned again. Nothing resets on a song change — unlike zoom, the phone is
  still sideways after a page turn.
- **Discovery, not automation.** The app surfaces the control when the predicate
  first goes true. It never turns the page by itself, because it cannot tell a
  phone from a narrow browser window and `_isFullscreen` already set the bar: a
  flag that lies is worse than no flag.
- **Counter-clockwise, two states.** `-90°`, matching the CCW title spine
  (`render-plan.ts:22`, `title-layout.ts:119`), so the two sideways things in
  Achordeon are read with the same turn of the head. No third state: the only
  reader of this feature is on a rotation-locked device, where `screen.orientation`
  reports the lock rather than the phone, so their preferred direction is not
  knowable without a motion-sensor permission prompt for a button.
- **On paper — automatic, no control.** A printed Song is turned whenever turning
  gains it area on the sheet.
- **Mechanically, a change of coordinate frame confined to the boundaries.** The
  transform is `rotate(-90deg) translate(pan) scale(z)` — rotation _outermost_, so
  `translate` runs in page space and pan, clamp and fit share one frame. `zoom.ts`
  is handed a `Desk` with its dimensions transposed and changes by **zero lines**,
  keeping its specs as regression cover. The screen→page delta map is a single pure
  helper, used by both the pan adapter and Stage's swipe detector.
- **`Match this screen, sideways`** joins the aspect presets: the same measurement
  `ScreenShape.detect()` already takes, with the pair swapped.

## Consequences

- The fitted size is computed twice — in CSS (`blank-page.ts`) and in `zoom.ts` —
  and both must be transposed together. The swapped `inline-size` and the
  `rotate(-90deg)` must be driven by **one** predicate, because under this
  transform the pre-rotation layout box is wider than the desk and only the
  rotation brings it back on screen. Applied separately, they are a visible bug.
- Pan and the page-turn swipe must use the **same** delta helper. If only one is
  mapped, a turned reader pans one way and turns pages another.
- The control is hidden where it cannot act, rather than shown and inert.
- A reader who turns their phone the wrong way sees the page upside down and turns
  it back. Accepted as the price of two states; a reader whose device is fixed in a
  stand or a mount is not served.
- A downloaded PDF of a landscape Song is no longer laid out the same way as an
  un-turned portrait screen shows it. That is the point, but it means the PDF is
  not a screenshot of the Performance view and never was.
- This predicate is the seed of the slot work. When a sheet later carries more than
  one Song, each slot asks this same question about its own box — the rule is
  recorded here so that work inherits it rather than inventing a second one.
