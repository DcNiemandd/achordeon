// Stage session — Epic 8 ▸ performing mode (persistent across modules)
// Spec: docs/achordeon-implementation.md §Epic 8; apps/docs/docs/stage-audience/index.mdx

import { LocationStrategy } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';
import { generateLobbyPin } from '@achordeon/shared/domain';
import { Fullscreen } from './fullscreen';
import { stepTranspose } from './transpose';
import { UiStore } from './ui-store';

/** The audience panel phase. */
export type AudienceState = 'closed' | 'create' | 'active';

const KEY = 'achordeon.stage';

/**
 * How long a stored performance may be resumed for.
 *
 * A performance is an *event*: the tab that comes back an hour later is the same
 * gig, the one that comes back tomorrow morning is not. Twelve hours is long
 * enough to cover any single evening — including a phone that sat locked through
 * a whole set and a tab the OS discarded and reloaded — and short enough that it
 * can never span two, which matters because resuming also resurrects the lobby
 * PIN and re-publishes to it.
 */
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

interface PersistedStage {
  bookId: string | null;
  index: number;
  lobbyPin: string;
  /** The moon's answer for THIS performance, or absent for "as the app says". */
  songDark: boolean | null;
  savedAt: number;
}

/**
 * The **persistent** part of a performance: which book, which song, and the
 * lobby — the state that must outlive the `/stage/:id` route so the session
 * survives a jump to another module and resumes on return (only the exit cross
 * ends it).
 *
 * It also outlives the **page**. A performer's phone locks between songs, or the
 * OS reclaims a backgrounded tab, and what comes back is a fresh document with
 * an empty root injector — so "persistent across modules" was only half the
 * requirement, and a reload used to restart the book at song 1 and lose the
 * lobby PIN (stranding an audience the durable row was still holding open,
 * ADR-0011). The record is mirrored to `localStorage` on every change and read
 * back at construction, which makes a reload indistinguishable from a jump to
 * another module and back.
 *
 * `localStorage`, not IndexedDB, for `UiStore`'s reason: it must be readable
 * **synchronously at boot**, before the perform route asks for the index. And
 * device-local for the same reason as the split ratio — which song a phone on
 * stage is showing is not a fact about the account.
 *
 * A store-free UI-state holder, deliberately in `shared/layout` beside `Panes`
 * and `Fullscreen`: the shell's bottom bar renders the mobile controls and so
 * must read this, and `shared/**` may not touch a store (the presenter rule,
 * PRD-UI-SHELL.md §3, enforced in eslint). The store-dependent, render-derived
 * half of a performance (songs, SVG, summary rows) stays in the route-scoped
 * `StagePerformPresenter`, which reads `index` from here.
 *
 * `isMounted` is the `Panes`-style report: the perform page raises it while it
 * is on screen, and the shell draws the stage controls only then. It is
 * deliberately **not** persisted: whether the view is on screen is a fact about
 * this document, and a stale `true` would draw the stage bar over the library.
 */
@Injectable({ providedIn: 'root' })
export class StageSession {
  private readonly fullscreen = inject(Fullscreen);
  private readonly locationStrategy = inject(LocationStrategy);
  /** The app-wide answer about dark paper, which this session may override for
   * the performance in hand — see `isSongDark`. */
  private readonly ui = inject(UiStore);

