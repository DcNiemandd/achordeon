// UiStore — Epic 13
// Spec: PRD-UI-SHELL.md §7 (where UI state lives)

import { Injectable, signal } from '@angular/core';

const KEY = 'achordeon.ui';
const DEFAULT_RATIO = 0.5;
const MIN_RATIO = 0.05;
const MAX_RATIO = 0.95;

interface PersistedUi {
  splitRatio: number;
  isRailCollapsed: boolean;
}

/**
 * Device-local chrome preferences — the shell's own state.
 *
 * Deliberately **not** in `shared/data-access`: this describes the temporary UI
 * and must not outlive it, and it must never sync — a desktop split ratio is
 * nonsense on a phone (PRD-UI-SHELL.md §7).
 *
 * `localStorage`, not IndexedDB, because it has to be readable **synchronously
 * at boot**: an async read means the shell lays out at the default ratio and
 * then visibly jumps.
 *
 * Hand-rolled per PRD-INFRASTRUCTURE.md §3 ("hand-rolled for the small ones").
 */
@Injectable({ providedIn: 'root' })
export class UiStore {
  private readonly _splitRatio = signal(DEFAULT_RATIO);
  private readonly _isRailCollapsed = signal(false);
  /** Session-only: the Fullscreen API needs a gesture, so a reload could never
   * restore this. A URL or a persisted flag that lies is worse than neither. */
  private readonly _isFullscreen = signal(false);

  readonly splitRatio = this._splitRatio.asReadonly();
  readonly isRailCollapsed = this._isRailCollapsed.asReadonly();
  readonly isFullscreen = this._isFullscreen.asReadonly();

  constructor() {
    this.hydrate();
  }

  setSplitRatio(ratio: number): void {
    this._splitRatio.set(Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio)));
    this.persist();
  }

  setRailCollapsed(collapsed: boolean): void {
    this._isRailCollapsed.set(collapsed);
    this.persist();
  }

  setFullscreen(on: boolean): void {
    // Deliberately not persisted — see the field comment.
    this._isFullscreen.set(on);
  }

  private hydrate(): void {
    const stored = this.read();
    if (!stored) {
      return;
    }
    if (typeof stored.splitRatio === 'number') {
      this.setSplitRatio(stored.splitRatio);
    }
    if (typeof stored.isRailCollapsed === 'boolean') {
      this._isRailCollapsed.set(stored.isRailCollapsed);
    }
  }

  private read(): Partial<PersistedUi> | null {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as Partial<PersistedUi>) : null;
    } catch {
      // Private mode, quota, or a hand-edited value. Chrome prefs are not worth
      // failing a boot over — fall back to defaults.
      return null;
    }
  }

  /**
   * Written synchronously from each setter rather than from an `effect`: an
   * effect flushes on a later tick, so dragging the splitter and closing the tab
   * immediately would lose the value. There are three setters — a scheduler buys
   * nothing here and costs correctness.
   */
  private persist(): void {
    const state: PersistedUi = {
      splitRatio: this._splitRatio(),
      isRailCollapsed: this._isRailCollapsed(),
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // Ignore — see read().
    }
  }
}
