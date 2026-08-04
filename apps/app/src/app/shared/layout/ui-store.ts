// UiStore — Epic 13
// Spec: PRD-UI-SHELL.md §7 (where UI state lives)

import { Injectable, computed, signal } from '@angular/core';

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
  isSongDarkFollowingTheme: boolean;
  isPageTurnArmed: boolean;
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
  /**
   * Do songs follow the app theme onto a dark page? — Settings ▸ Application.
   *
   * **The one stored answer about dark paper on this device**, and the only
   * thing that turns `isSongDark` below on. There is deliberately no second
   * "the page is dark right now" flag beside it: two booleans meant the page
   * could be black for a reason the settings screen did not show, and the only
   * switch that turned it back off lived in a bar you cannot reach unless you
   * are performing.
   *
   * **Off by default**: the render is a document (PRD-UI-SHELL.md §6) and a dark
   * UI is the desk it lies on, not the paper. Someone who wants the two linked
   * says so; nobody wakes up to a black song sheet because they like their
   * chrome dark.
   *
   * It belongs beside the split ratio for the split ratio's own reason: it must
   * **never sync** (PRD-UI-SHELL.md §7). The performer's stage is dark; the
   * audience member following along at a kitchen table is not, and each is
   * looking at a different screen in a different light. Pushing one answer to
   * every device would be pushing the wrong one to most of them — exactly the
   * logic behind the viewer-local Hide chords (CONTEXT.md §Audience).
   */
  private readonly _isSongDarkFollowingTheme = signal(false);
  /**
   * Does this reader want a sideways page turned upright for them? — the
   * Performance view's Turn the page (ADR-0013).
   *
   * **Armed, not applied**, and the distinction is the whole design. It says "I
   * am willing to hold this device the other way round", which is a fact about
   * the reader and their hands, not about any one song. So it never resets on a
   * page turn — unlike the zoom, which resets on every one, because a phone is
   * still sideways after the next song loads. What it does *not* do is force a
   * rotation: the page turns only where `gainsRoomTurned` also says so, so a
   * portrait song mid-setlist draws upright with this still on and the next
   * landscape one is turned again. That is what keeps it from lying, which is
   * the bar `_isFullscreen` below sets.
   *
   * One flag for both seats of the Performance view (CONTEXT.md), because the
   * device is the same device whether it is performing or following along — and
   * it must never sync, for the reason the dark page must not: rotation lock is
   * a property of the phone in this hand, not of the account.
   */
  private readonly _isPageTurnArmed = signal(false);
  /**
   * Is there a page on screen right now that a quarter turn would help?
   *
   * Session-only and view-fed, like `_isFullscreen` below: the answer depends on
   * the shape of a song and the shape of a desk, and the only thing holding both
   * is the render surface itself (`PageZoom.isTurnWorthwhile`). The bars cannot
   * reach a page-scoped presenter, so the page tells the shell rather than the
   * shell going looking.
   *
   * It exists to keep the control *honest*: hidden where a turn would gain
   * nothing, rather than shown and inert. Which also makes it the discovery
   * moment — the toggle appearing is itself the app pointing out that this song
   * is not using the screen it is on.
   */
  private readonly _isPageTurnOffered = signal(false);
  /**
   * How the app theme resolves, once the shell has wired it (`connectTheme`).
   *
   * A signal *holding* the accessor rather than a plain field, so that wiring it
   * invalidates `isSongDark` below. A field assigned after the first read would
   * leave a computed cached against the stub for good.
   */
  private readonly darkTheme = signal<() => boolean>(() => false);
  /** Session-only: the Fullscreen API needs a gesture, so a reload could never
   * restore this. A URL or a persisted flag that lies is worse than neither. */
  private readonly _isFullscreen = signal(false);

  readonly isSplitShared = this._isSplitShared.asReadonly();
  readonly isRailCollapsed = this._isRailCollapsed.asReadonly();
  readonly isSongDarkFollowingTheme =
    this._isSongDarkFollowingTheme.asReadonly();
  readonly isPageTurnArmed = this._isPageTurnArmed.asReadonly();
  readonly isPageTurnOffered = this._isPageTurnOffered.asReadonly();
  readonly isFullscreen = this._isFullscreen.asReadonly();

  /**
   * Is a song drawn on a black page — derived, never stored.
   *
   * **A property of the room, not of the song**, which is why it is here and not
   * a render setting. Settings cascade Global → Songbook → Song and are what the
   * download, the PDF and the print resolve (CONTEXT.md §Render settings); a
   * dark background stored among them would eventually come out of a printer as
   * a black A4. This reaches a screen and only a screen, as `RenderOpts.dark`.
   *
   * Every on-screen render reads it — pane B of the library, the editor's live
   * preview, a song previewed inside its songbook, the songbook print preview —
   * because a lit page among dark ones is the glare this exists to remove, and
   * there is no version of "this room is dark" that is true of one pane and
   * false of the next. Stage, Audience and the songbook pane read it *through*
   * their own state, which may override it for the performance, the viewing or
   * the book in hand (`StageSession.isSongDark`).
   *
   * What does NOT read it is everything that is not a screen: every export path
   * in `DownloadService`. The print preview is the awkward case — it is the
   * PDF's twin, so a dark one is showing paper that will not be printed, and it
   * says so on the bar while it is dark rather than quietly misleading.
   */
  readonly isSongDark = computed(
    () => this._isSongDarkFollowingTheme() && this.darkTheme()(),
  );

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

  setSongDarkFollowsTheme(follows: boolean): void {
    this._isSongDarkFollowingTheme.set(follows);
    this.persist();
  }

  setPageTurnArmed(armed: boolean): void {
    this._isPageTurnArmed.set(armed);
    this.persist();
  }

  togglePageTurn(): void {
    this.setPageTurnArmed(!this._isPageTurnArmed());
  }

  /** Told by whichever render surface is on screen. Not persisted — it describes
   * the song being looked at, and the next one may be a different shape. */
  setPageTurnOffered(offered: boolean): void {
    this._isPageTurnOffered.set(offered);
  }

  /**
   * Tell this store how the app theme resolves.
   *
   * A plain accessor for the reason every other `connect` in `app/shared` takes
   * one (see `ThemeApplier`): this store must not know who computed it, and
   * `shared/layout` must stay under the import ladder. The root shell wires it
   * to `ThemeApplier.isDark`, which resolves a `system` choice against the OS
   * and keeps doing so — so a machine that turns dark at dusk turns the page
   * with it, with nothing to re-apply and no state to go stale.
   */
  connectTheme(isDarkTheme: () => boolean): void {
    this.darkTheme.set(isDarkTheme);
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
    // A device that stored the old standalone `isSongDark` is not read here on
    // purpose: that flag has no meaning left, and honouring it would hand
    // someone a black library because they once pressed the moon on stage.
    if (typeof stored.isSongDarkFollowingTheme === 'boolean') {
      this._isSongDarkFollowingTheme.set(stored.isSongDarkFollowingTheme);
    }
    if (typeof stored.isPageTurnArmed === 'boolean') {
      this._isPageTurnArmed.set(stored.isPageTurnArmed);
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
      isSongDarkFollowingTheme: this._isSongDarkFollowingTheme(),
      isPageTurnArmed: this._isPageTurnArmed(),
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // Ignore — see read().
    }
  }
}