  private readonly _bookId = signal<string | null>(null);
  private readonly _index = signal(0);
  private readonly _total = signal(0);
  private readonly _isSummaryOpen = signal(false);
  private readonly _isAudienceOpen = signal(false);
  private readonly _lobbyPin = signal('');
  private readonly _audienceCount = signal(0);
  private readonly _isMounted = signal(false);
  /**
   * The moon's answer, or `null` for "whatever the app says".
   *
   * A *performance-scoped override*, which is the only shape that fits what the
   * control means. The setting (`UiStore.isSongDarkFollowingTheme`) is a
   * standing preference about this device; the moon is a performer saying "not
   * on this stage" about the room they are standing in tonight. So it overrides
   * the setting here and reaches nothing else — the library and the editor keep
   * drawing whatever the app theme says while a dark performance is running.
   *
   * Persisted with the rest of the performance, and expiring with it: a phone
   * that locks mid-set comes back to the same page, and next week's gig starts
   * from the setting again rather than from a flag nobody remembers pressing.
   */
  private readonly _songDark = signal<boolean | null>(null);
  /**
   * How far this performance is shifted, in semitones — **the performer's own**.
   *
   * It is not a property of the song and it never becomes one: the source is
   * untouched, the payload carries the song as written, and nothing about it is
   * saved. A performer transposes because of the instrument in their hands or
   * the voice on the night, which is a fact about this room and not about the
   * book — the same argument the dark page makes, and it is kept the same way.
   *
   * **Held for the whole performance**, not reset per song: a capo does not come
   * off between numbers. It goes when the performance goes (`end`).
   *
   * Deliberately **not persisted** with the rest of the record, which is the one
   * place it parts company with `_songDark`. A page that reloads mid-set is an
   * accident; coming back to a library that quietly plays everything a tone up,
   * with no control on screen outside the stage saying so, is worse than coming
   * back to the written key.
   */
  private readonly _transpose = signal(0);

  readonly bookId = this._bookId.asReadonly();
  readonly index = this._index.asReadonly();
  readonly total = this._total.asReadonly();
  readonly isSummaryOpen = this._isSummaryOpen.asReadonly();
  readonly lobbyPin = this._lobbyPin.asReadonly();
  readonly audienceCount = this._audienceCount.asReadonly();
  readonly isMounted = this._isMounted.asReadonly();
  /** Semitones, signed. Read by both chromes and by the presenter's render. */
  readonly transpose = this._transpose.asReadonly();

  /** A performance is open (whether or not its view is on screen). */
  readonly isPerforming = computed(() => this._bookId() !== null);

  /**
   * Is this performance drawn on a black page — the moon's answer if it was
   * given, and the app's otherwise. The bar lights off it, the presenter renders
   * off it, and the page frames off it, so paper and ink cannot disagree.
   */
  readonly isSongDark = computed(
    () => this._songDark() ?? this.ui.isSongDark(),
  );

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
   * What the audience action calls itself — in both chromes at once.
   *
   * The perform page's own top bar and the shell's bottom-bar menu draw the
   * *same* single action, and both of them used to offer "Create an audience"
   * whether or not one already existed: a performer who was already hosting was
   * being invited to start over, and nothing on the control said a lobby was
   * live. So the word has to follow `hasLobby` — and it has to follow it here.
   * A ternary copied into each chrome would be two labels to keep in step, and
   * this holder is the one thing the two already share (they may not reach a
   * store or the route-scoped presenter — the presenter rule, PRD-UI-SHELL.md
   * §3). It is UI copy inside a state holder for that reason alone; nothing
   * else's copy belongs here.
   *
   * The live count deliberately stays out of it. It is the one number a performer
   * glances at mid-set, but a label that grows a parenthetical is a label that
   * changes width under the thumb — and on the phone, where this is a menu row of
   * text rather than an icon, it was the longest row on the bar. The lit
   * `is-active` state already says a lobby is running; the dialog one tap away
   * says how many are in it.
   */
  readonly audienceLabel = computed(() =>
    this.hasLobby()
      ? $localize`:@@stage.audience.manage:Manage audience`
      : $localize`:@@stage.audience:Create an audience`,
  );

  /**
   * The join URL, base-href-aware. `prepareExternalUrl` folds in the app's
   * deploy base (`/app/`, plus the locale sub-path) — a bare
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

  constructor() {
    this.hydrate();
  }

  /**
   * Begin (or resume) a performance of `bookId`. Idempotent on the same book:
   * re-entering the route must keep the current song, so only a *different* book
   * resets the index. The presenter reloads the songs either way.
   *
   * A reload arrives here too — `bookId` comes off the URL and the hydrated
   * record already holds it, so this is the early return and the stored index
   * stands.
   */
  start(bookId: string): void {
    if (this._bookId() === bookId) return;
    this._bookId.set(bookId);
    this._index.set(0);
    this._total.set(0);
    this.persist();
  }

