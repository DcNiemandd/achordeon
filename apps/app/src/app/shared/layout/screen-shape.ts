// Screen shape — the device's own aspect ratio
// Spec: PRD-RENDERING.md §4.1 (render box shape = `aspectRatio`, always user-owned)

import { DOCUMENT, Injectable, inject } from '@angular/core';
import { formatAspectRatio } from '@achordeon/shared/render-core';

/**
 * What shape is the screen this is running on?
 *
 * **The physical panel, not the visible page.** `screen` is stable: it answers
 * the same in a browser tab, in an installed PWA, and with the URL bar hidden or
 * shown, so "match this screen" gives the same value however the app was opened.
 * The render box's own measurements would be more precise about *this* moment and
 * useless as a saved setting — two taps a second apart could disagree.
 *
 * **A reading, not a subscription.** Every caller wants the shape at the instant
 * of a tap, and the answer is stored as a plain ratio from then on (a device that
 * sets 131:284 syncs 131:284, never a "this device" token that would re-resolve
 * to the wrong shape on a desktop). So there is no signal here and nothing to
 * keep in sync on rotation — ask again and get the current orientation.
 *
 * **In the orientation it is held**, which takes work: the two dimensions cannot
 * be trusted to be in that order (`isLandscape`).
 */
@Injectable({ providedIn: 'root' })
export class ScreenShape {
  private readonly document = inject(DOCUMENT);

  /**
   * The screen's ratio as an `aspectRatio` value, or `null` where there is no
   * screen to measure — jsdom, and any non-browser host. Callers are expected to
   * hide the affordance rather than offer a button that does nothing.
   *
   * Feature-detects `screen` itself rather than trusting `defaultView`, for the
   * same reason `Viewport` feature-detects `matchMedia`: the view can exist with
   * the API missing.
   */
  detect(isSideways = false): `${number}:${number}` | null {
    const view = this.document.defaultView;
    const screen = view?.screen;
    if (
      typeof screen?.width !== 'number' ||
      typeof screen.height !== 'number'
    ) {
      return null;
    }

    // Swap only when the box and the orientation disagree — see `isLandscape`.
    // `isSideways` then asks for the OTHER orientation, so the two decisions
    // compose into one swap or none rather than fighting over the same pair:
    // a phone held upright answers 131:284, and sideways 284:131, whichever way
    // round this platform happened to report the panel.
    const landscape = view ? isLandscape(view, screen) : null;
    const wide = screen.width > screen.height;
    const asHeld = landscape === null || landscape === wide;
    return asHeld !== isSideways
      ? formatAspectRatio(screen.width, screen.height)
      : formatAspectRatio(screen.height, screen.width);
  }
}

/**
 * Is the screen currently held the wide way round? `null` when nothing will say.
 *
 * **This exists because `screen.width`/`height` do not agree across platforms.**
 * Safari on iOS reports the panel's *physical* dimensions and leaves them alone
 * when the device turns; Chrome on Android swaps them. So the same iPhone held
 * sideways measures as portrait while a Galaxy measures as landscape, and "the
 * orientation you are holding it in" — which is the whole promise of the button —
 * quietly stopped applying to iPhones. The CSS Working Group has resolved that the
 * values should swap; until Safari does, this is the correction.
 *
 * Asked of the *screen*, never the window. `matchMedia('(orientation: landscape)')`
 * would have been simpler and wrong: it describes the shape of the viewport, so a
 * tall narrow window on a wide monitor would report portrait and transpose a
 * display that was never rotated.
 *
 * `screen.orientation` is the standard answer (Safari has it from 16.4). The
 * deprecated `window.orientation` is a number and iOS-only, which is exactly the
 * set of browsers old enough to need it.
 */
function isLandscape(view: Window, screen: Screen): boolean | null {
  const type = screen.orientation?.type;
  if (typeof type === 'string') {
    return type.startsWith('landscape');
  }
  const legacy = (view as { orientation?: unknown }).orientation;
  if (typeof legacy === 'number') {
    return Math.abs(legacy) === 90;
  }
  return null;
}
