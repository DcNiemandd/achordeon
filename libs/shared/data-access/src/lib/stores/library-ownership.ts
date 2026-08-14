// Library ownership — a device's library belongs to one account, or none.
// Spec: ADR-0004/0009 (one account per library; handoff sync fenced by owner).
//
// IndexedDB is the source of truth and it is not per-account — one browser, one
// library. The cloud IS per-account: `songs.owner = auth.uid()`, and a row a
// second account tries to push over the first account's copy is refused by RLS
// (42501). So the local library needs to know WHOSE it is, or the same rows go up
// under whichever session happens to be signed in.
//
// The answer is one marker in `meta`, not a column on every row: this device's
// library is owned by one account (`owner = uid`) or by nobody yet (`owner`
// absent — a fresh, offline, never-signed-in library). The first sign-in claims
// an unowned library; a sign-out hides an owned one rather than releasing it (the
// rows are still that account's, and safe locally and in the cloud). A different
// account signing in sees the library it does not own hidden, and sync stands
// down for it — which is what makes the 42501 impossible rather than caught.
//
// Per-row ownership (two accounts' libraries coexisting in one DB) is the richer
// model this deliberately does not build — V2-BOARD [V2-15].

import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { AuthService } from '../auth/auth-service';
import { ACHORDEON_DB } from './repositories';

const META_LIBRARY_OWNER = 'libraryOwner';

@Injectable({ providedIn: 'root' })
export class LibraryOwnership {
  private readonly auth = inject(AuthService);
  private readonly db = inject(ACHORDEON_DB);

  /** The account uid this device's library belongs to, or `null` when it has not
   * been claimed — a fresh offline library nobody has signed into yet. */
  private readonly _owner = signal<string | null>(null);
  /** The marker is loaded before the claim effect may act — otherwise the effect
   * reads the default `null` over an owned library and claims it for whoever is
   * signed in, silently reassigning it. */
  private readonly _loaded = signal(false);
  private started = false;

  readonly owner = this._owner.asReadonly();

  /**
   * Whether the local library is this session's to see and to sync.
   *
   * - Unowned (`null`) — always: a library nobody has claimed is the offline,
   *   pre-account one, editable signed in or out. The first sign-in claims it.
   * - Owned — only to the signed-in account that owns it. Signed out, or signed
   *   in as someone else, it is hidden and its sync stands down.
   */
  readonly isVisible = computed(() => {
    const owner = this._owner();
    if (owner === null) return true;
    return this.auth.isSignedIn() && this.auth.user()?.id === owner;
  });

  constructor() {
    // Claim on the first sign-in and never again: ownership is sticky, so a later
    // sign-out hides the library, it does not hand it back to the next account.
    effect(() => {
      if (!this._loaded()) return;
      const uid = this.auth.user()?.id ?? null;
      if (uid !== null && this._owner() === null) void this.claim(uid);
    });
  }

  /** Load the marker, then let the claim effect run. Called at boot after
   * `AuthService.init` and before `SyncService.init`. */
  async init(): Promise<void> {
    if (this.started) return;
    this.started = true;
    const row = await this.db.meta.get(META_LIBRARY_OWNER);
    this._owner.set(row ? row.value : null);
    this._loaded.set(true);
  }

  private async claim(uid: string): Promise<void> {
    // Signal first so `isVisible` and the sync gate read the claim this tick; the
    // write only persists it.
    this._owner.set(uid);
    await this.db.meta.put({ key: META_LIBRARY_OWNER, value: uid });
  }
}
