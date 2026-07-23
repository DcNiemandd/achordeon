// Stage session — Epic 8 ▸ performing mode (persistent across modules)
// Spec: docs/achordeon-implementation.md §Epic 8; apps/docs/docs/stage-audience/index.mdx

import { LocationStrategy } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';
import { generateLobbyPin } from '@achordeon/shared/domain';
import { Fullscreen } from './fullscreen';

/** The audience panel phase. */
export type AudienceState = 'closed' | 'create' | 'active';

/**
 * The **persistent** part of a performance: which book, which song, and the
 * lobby — the state that must outlive the `/stage/:id` route so the session
 * survives a jump to another module and resumes on return (only the exit cross
 * ends it).
 *
 * A store-free UI-state holder, deliberately in `shared/layout` beside `Panes`
 * and `Fullscreen`: the shell's bottom bar renders the mobile controls and so
 * must read this, and `shared/**` may not touch a store (the presenter rule,
 * PRD-UI-SHELL.md §3, enforced in eslint). The store-dependent, render-derived
 * half of a performance (songs, SVG, summary rows) stays in the route-scoped
 * `StagePerformPresenter`, which reads `index` from here.
 *
 * `isMounted` is the `Panes`-style report: the perform page raises it while it
 * is on screen, and the shell draws the stage controls only then.
 */
@Injectable({ providedIn: 'root' })
export class StageSession {
  private readonly fullscreen = inject(Fullscreen);
  private readonly locationStrategy = inject(LocationStrategy);

  private readonly _bookId = signal<string | null>(null);
  private readonly _index = signal(0);
  private readonly _total = signal(0);
  private readonly _isSummaryOpen = signal(false);
  private readonly _isAudienceOpen = signal(false);
  private readonly _lobbyPin = signal('');
  private readonly _audienceCount = signal(0);
  private readonly _isMounted = signal(false);

  readonly bookId = this._bookId.asReadonly();
  readonly index = this._index.asReadonly();
  readonly total = this._total.asReadonly();
  readonly isSummaryOpen = this._isSummaryOpen.asReadonly();
  readonly lobbyPin = this._lobbyPin.asReadonly();
  readonly audienceCount = this._audienceCount.asReadonly();
  readonly isMounted = this._isMounted.asReadonly();

  /** A performance is open (whether or not its view is on screen). */
  readonly isPerforming = computed(() => this._bookId() !== null);

  readonly hasPrev = computed(() => this._index() > 0);
  readonly hasNext = computed(() => this._index() < this._total() - 1);

  /**
   * The lobby — and so the audience — is live. Its lifetime is the lobby's,
   * nothing else's: closing the panel keeps it (reopen resumes on it), and only
   * `endLobby`/`end` retire it. This is what the persistence across modules buys.
   */
  readonly hasLobby = computed(() => this._lobbyPin() !== '');

  /**
   * The audience panel's phase, derived — never stored — so it can never drift
   * from the lobby it describes: `closed` while the panel is down, `active` the
   * moment a lobby exists, `create` only before one does.
   */
  readonly audienceState = computed<AudienceState>(() =>
    !this._isAudienceOpen() ? 'closed' : this.hasLobby() ? 'active' : 'create',
  );

  /**
   * The join URL, base-href-aware. `prepareExternalUrl` folds in the app's
   * deploy base (`/achordeon/app/`, plus the locale sub-path) — a bare
   * `/audience/…` would point at the domain root, which is not where the app
   * lives. Empty until a lobby exists.
   */
  readonly audienceUrl = computed(() => {
    const pin = this._lobbyPin();
    if (pin === '') return '';
    return `${location.origin}${this.locationStrategy.prepareExternalUrl(
      `/audience/${pin}`,
    )}`;
  });

  /**
   * Begin (or resume) a performance of `bookId`. Idempotent on the same book:
   * re-entering the route must keep the current song, so only a *different* book
   * resets the index. The presenter reloads the songs either way.
   */
  start(bookId: string): void {
    if (this._bookId() === bookId) return;
    this._bookId.set(bookId);
    this._index.set(0);
    this._total.set(0);
  }

  setTotal(total: number): void {
    this._total.set(total);
  }

  prev(): void {
    this._index.update((i) => Math.max(0, i - 1));
  }

  next(): void {
    this._index.update((i) => Math.min(this._total() - 1, i + 1));
  }

  jumpTo(index: number): void {
    this._index.set(Math.max(0, Math.min(this._total() - 1, index)));
    this._isSummaryOpen.set(false);
  }

  openSummary(): void {
    this._isSummaryOpen.set(true);
  }

  closeSummary(): void {
    this._isSummaryOpen.set(false);
  }

  toggleSummary(): void {
    this._isSummaryOpen.update((open) => !open);
  }

  /** Show the panel. If a lobby already exists it resumes on it (`active`). */
  openAudience(): void {
    this._isAudienceOpen.set(true);
  }

  /** Hide the panel only — the lobby lives on, so reopening resumes on it. */
  closeAudience(): void {
    this._isAudienceOpen.set(false);
  }

  /**
   * Allocate a PIN — a pure act, no network. Setting `_lobbyPin` flips
   * `hasLobby`, which the route-scoped `StagePerformPresenter` watches to open
   * the Supabase channel (the shell may not touch data-access — the presenter
   * rule, PRD-UI-SHELL.md §3). So this holder decides *that* there is a lobby;
   * the presenter makes it real over the wire (ADR-0003).
   */
  createLobby(): void {
    this._lobbyPin.set(generateLobbyPin());
  }

  /** Live viewer count, pushed in by the presenter from the host channel. */
  setAudienceCount(count: number): void {
    this._audienceCount.set(count);
  }

  /** Retire the lobby: the audience ends with it, so the panel closes too. */
  endLobby(): void {
    this._lobbyPin.set('');
    this._audienceCount.set(0);
    this._isAudienceOpen.set(false);
  }

  /** The perform page is on screen: the shell draws the stage controls. */
  enterView(): void {
    this._isMounted.set(true);
  }

  leaveView(): void {
    this._isMounted.set(false);
  }

  /**
   * The performance is over — the single "end it" path, reached only by the
   * exit cross. Clears the session, ends any lobby, and drops fullscreen. Does
   * not navigate: the caller owns where to go (back to the picker).
   */
  end(): void {
    this._bookId.set(null);
    this._index.set(0);
    this._total.set(0);
    this._isSummaryOpen.set(false);
    this.endLobby();
    void this.fullscreen.exit();
  }
}
