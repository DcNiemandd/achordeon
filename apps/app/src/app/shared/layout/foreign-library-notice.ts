// Foreign-library notice — the one ownership state worth explaining.
// Spec: ADR-0004/0009, V2-BOARD [V2-15] (a device's library belongs to one account).
//
// A library owned by a *different* signed-in account is hidden, so the list reads
// empty — which looks like the songs are gone rather than another account's,
// waiting behind a sign-in. This says so, and offers the deliberate takeover:
// replace this device's copy with the signed-in account's own library. It draws
// nothing in every other state (own library, signed out, genuinely empty), so a
// page can drop it above its list unconditionally.
//
// The takeover DELETES this device's copy of the other account's library, so it
// is behind a confirm — and the confirm escalates when that copy holds unsynced
// work, because the clear-and-pull cannot get it back (it lived only here).

import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { LibraryOwnership, SyncService } from '@achordeon/shared/data-access';
import { Button, Dialog } from '../../primitives';

@Component({
  selector: 'app-foreign-library-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Dialog],
  template: `
    @if (ownership.isForeign()) {
      <div class="notice" role="status" data-testid="foreign-library">
        <div class="text">
          <p class="lead">{{ heading }}</p>
          <p class="body">{{ explain }}</p>
        </div>
        <button
          appButton
          type="button"
          data-testid="foreign-library-replace"
          (click)="openConfirm()"
        >
          {{ replaceLabel }}
        </button>
      </div>
    }

    @if (confirming()) {
      <app-dialog
        [title]="confirmTitle"
        data-testid="foreign-library-dialog"
        (closed)="cancel()"
      >
        <p class="warn">{{ confirmBody }}</p>
        @if (foreignUnsynced()) {
          <p class="danger" data-testid="foreign-library-unsynced">
            {{ unsyncedWarn }}
          </p>
        }
        <button
          dialog-actions
          appButton
          type="button"
          variant="ghost"
          data-testid="foreign-library-cancel"
          (click)="cancel()"
        >
          {{ cancelLabel }}
        </button>
        <button
          dialog-actions
          appButton
          type="button"
          variant="danger"
          [disabled]="busy()"
          data-testid="foreign-library-confirm"
          (click)="replace()"
        >
          {{ busy() ? working : confirmButton }}
        </button>
      </app-dialog>
    }
  `,
  styles: `
    .notice {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      padding: var(--space-4);
      margin-bottom: var(--space-4);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: var(--surface-raised);
    }
    .text {
      flex: 1 1 16rem;
    }
    .lead {
      margin: 0 0 var(--space-1);
      font-weight: 600;
    }
    .body {
      margin: 0;
      color: var(--text-muted);
    }
    .warn {
      margin: 0;
    }
    .danger {
      margin: var(--space-3) 0 0;
      font-weight: 600;
      color: var(--danger);
    }
  `,
})
export class ForeignLibraryNotice {
  protected readonly ownership = inject(LibraryOwnership);
  private readonly sync = inject(SyncService);

  /** The confirm is open. */
  protected readonly confirming = signal(false);
  /** The library being replaced has changes that never reached the cloud — the
   * escalated warning, checked when the confirm opens. */
  protected readonly foreignUnsynced = signal(false);
  /** The takeover is a clear-and-pull; the button stands down while it runs so a
   * second press cannot start a second one over the first. */
  protected readonly busy = signal(false);

  protected readonly heading = $localize`:@@library.foreign.heading:These songs belong to another account.`;
  protected readonly explain = $localize`:@@library.foreign.explain:This device is signed in to a different account than the one that owns this library. Sign in as that account to see it again — or replace it with your own account's library.`;
  protected readonly replaceLabel = $localize`:@@library.foreign.replace:Use this account's library`;
  protected readonly working = $localize`:@@library.foreign.working:Replacing…`;
  protected readonly confirmTitle = $localize`:@@library.foreign.confirmTitle:Replace the library on this device?`;
  protected readonly confirmBody = $localize`:@@library.foreign.confirmBody:This deletes this device's copy of the other account's songs and songbooks and puts your account's library here instead. The other account's data stays safe in the cloud — this only clears it from this device.`;
  protected readonly unsyncedWarn = $localize`:@@library.foreign.unsyncedWarn:Some of the other account's changes on this device have never been synced. Replacing loses them for good — they are not in the cloud.`;
  protected readonly confirmButton = $localize`:@@library.foreign.confirmButton:Replace the library`;
  protected readonly cancelLabel = $localize`:@@library.foreign.cancel:Cancel`;

  protected openConfirm(): void {
    this.foreignUnsynced.set(false);
    this.confirming.set(true);
    // Ask the database whether the copy about to be cleared holds unsynced work,
    // and escalate the copy if so. Best-effort: an unreadable answer leaves the
    // plain warning rather than a false all-clear.
    void this.sync
      .hasUnsyncedRows()
      .then((unsynced) => this.foreignUnsynced.set(unsynced))
      .catch(() => this.foreignUnsynced.set(false));
  }

  protected cancel(): void {
    if (this.busy()) return;
    this.confirming.set(false);
  }

  protected async replace(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await this.sync.adoptDevice();
      this.confirming.set(false);
    } finally {
      this.busy.set(false);
    }
  }
}
