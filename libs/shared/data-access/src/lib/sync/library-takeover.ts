// Library takeover — replacing another account's library on this device.
// Spec: ADR-0004/0009, V2-BOARD [V2-15] (a device's library belongs to one account).
//
// A library owned by a *different* signed-in account is hidden, so the list
// reads empty. The foreign-library notice says so and offers the takeover:
// replace this device's copy with the signed-in account's own library. Three
// pages show that notice, so the state behind it lives once, here, and the
// notice in `app/shared` only draws it (the import ladder keeps components off
// data-access, PRD-UI-SHELL.md §3).
//
// The takeover DELETES this device's copy of the other account's library, so it
// is behind a confirm, and the confirm escalates when that copy holds unsynced
// work, because the clear-and-pull cannot get it back (it lived only here).

import { Injectable, inject, signal } from '@angular/core';
import { LibraryOwnership } from '../stores/library-ownership';
import { SyncService } from './sync-service';

@Injectable({ providedIn: 'root' })
export class LibraryTakeover {
  private readonly ownership = inject(LibraryOwnership);
  private readonly sync = inject(SyncService);

  private readonly _isConfirming = signal(false);
  private readonly _isUnsynced = signal(false);
  private readonly _isBusy = signal(false);

  /** This device's library belongs to another account than the signed-in one. */
  readonly isForeign = this.ownership.isForeign;
  /** The confirm is open. */
  readonly isConfirming = this._isConfirming.asReadonly();
  /** The library being replaced has changes that never reached the cloud: the
   * escalated warning, checked when the confirm opens. */
  readonly isUnsynced = this._isUnsynced.asReadonly();
  /** The takeover is a clear-and-pull; while it runs a second press cannot start
   * a second one over the first, and the confirm cannot be dismissed. */
  readonly isBusy = this._isBusy.asReadonly();

  /**
   * Open the confirm, and ask the database whether the copy about to be cleared
   * holds unsynced work. Best-effort: an unreadable answer leaves the plain
   * warning rather than a false all-clear.
   */
  open(): void {
    this._isUnsynced.set(false);
    this._isConfirming.set(true);
    void this.sync
      .hasUnsyncedRows()
      .then((unsynced) => this._isUnsynced.set(unsynced))
      .catch(() => this._isUnsynced.set(false));
  }

  cancel(): void {
    if (this._isBusy()) return;
    this._isConfirming.set(false);
  }

  async replace(): Promise<void> {
    if (this._isBusy()) return;
    this._isBusy.set(true);
    try {
      await this.sync.adoptDevice();
      this._isConfirming.set(false);
    } finally {
      this._isBusy.set(false);
    }
  }
}
