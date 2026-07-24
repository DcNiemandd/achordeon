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
 */
@Injectable({ providedIn: 'root' })
export class WarnUnsynced {
  private readonly document = inject(DOCUMENT);
  private unsynced = false;

  /** Start guarding: `hasUnsynced()` decides whether an unload is warned. */
  connect(hasUnsynced: () => boolean): void {
    effect(() => {
      this.unsynced = hasUnsynced();
    });
    const win = this.document.defaultView;
    win?.addEventListener('beforeunload', (event) => {
      if (!this.unsynced) return;
      // The modern browsers' contract for "please confirm leaving": prevent the
      // default and set a (now-ignored) returnValue. The text is the browser's.
      event.preventDefault();
      event.returnValue = '';
    });
  }
}
