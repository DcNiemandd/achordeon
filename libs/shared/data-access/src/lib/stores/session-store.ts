// Session store (hand-rolled) — Epic 4 ▸ subtask 4
// Spec: PRD-INFRASTRUCTURE.md §2/§3 (SessionStore; session-only, not persisted)

import { Injectable, signal } from '@angular/core';
import type { Uuid } from '@achordeon/shared/domain';

/**
 * Ephemeral, session-only UI state — nothing here is persisted or synced (contrast
 * the entity stores). It holds the one transient that genuinely spans features:
 * **which Song is current**. The songs list renders it in pane B, the editor opens
 * it, and the songbook builder marks it in both of its lists — one fact, one home.
 *
 * **The multi-select set used to live here too, and that was wrong** [corrected].
 * One app-wide set meant a selection made in the library followed you into the
 * songbook builder, where those rows were already ticked against a different set
 * of buttons. A selection belongs to the list it was made in, so it now lives in
 * that page's presenter (`RowSelection`, PRD-UI-SHELL.md §7).
 */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly _currentSongId = signal<Uuid | null>(null);

  readonly currentSongId = this._currentSongId.asReadonly();

  setCurrentSong(id: Uuid | null): void {
    this._currentSongId.set(id);
  }
}
