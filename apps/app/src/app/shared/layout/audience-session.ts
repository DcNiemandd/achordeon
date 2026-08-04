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

import { Injectable, computed, inject, signal } from '@angular/core';
import { stepTranspose } from './transpose';
import { UiStore } from './ui-store';

@Injectable({ providedIn: 'root' })
export class AudienceSession {
  /** The app-wide answer about dark paper, overridable here — see `isSongDark`. */
  private readonly ui = inject(UiStore);

  private readonly _isMounted = signal(false);
  private readonly _isSummaryOpen = signal(false);
  private readonly _isLobbyOpen = signal(false);
  private readonly _hideChords = signal(false);
  /**
   * The moon's answer for this viewing, or `null` for "as the app says".
   *
   * The viewer's counterpart of `StageSession`'s override, and viewer-local for
   * exactly Hide chords' reason: the performer shares one render, but the light
   * each person is sitting in is their own (CONTEXT.md §Audience). Nothing about
   * it rides in the payload, and it reaches only this view — a viewer who
   * darkens the song they are following has not darkened their song library.
   */
  private readonly _songDark = signal<boolean | null>(null);
  /**
   * How far *this viewer* is playing the song from, in semitones.
   *
   * Viewer-local for the reason the whole control exists: the performer is on a
   * guitar in standard tuning and the person following along has a capo on the
   * second fret, or a transposing instrument, or a voice that does not reach.
   * One shared render, and each screen answers for the hands in front of it —
   * the same rule as Hide chords and the dark page (CONTEXT.md §Audience).
   * Nothing about it rides in the payload, and the performer never sees it.
   *
   * Held for the whole viewing, and gone when the viewer leaves.
   */
  private readonly _transpose = signal(0);
  private leaveHandler: (() => void) | null = null;
  private syncHandler: (() => void) | null = null;

  /** True while the viewer is joined and on screen — the shell draws the bar then. */
  readonly isMounted = this._isMounted.asReadonly();
  readonly isSummaryOpen = this._isSummaryOpen.asReadonly();
  readonly isLobbyOpen = this._isLobbyOpen.asReadonly();
  /** Viewer-local, reflow-safe hide-chords (§4.6). Read by the presenter's render. */
  readonly hideChords = this._hideChords.asReadonly();
  /** Semitones, signed. Read by the bar and by the presenter's render. */
  readonly transpose = this._transpose.asReadonly();

  /** Is this viewing drawn on a black page — the moon's answer if it was given,
   * and the app's otherwise. The bar, the render and the frame all read it. */
  readonly isSongDark = computed(
    () => this._songDark() ?? this.ui.isSongDark(),
  );

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

  /** One step up (`1`) or down (`-1`), wrapping through the octave back to 0. */
  transposeBy(direction: number): void {
    this._transpose.update((offset) => stepTranspose(offset, direction));
  }

  /** Back to the key the performer is sending. */
  resetTranspose(): void {
    this._transpose.set(0);
  }

  /** Turn this viewing's page over — an explicit answer, so a theme that moves
   * later cannot undo it (see `StageSession.toggleSongDark`). */
  toggleSongDark(): void {
    this._songDark.set(!this.isSongDark());
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

  /**
   * A manual re-sync, registered by the page the same way as `leave`: the durable
   * lobby row is re-read and applied, so a viewer who suspects it fell behind can
   * catch up on demand. The rev gate makes it idempotent — nothing changes if the
   * viewer is already current.
   */
  registerSync(handler: () => void): void {
    this.syncHandler = handler;
  }

  sync(): void {
    this.syncHandler?.();
  }

  /** Drop transient panel state when the view unmounts. */
  reset(): void {
    this._isSummaryOpen.set(false);
    this._isLobbyOpen.set(false);
    // The next lobby is a different room and possibly a different instrument.
    this._transpose.set(0);
  }
}
