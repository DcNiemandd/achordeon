// Audience session — Epic 9 ▸ viewer shell state
// Spec: docs/achordeon-implementation.md §Epic 9
//
// The viewer's counterpart to StageSession: a store-free holder of the
// viewer-facing UI state, so the shell's one bottom bar can host the audience
// controls (AudienceBar) exactly the way it hosts the performing controls
// (StageBar) — no second bar of the feature's on a phone. `shared/**` may not
// touch a store (the presenter rule), and this holds no store; the render-derived
// state (payload, svg, summary) stays in the route-scoped AudiencePresenter,
// which reads `hideChords` from here.

import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AudienceSession {
  private readonly _isMounted = signal(false);
  private readonly _isSummaryOpen = signal(false);
  private readonly _isLobbyOpen = signal(false);
  private readonly _hideChords = signal(false);
  private leaveHandler: (() => void) | null = null;

  /** True while the viewer is joined and on screen — the shell draws the bar then. */
  readonly isMounted = this._isMounted.asReadonly();
  readonly isSummaryOpen = this._isSummaryOpen.asReadonly();
  readonly isLobbyOpen = this._isLobbyOpen.asReadonly();
  /** Viewer-local, reflow-safe hide-chords (§4.6). Read by the presenter's render. */
  readonly hideChords = this._hideChords.asReadonly();

  setMounted(value: boolean): void {
    this._isMounted.set(value);
  }

  toggleSummary(): void {
    this._isSummaryOpen.update((open) => !open);
  }

  closeSummary(): void {
    this._isSummaryOpen.set(false);
  }

  openLobby(): void {
    this._isLobbyOpen.set(true);
  }

  closeLobby(): void {
    this._isLobbyOpen.set(false);
  }

  toggleHideChords(): void {
    this._hideChords.update((hidden) => !hidden);
  }

  /**
   * Leaving needs `AudiencePresenter.leave()` (data-access) + a navigation, which
   * the shell-side bar cannot reach. The page registers the handler; the bar just
   * asks. A callback rather than a signal tick keeps it a plain method call with
   * no effect to debounce or de-dup.
   */
  registerLeave(handler: () => void): void {
    this.leaveHandler = handler;
  }

  leave(): void {
    this.leaveHandler?.();
  }

  /** Drop transient panel state when the view unmounts. */
  reset(): void {
    this._isSummaryOpen.set(false);
    this._isLobbyOpen.set(false);
  }
}
