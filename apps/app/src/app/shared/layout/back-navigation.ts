// Going back — Epic 13
// Spec: PRD-UI-SHELL.md §4 (Settings is a destination, not a peer)

import { Injectable, effect, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { NAV_ITEMS } from './nav-items';

/**
 * "Take me back to what I was doing."
 *
 * **Browser history first.** It is the only thing that knows what you were
 * actually doing: an in-app `back()` returns you to the *song you were editing*,
 * scrolled where you left it and with its query params intact. A hand-rolled
 * "last module" could only ever return you to that module's list — technically
 * a place you had been, but not the place you left.
 *
 * **The catch history alone cannot cover:** you may have arrived here with no
 * history to go back into — a bookmark, a shared link, a reload, a fresh tab.
 * `Location.back()` would then walk *out of the app*, which is a much worse
 * outcome than landing somewhere sensible. So this counts the in-app navigations
 * it has seen: at least one, and back is safe; none, and it falls forward to the
 * last module you were in (Songs, if that is also unknown).
 *
 * The counter is the whole reason this is a service rather than a call to
 * `Location.back()` at the point of use, and it has to be **alive from boot** to
 * do the counting — the shell injects it for exactly that.
 */
@Injectable({ providedIn: 'root' })
export class BackNavigation {
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  /** In-app navigations since load. `> 0` means history has somewhere to go. */
  private readonly depth = signal(0);
  /** Songs is the fallback: it is the first nav item and the app's home. */
  private readonly lastModule = signal(NAV_ITEMS[0].route);

  constructor() {
    // An effect, not a computed [trap]: a computed is lazy, so it would only see
    // the navigations that happen while something is reading it — and the only
    // reader is a page that does not exist until you are already on it. It
    // counted nothing.
    effect(() => {
      const finalUrl = this.router.lastSuccessfulNavigation()?.finalUrl;
      if (!finalUrl) {
        return;
      }
      const url = this.router.serializeUrl(finalUrl);
      this.depth.update((n) => n + 1);
      const match = NAV_ITEMS.find((item) => url.startsWith(item.route));
      if (match) {
        this.lastModule.set(match.route);
      }
    });
  }

  /**
   * Step back out of a destination.
   *
   * The first navigation of a session is the one that *landed* you here, so it
   * is not somewhere to go back to — hence `> 1` rather than `> 0`.
   */
  back(): void {
    if (this.depth() > 1) {
      this.location.back();
      return;
    }
    void this.router.navigateByUrl(this.lastModule());
  }
}
