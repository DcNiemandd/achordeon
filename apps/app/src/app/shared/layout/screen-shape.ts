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
  detect(): `${number}:${number}` | null {
    const screen = this.document.defaultView?.screen;
    if (
      typeof screen?.width !== 'number' ||
      typeof screen.height !== 'number'
    ) {
      return null;
    }
    return formatAspectRatio(screen.width, screen.height);
  }
}
