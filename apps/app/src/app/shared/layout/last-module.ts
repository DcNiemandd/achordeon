// Last module — Epic 13
// Spec: PRD-UI-SHELL.md §4 (Settings is a destination, not a peer)

import { Injectable, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NAV_ITEMS } from './nav-items';

/**
 * The module you were in before you stepped out of the four.
 *
 * Settings is **a destination, not a peer** (§4): you go there to change
 * something and then come back to what you were doing. "Back" therefore has to
 * name a place, and the router cannot say — `lastSuccessfulNavigation` is the
 * navigation you are on, not the one before it, and Angular exposes no history
 * beyond that. So this remembers.
 *
 * Reads the router's own signal rather than subscribing (keeping the no-RxJS
 * rule, PRD-INFRASTRUCTURE.md §3).
 *
 * **An `effect`, not a `computed`** [trap]: a computed is lazy, so it only ever
 * sees the navigations that happen to occur while somebody is reading it — and
 * the only reader is the Settings page, which does not exist until you are
 * already there. It recorded nothing and always answered "songs". Tracking has
 * to be eager, which also means the service has to be **alive from boot**: the
 * shell injects it for exactly that reason.
 *
 * Not persisted. After a reload there is no "where you were" to return to, and
 * the fallback is the honest answer.
 */
@Injectable({ providedIn: 'root' })
export class LastModule {
  private readonly router = inject(Router);

  /** Songs is the fallback: it is the first nav item and the app's home. */
  private readonly lastRoute = signal(NAV_ITEMS[0].route);

  constructor() {
    effect(() => {
      const finalUrl = this.router.lastSuccessfulNavigation()?.finalUrl;
      const url = finalUrl
        ? this.router.serializeUrl(finalUrl)
        : this.router.url;
      const match = NAV_ITEMS.find((item) => url.startsWith(item.route));
      if (match) {
        this.lastRoute.set(match.route);
      }
    });
  }

  /** Where "back" should go. */
  route(): string {
    return this.lastRoute();
  }
}