  /**
   * The book's length, reported once the presenter has hydrated its songs.
   *
   * **Clamps the index**, because a stored one may no longer be reachable: songs
   * are deleted from the library between sessions, and an index past the end
   * renders a blank page inside a book the view insists is not empty. Landing on
   * the last song is the honest answer to "the song you were on is gone".
   */
  setTotal(total: number): void {
    this._total.set(total);
    if (total > 0 && this._index() > total - 1) {
      this._index.set(total - 1);
      this.persist();
    }
  }

  prev(): void {
    this._index.update((i) => Math.max(0, i - 1));
    this.persist();
  }

  next(): void {
    this._index.update((i) => Math.min(this._total() - 1, i + 1));
    this.persist();
  }

  jumpTo(index: number): void {
    this._index.set(Math.max(0, Math.min(this._total() - 1, index)));
    this._isSummaryOpen.set(false);
    this.persist();
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
    this.persist();
  }

  /**
   * Turn this performance's page over, whichever way it is currently lying.
   *
   * Records an explicit answer rather than a "not the setting" flag: the setting
   * can move under a running performance (the OS goes dark at dusk), and a
   * performer who turned the page white on a lit stage means white, not "the
   * opposite of whatever the app decides next".
   */
  toggleSongDark(): void {
    this._songDark.set(!this.isSongDark());
    this.persist();
  }

  /** One step up (`1`) or down (`-1`), wrapping through the octave back to 0. */
  transposeBy(direction: number): void {
    this._transpose.update((offset) => stepTranspose(offset, direction));
  }

  /** Back to the written key. */
  resetTranspose(): void {
    this._transpose.set(0);
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
    this.persist();
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
    // The room ends with the gig: the next performance starts from the setting.
    this._songDark.set(null);
    // And so does the capo — the next set is played from the page again.
    this._transpose.set(0);
    // Ends the lobby and persists — so the stored record goes with the
    // performance rather than waiting out its twelve hours.
    this.endLobby();
    void this.fullscreen.exit();
  }

  /**
   * Read the stored performance back, or drop it.
   *
   * A record with no book is nothing to resume, and one past `MAX_AGE_MS` is
   * last night's — both are removed rather than left to be re-read on every
   * boot. Anything malformed is treated the same way: a hand-edited or
   * half-written value must not be able to stop the app booting.
   */
  private hydrate(): void {
    const stored = this.read();
    if (
      !stored ||
      typeof stored.bookId !== 'string' ||
      typeof stored.savedAt !== 'number' ||
      Date.now() - stored.savedAt > MAX_AGE_MS
    ) {
      this.forget();
      return;
    }
    this._bookId.set(stored.bookId);
    if (typeof stored.index === 'number' && stored.index >= 0) {
      this._index.set(Math.floor(stored.index));
    }
    if (typeof stored.lobbyPin === 'string') {
      this._lobbyPin.set(stored.lobbyPin);
    }
    if (typeof stored.songDark === 'boolean') {
      this._songDark.set(stored.songDark);
    }
  }

  private read(): Partial<PersistedStage> | null {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as Partial<PersistedStage>) : null;
    } catch {
      return null;
    }
  }

  /**
   * Written synchronously from each mutator, `UiStore`'s reason: an `effect`
   * flushes on a later tick, and the tap that turns the page is exactly the
   * moment a phone gets locked. There are a handful of mutators — a scheduler
   * buys nothing here and costs correctness.
   */
  private persist(): void {
    const bookId = this._bookId();
    if (bookId === null) {
      this.forget();
      return;
    }
    const state: PersistedStage = {
      bookId,
      index: this._index(),
      lobbyPin: this._lobbyPin(),
      songDark: this._songDark(),
      savedAt: Date.now(),
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // Private mode or quota. The performance still works for this document,
      // which is all it could promise before.
    }
  }

  private forget(): void {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // Nothing was stored; nothing to remove.
    }
  }
}
