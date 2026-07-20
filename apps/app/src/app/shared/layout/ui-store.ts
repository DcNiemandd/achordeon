// UiStore — Epic 13
// Spec: PRD-UI-SHELL.md §7 (where UI state lives)

import { Injectable, signal } from '@angular/core';

const KEY = 'achordeon.ui';
const DEFAULT_RATIO = 0.5;
const MIN_RATIO = 0.05;
const MAX_RATIO = 0.95;

/**
 * Which module's split is being sized. Coarser than a route on purpose: the
 * songs list and the song editor are one place to work in, and a splitter that
 * jumps when you open a song would be a surprise, not a memory.
 */
export type SplitScope = 'songs' | 'songbooks' | 'settings';

interface PersistedUi {
  splitRatio: number;
  splitRatios: Partial<Record<SplitScope, number>>;
  isSplitShared: boolean;
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
  /** The one ratio, used while the panes are linked. */
  private readonly _splitRatio = signal(DEFAULT_RATIO);
  /** Per-module ratios, used while they are not. Kept even while linked, so
   * turning the link off restores what each module last had rather than
   * flattening them all to the shared value. */
  private readonly _splitRatios = signal<Partial<Record<SplitScope, number>>>(
    {},
  );
  /**
   * Do all modules share one split size?
   *
   * **Default on**: a splitter is a habit, and one habit is easier than four.
   * Off is for the person who wants a wide editor and a narrow library — a real
   * preference, and one only they can tell us about.
   */
  private readonly _isSplitShared = signal(true);
  private readonly _isRailCollapsed = signal(false);
  /** Session-only: the Fullscreen API needs a gesture, so a reload could never
   * restore this. A URL or a persisted flag that lies is worse than neither. */
  private readonly _isFullscreen = signal(false);

  readonly isSplitShared = this._isSplitShared.asReadonly();
  readonly isRailCollapsed = this._isRailCollapsed.asReadonly();
  readonly isFullscreen = this._isFullscreen.asReadonly();

  constructor() {
    this.hydrate();
  }

  /**
   * The ratio this module should lay out at.
   *
   * A method rather than a signal, because the answer depends on who is asking.
   * It still reads signals, so a template calling it stays reactive.
   */
  splitRatio(scope: SplitScope): number {
    return this._isSplitShared()
      ? this._splitRatio()
      : (this._splitRatios()[scope] ?? this._splitRatio());
  }

  setSplitRatio(scope: SplitScope, ratio: number): void {
    const clamped = Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));
    if (this._isSplitShared()) {
      this._splitRatio.set(clamped);
    } else {
      this._splitRatios.update((all) => ({ ...all, [scope]: clamped }));
    }
    this.persist();
  }

  /**
   * Link or unlink the modules' split sizes.
   *
   * Linking **adopts the ratio you are looking at** rather than resurrecting
   * whatever the shared value was months ago: you turn this on while sizing a
   * pane, and the pane you are sizing should not jump out from under you.
   */
  setSplitShared(isShared: boolean, current?: SplitScope): void {
    if (isShared && current) {
      this._splitRatio.set(this.splitRatio(current));
    }
    this._isSplitShared.set(isShared);
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
      this._splitRatio.set(
        Math.min(MAX_RATIO, Math.max(MIN_RATIO, stored.splitRatio)),
      );
    }
    if (stored.splitRatios && typeof stored.splitRatios === 'object') {
      this._splitRatios.set(stored.splitRatios);
    }
    if (typeof stored.isSplitShared === 'boolean') {
      this._isSplitShared.set(stored.isSplitShared);
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
   * immediately would lose the value. There are a handful of setters — a
   * scheduler buys nothing here and costs correctness.
   */
  private persist(): void {
    const state: PersistedUi = {
      splitRatio: this._splitRatio(),
      splitRatios: this._splitRatios(),
      isSplitShared: this._isSplitShared(),
      isRailCollapsed: this._isRailCollapsed(),
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // Ignore — see read().
    }
  }
}
