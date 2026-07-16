// Fullscreen — Epic 13
// Spec: PRD-UI-SHELL.md §4 (performing mode)

import { DOCUMENT, Injectable, computed, inject, signal } from '@angular/core';
import { UiStore } from './ui-store';

/** How long the chrome lingers after the last pointer movement. */
const IDLE_MS = 3000;

interface WakeLockSentinelLike {
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}

/**
 * Performing mode: browser fullscreen, the screen kept awake, and the shell
 * chrome auto-hiding until you move or tap.
 *
 * **A runtime mode, not a property of a route.** Stage and Audience both keep the
 * normal layout and opt in — which is why there is no `chrome: 'none'` route flag:
 * whether the frame is showing depends on what the user is doing, not on where
 * they are.
 *
 * Three separate concerns, deliberately together because they fail together:
 *
 * - **Fullscreen** — needs a user gesture; the browser will reject a programmatic
 *   call. The user can also leave via Esc without telling us, so we listen for
 *   `fullscreenchange` rather than trusting our own flag.
 * - **Wake lock** — a performer reading a song does not touch the screen for
 *   minutes, and the device would sleep mid-verse. The lock is **dropped by the
 *   browser whenever the tab is hidden**, so it must be re-acquired on
 *   `visibilitychange` or it silently stops working after the first tab switch.
 * - **Chrome auto-hide** — the bars come back on pointer move or tap, then fade.
 */
@Injectable({ providedIn: 'root' })
export class Fullscreen {
  private readonly document = inject(DOCUMENT);
  private readonly ui = inject(UiStore);

  private readonly _isChromeVisible = signal(true);
  private wakeLock: WakeLockSentinelLike | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  readonly isActive = this.ui.isFullscreen;
  /** Chrome shows normally; in fullscreen it hides until you move. */
  readonly isChromeVisible = computed(
    () => !this.isActive() || this._isChromeVisible(),
  );

  constructor() {
    // The user can exit with Esc or the browser's own affordance, and we would
    // never hear about it. The platform is the source of truth, not our flag.
    this.document.addEventListener('fullscreenchange', () => {
      if (!this.document.fullscreenElement && this.ui.isFullscreen()) {
        void this.exit();
      }
    });

    this.document.addEventListener('visibilitychange', () => {
      if (
        this.document.visibilityState === 'visible' &&
        this.ui.isFullscreen()
      ) {
        void this.acquireWakeLock();
      }
    });
  }

  /** Must be called from a user gesture — browsers reject fullscreen otherwise. */
  async enter(): Promise<void> {
    this.ui.setFullscreen(true);
    this.reveal();
    await this.acquireWakeLock();
    try {
      await this.document.documentElement.requestFullscreen?.();
    } catch {
      // Denied, or unsupported (iOS Safari has no element fullscreen on phones).
      // The mode still works — chrome hides and the screen stays awake — so this
      // degrades rather than fails.
    }
  }

  async exit(): Promise<void> {
    this.ui.setFullscreen(false);
    this._isChromeVisible.set(true);
    this.clearIdle();
    await this.releaseWakeLock();
    if (this.document.fullscreenElement) {
      try {
        await this.document.exitFullscreen?.();
      } catch {
        // Already gone.
      }
    }
  }

  toggle(): Promise<void> {
    return this.isActive() ? this.exit() : this.enter();
  }

  /** Called on pointer move / tap while performing. */
  reveal(): void {
    this._isChromeVisible.set(true);
    this.clearIdle();
    this.idleTimer = setTimeout(
      () => this._isChromeVisible.set(false),
      IDLE_MS,
    );
  }

  private async acquireWakeLock(): Promise<void> {
    const nav = this.document.defaultView?.navigator as
      | {
          wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> };
        }
      | undefined;
    if (!nav?.wakeLock || this.wakeLock) {
      return;
    }
    try {
      this.wakeLock = await nav.wakeLock.request('screen');
      // The browser drops the lock on tab-hide and tells us via this event;
      // clearing the handle lets visibilitychange re-acquire cleanly.
      this.wakeLock.addEventListener('release', () => (this.wakeLock = null));
    } catch {
      // Unsupported, or refused on battery saver. Not worth failing the mode for.
    }
  }

  private async releaseWakeLock(): Promise<void> {
    const lock = this.wakeLock;
    this.wakeLock = null;
    try {
      await lock?.release();
    } catch {
      // Already released.
    }
  }

  private clearIdle(): void {
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }
}
