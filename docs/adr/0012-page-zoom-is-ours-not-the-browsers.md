# 12. Page zoom is ours, not the browser's

Date: 2026-08-03

## Status

Accepted

## Context

A Song renders to one page that fits the screen ("one song, one page"). On a
phone that page is often small enough to be hard to read mid-verse, and the
answer everyone reaches for is to zoom in and look closer. Performing and
Audience both need it; desktop was asked for explicitly too.

The obvious move is to write no code and let the browser do it. It does not work,
and the reason is structural rather than a bug to route around.

**Browser _page_ zoom cannot touch this render at all.** The desk is
`container-type: size` and the page is `min(100cqi, 100cqb × var(--page-ratio))`
(`blank-page.ts`). Ctrl+plus shrinks the layout viewport in CSS px by exactly the
factor by which it enlarges each CSS px, so the page re-fits and lands at the
identical physical size. A fit-to-container render is immune to page zoom by
construction — and that immunity is a feature everywhere else, because it is what
keeps a song the same size on every display.

**Visual-viewport pinch does magnify it** — it is a compositor transform, not a
relayout — but it is touch-only, and the Fullscreen API disables it. Fullscreen
is where a performer spends the entire set (`Fullscreen` also carries the wake
lock and the chrome auto-hide, so it is not optional in practice).

So the platform covers exactly one cell of the grid, and it is not one of the two
that were asked for:

|             | not fullscreen       | fullscreen             |
| ----------- | -------------------- | ---------------------- |
| **touch**   | pinch works          | browser disables pinch |
| **desktop** | page zoom is a no-op | page zoom is a no-op   |

### Options

- **A — drop `requestFullscreen()` on touch, keep the mode.** `Fullscreen` is
  three things bolted together and only one of them is the browser API; the other
  two (chrome auto-hide, wake lock) are ours and already degrade gracefully where
  the API is missing (iOS phones have no element fullscreen). Android pinch comes
  back for free. Costs a URL bar for anyone running the app in a tab rather than
  installed, and still leaves desktop with nothing.

- **B — our own zoom, only inside fullscreen.** Keeps true fullscreen and covers
  the gap. But pinch then means two different things depending on a mode the user
  toggles, and the magnification has to be reset or handed over at the boundary.

- **C — our own zoom, everywhere.** `touch-action: none` on the render, and we
  own pinch, drag, double-tap, wheel and keys on that surface for good. One
  behaviour in every mode on every device. Costs a gesture arbiter, and the swipe
  that turns pages now has to share a surface with a pan.

## Decision

Adopt **Option C**. Achordeon implements its own page zoom for Stage and
Audience.

- **A view of the page, never a render setting.** It changes nothing about the
  layout, is not resolved through the Global → Songbook → Song cascade, and never
  reaches a download, a print or the Audience payload. Magnifying is looking
  closer, not re-rendering — which is why "one song, one page" survives it.
- **Ours is a `transform` on `.page`;** the desk is already `overflow: hidden`, so
  it is the window. The render is SVG (ADR-0002), so magnification re-rasterises
  as vector and stays crisp at any factor — the thing browser pinch, which
  stretches a compositor bitmap, cannot promise.
- **Device-local and unshared,** like the dark page and Hide chords: a performer's
  zoom is not pushed to the audience, and each viewer zooms their own screen.
- **Reset on every song change.** Coordinates that framed a chorus mean nothing
  in the next song, whose layout and length are different.
- **Gallery semantics**, because that is the vocabulary every user already has:
  drag pans while zoomed and the page does not turn, double-tap toggles between
  fit and 2.5× at the tapped point, pinch and wheel scale about the focal point,
  and there is no zooming out past fit.
- **The maths is pure** (`zoom.ts`) and the gestures are a thin adapter over it
  (`PageZoom`), so the part that is hard to get right is the part that is tested
  without a DOM.

## Consequences

- The render surface takes `touch-action: none`, so every gesture over it is ours
  to arbitrate — including ones we do not implement. A gesture we forget is a
  gesture that now does nothing rather than something browser-default.
- Turning the page while zoomed goes through the bar or the arrow keys. Cheap to
  reach (a tap reveals the bar) and self-limiting, since a page turn resets the
  zoom anyway.
- A magnified page needs a visible way back and a visible reason the swipe
  stopped turning pages; that is the zoom pill, which deliberately outlives the
  chrome auto-hide.
- iOS Safari needs its non-standard `gesturestart`/`gesturechange` prevented on
  top of `touch-action`, or its own pinch runs over ours on older versions.
- Browser page zoom keeps doing what it always did to the app's chrome, and keeps
  doing nothing to the song. That asymmetry is now deliberate and documented
  rather than surprising.
- Should the render ever stop being fit-to-container, the first paragraph of this
  record stops being true and the decision is worth revisiting.
