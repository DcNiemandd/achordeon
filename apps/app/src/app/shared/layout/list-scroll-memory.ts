// Where a module list's scroll waits out a trip into a detail screen — Epic 13
// Spec: PRD-UI-SHELL.md §7 (the URL is a screen's state; this is the part of it
// that is not in the URL)

import { Injectable } from '@angular/core';

/** The lists that remember where they were. One slot each — you are only ever
 * in the middle of one of them. */
export type ListScope = 'songs' | 'songbooks';

/** A list's scroll, and the list it was measured on. */
interface ListScroll {
  /** The list URL it belongs to — search, sort and all. A restore is refused
   * unless you come back to that same URL, because `?q=blue` scrolled to row 200
   * says nothing about where row 200 is in the unfiltered library. */
  readonly url: string;
  /** How far the list was scrolled, in px. */
  readonly offset: number;
}

/**
 * How far the Songs and Songbooks lists were scrolled when you left them for a
 * song or a songbook — so pressing **Back** in the editor or the builder puts
 * you back on the row you opened, not at the top of a list you had scrolled
 * three hundred rows into.
 *
 * **Above both features, like `ReturnUrl`.** The two modules do the same thing
 * for the same reason, and a service one of them owned would be a sibling the
 * other had to reach across for (features are folders here, and a folder does
 * not import its neighbour). It is the twin of the URL that `ReturnUrl` holds:
 * that one says *which list*, this one says *where in it*.
 *
 * **Not localStorage** — it is one round trip's memory, not a saved preference
 * (the same reasoning as `ReturnUrl` and `SongbookViewMemory`): a reload has no
 * trip to return from and should open the list at the top.
 */
@Injectable({ providedIn: 'root' })
export class ListScrollMemory {
  private readonly scrolls = new Map<ListScope, ListScroll>();

  /** Stash a list's scroll before leaving it. Capturing again overwrites: there
   * is only ever one trip in progress per list. */
  capture(scope: ListScope, url: string, offset: number): void {
    this.scrolls.set(scope, { url, offset });
  }

  /**
   * Take back the offset for `url`, if there is one — and **consume it**, so a
   * later plain visit to the same list starts at the top rather than re-applying
   * a position the user has long since left. Null when there is nothing to
   * restore, or when the list came back under a different query.
   */
  take(scope: ListScope, url: string): number | null {
    const scroll = this.scrolls.get(scope);
    if (!scroll || scroll.url !== url) {
      return null;
    }
    this.scrolls.delete(scope);
    return scroll.offset;
  }
}
