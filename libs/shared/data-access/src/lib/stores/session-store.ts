// Session store (hand-rolled) — Epic 4 ▸ subtask 4
// Spec: PRD-INFRASTRUCTURE.md §2/§3 (SessionStore; session-only, not persisted)

import { Injectable, computed, signal } from '@angular/core';
import type { Uuid } from '@achordeon/shared/domain';

/**
 * Ephemeral, session-only UI state — nothing here is persisted or synced (contrast
 * the entity stores). Holds the two cross-feature transients the explorer and
 * editor share: the multi-select set (CONTEXT.md §Song explorer) and the currently
 * focused Song. Feature-specific transients grow this per module.
 */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly _selectedIds = signal<ReadonlySet<Uuid>>(new Set());
  private readonly _currentSongId = signal<Uuid | null>(null);

  readonly selectedIds = this._selectedIds.asReadonly();
  readonly currentSongId = this._currentSongId.asReadonly();
  readonly selectionCount = computed(() => this._selectedIds().size);

  isSelected(id: Uuid): boolean {
    return this._selectedIds().has(id);
  }

  toggle(id: Uuid): void {
    this._selectedIds.update((set) => {
      const next = new Set(set);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  select(id: Uuid): void {
    this._selectedIds.update((set) => new Set(set).add(id));
  }

  clearSelection(): void {
    this._selectedIds.set(new Set());
  }

  setCurrentSong(id: Uuid | null): void {
    this._currentSongId.set(id);
  }
}
