// Warn-before-leaving — Epic 10
// Spec: PRD-INFRASTRUCTURE.md §5, ADR-0004 (the "unsynced" warning is load-bearing).
//
// With no live channel (ADR-0004: handoff, not concurrent), an un-synced PC means
// the phone won't have the change. So when local edits have NOT reached the cloud
// for a sync-on user, closing or reloading the tab prompts a confirm. This is the
// browser half; the in-app half is `SyncService.flush()` on blur, which pushes
// before a same-tab navigation could ever strand the work.

import { DOCUMENT, Injectable, effect, inject } from '@angular/core';

/**
 * Registers a `beforeunload` guard driven by an accessor, so it stays in
 * `app/shared` under the import ladder (§3) and never imports SyncService — the
 * shell wires it to `sync.hasUnsynced()`, mirroring `ThemeApplier`.
 *
 * It also owns the other half of the question — which unloads are the app's own
 * (`reload`, `expectUnload`) — because that is the same decision seen from the
 * other side, and splitting it would leave the guard with no way to tell.
 */
@Injectable({ providedIn: 'root' })
export class WarnUnsynced {
  private readonly document = inject(DOCUMENT);
  private unsynced = false;
  /** The unload about to happen is one the app asked for — see `expectUnload`. */
  private ours = false;

  /** Start guarding: `hasUnsynced()` decides whether an unload is warned. */
  connect(hasUnsynced: () => boolean): void {
    effect(() => {
      this.unsynced = hasUnsynced();
    });
    const win = this.document.defaultView;
    win?.addEventListener('beforeunload', (event) => {
      if (this.ours || !this.unsynced) return;
      // The modern browsers' contract for "please confirm leaving": prevent the
      // default and set a (now-ignored) returnValue. The text is the browser's.
      event.preventDefault();
      event.returnValue = '';
    });
  }

  /**
   * The next unload is the app's own doing — do not warn about it.
   *
   * The warning answers "you are leaving and the other device will not have
   * this". Switching language, restoring a backup, taking an update or heading
   * off to Google are none of those: the user asked for the thing that is
   * happening, and the work is safe in IndexedDB either way — the next boot syncs
   * it, because `SyncService.init` pulls and pushes on every launch. Asking them
   * to confirm leaving a page they never chose to leave just teaches them to
   * dismiss the one prompt that does matter.
   *
   * Armed rather than permanent: if the unload never comes — a sign-in call that
   * threw before it could redirect — the guard comes back on its own, so one
   * failed click cannot disarm the warning for the rest of the session.
   */
  expectUnload(): void {
    this.ours = true;
    setTimeout(() => {
      this.ours = false;
    }, ARM_MS);
  }

  /** Reload the page as a deliberate act of the app's, warning nobody. The one
   * way the app reloads itself, so a fifth caller cannot forget the first half. */
  reload(): void {
    this.expectUnload();
    this.document.defaultView?.location.reload();
  }
}

/** How long an expected unload stays expected. Long enough for any navigation to
 * actually begin, short enough that a redirect that never happened is forgotten
 * before the user could reach for the tab's close button. */
const ARM_MS = 5000;
