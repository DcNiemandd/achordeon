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
//
// Controlled: the state and the takeover itself are `LibraryTakeover`'s, in
// data-access, which this folder may not touch (PRD-UI-SHELL.md §3). Each page
// binds it through its presenter.

import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { Button, Dialog, Icon } from '../../primitives';

@Component({
  selector: 'app-foreign-library-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Dialog, Icon],
  template: `
    @if (isForeign()) {
      <div class="notice" role="alert" data-testid="foreign-library">
        <app-icon class="siren" name="warning" />
        <div class="text">
          <p class="lead">{{ heading }}</p>
          <p class="body">{{ explain }}</p>
        </div>
        <button
          appButton
          variant="primary"
          type="button"
          data-testid="foreign-library-replace"
          (click)="opened.emit()"
        >
          {{ replaceLabel }}
        </button>
      </div>
    }

    @if (isConfirming()) {
      <app-dialog
        [title]="confirmTitle"
        data-testid="foreign-library-dialog"
        (closed)="cancelled.emit()"
      >
        <p class="warn">{{ confirmBody }}</p>
        @if (isUnsynced()) {
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
          (click)="cancelled.emit()"
        >
          {{ cancelLabel }}
        </button>
        <button
          dialog-actions
          appButton
          type="button"
          variant="danger"
          [disabled]="isBusy()"
          data-testid="foreign-library-confirm"
          (click)="confirmed.emit()"
        >
          {{ isBusy() ? working : confirmButton }}
        </button>
      </app-dialog>
    }
  `,
  styles: `
    /* A loud, unmistakable danger banner — a hidden foreign library is a data
       state a user must not skim past. Heavy danger border, danger-tinted fill,
       a siren icon and an accent bar down the leading edge. */
    .notice {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-4);
      margin-bottom: var(--space-4);
      border: 2px solid var(--danger);
      border-inline-start-width: 6px;
      border-radius: var(--radius-md);
      background: var(--danger-subtle);
      box-shadow: 0 0 0 1px var(--danger-subtle);
    }
    .siren {
      flex: none;
      --icon-size: 28px;
      color: var(--danger);
    }
    .text {
      flex: 1 1 16rem;
      min-inline-size: 0;
    }
    .lead {
      margin: 0 0 var(--space-1);
      font-weight: 700;
      font-size: var(--text-md);
      color: var(--danger);
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .body {
      margin: 0;
      color: var(--text);
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
  /** This device's library belongs to another account. Nothing draws otherwise. */
  readonly isForeign = input(false);
  /** The confirm is open. */
  readonly isConfirming = input(false);
  /** The library being replaced holds work that never reached the cloud. */
  readonly isUnsynced = input(false);
  /** The takeover is running. */
  readonly isBusy = input(false);

  /** The person asked to replace the library: open the confirm. */
  readonly opened = output<void>();
  readonly cancelled = output<void>();
  /** The person confirmed the replacement. */
  readonly confirmed = output<void>();

  protected readonly heading = $localize`:@@library.foreign.heading:These songs belong to another account.`;
  protected readonly explain = $localize`:@@library.foreign.explain:This device is signed in to a different account than the one that owns this library. Sign in as that account to see it again — or replace it with your own account's library.`;
  protected readonly replaceLabel = $localize`:@@library.foreign.replace:Use this account's library`;
  protected readonly working = $localize`:@@library.foreign.working:Replacing…`;
  protected readonly confirmTitle = $localize`:@@library.foreign.confirmTitle:Replace the library on this device?`;
  protected readonly confirmBody = $localize`:@@library.foreign.confirmBody:This deletes this device's copy of the other account's songs and songbooks and puts your account's library here instead. The other account's data stays safe in the cloud — this only clears it from this device.`;
  protected readonly unsyncedWarn = $localize`:@@library.foreign.unsyncedWarn:Some of the other account's changes on this device have never been synced. Replacing loses them for good — they are not in the cloud.`;
  protected readonly confirmButton = $localize`:@@library.foreign.confirmButton:Replace the library`;
  protected readonly cancelLabel = $localize`:@@library.foreign.cancel:Cancel`;
}
