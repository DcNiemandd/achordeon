// App update state — Epic 11 ▸ update strategy
// Spec: PRD-INFRASTRUCTURE.md §11 (D5), ADR-0007 (the refuse-and-update path)

import {
  ApplicationRef,
  DestroyRef,
  Injectable,
  computed,
  inject,
  signal,
} from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { WarnUnsynced } from './warn-unsynced';

/**
 * Which update conversation the app is having, worst first:
 *
 * - `broken` — the service worker cache is corrupt and cannot be repaired in
 *   place. Only a reload rebuilds it.
 * - `required` — an ingest path refused data written by a newer breaking build
 *   (ADR-0007). Nothing else can be done with that data until the app updates,
 *   so this one does not take no for an answer.
 * - `available` — a new version is downloaded and waiting. Entirely optional.
 */
export type UpdatePrompt = 'broken' | 'required' | 'available';

/**
 * Owns "there is a newer app than the one you are running".
 *
 * **Never reloads on its own.** Activating a new version always means a full
 * reload — ngsw forbids swapping assets mid-session, so there is no such thing as
 * a quiet update — and the app may be **mid-performance**: on stage, or hosting a
 * lobby a room full of phones is watching. So the routine path is a dismissible
 * offer and the user picks the moment. The only prompt that insists is the one
 * where refusing leaves data unreadable (ADR-0007).
 *
 * **Promise-based, not `versionUpdates`.** `SwUpdate` is an RxJS API and the
 * no-RxJS rule (PRD-INFRASTRUCTURE.md §3) still holds: `checkForUpdate()` and
 * `activateUpdate()` are promises, and they say everything the gentle path needs.
 * The one exception is `unrecoverable`, which exists only as an observable — a
 * single `subscribe` with no operators, in the same spirit as the lobby's
 * `channel.subscribe`.
 *
 * With no service worker (dev server, or a browser without one) every signal here
 * stays false and `requireUpdate()` still works: the forced path degrades to
 * "reload", which is the correct instruction when the network is the only cache.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdate {
  private readonly sw = inject(SwUpdate);
  private readonly appRef = inject(ApplicationRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly unload = inject(WarnUnsynced);

  private readonly _available = signal(false);
  private readonly _required = signal(false);
  private readonly _broken = signal(false);
  private readonly _busy = signal(false);

  /** True while an activation is in flight — the buttons stand down. */
  readonly isBusy = this._busy.asReadonly();

  /** What to say, or `null` for nothing. One signal, so the UI cannot show two. */
  readonly prompt = computed<UpdatePrompt | null>(() =>
    this._broken()
      ? 'broken'
      : this._required()
        ? 'required'
        : this._available()
          ? 'available'
          : null,
  );

  /** Whether the current prompt may be waved away (the routine one may). */
  readonly isDismissible = computed(() => this.prompt() === 'available');

  constructor() {
    if (!this.sw.isEnabled) return;

    // A corrupted cache cannot be fixed from in here; all we can do is say so.
    const sub = this.sw.unrecoverable.subscribe(() => this._broken.set(true));
    this.destroyRef.onDestroy(() => sub.unsubscribe());

    // First check once the app is stable — before that the browser is still
    // fetching the very bundles we would be checking against, and the worker
    // registration itself waits for stability. `whenStable()` is a promise, so
    // this costs no RxJS.
    void this.appRef.whenStable().then(() => this.check());

    if (typeof window !== 'undefined') {
      // The same lifecycle moment as the ADR-0004 pull-on-launch handoff: coming
      // back to the tab is when a deploy that happened meanwhile is worth knowing
      // about, and it costs one conditional request.
      window.addEventListener('focus', () => void this.check());
    }
  }

  /**
   * Ask the server whether a newer version exists. Safe to call often (ngsw makes
   * a conditional request for one small manifest) and safe to call always — it
   * resolves `false` where there is no service worker.
   */
  async check(): Promise<void> {
    if (!this.sw.isEnabled) return;
    try {
      if (await this.sw.checkForUpdate()) this._available.set(true);
    } catch {
      // Offline, or the check raced a reload. Nothing is broken by not knowing.
    }
  }

  /**
   * An ingest path refused data from a newer breaking build (ADR-0007): raise the
   * blocking prompt and go looking for that build immediately, so the button the
   * user is about to press has something to activate.
   *
   * Idempotent — every refusing path may call it, and several will.
   */
  requireUpdate(): void {
    if (this._required()) return;
    this._required.set(true);
    void this.check();
  }

  /** Dismiss the routine offer. It comes back on the next focus check, which is
   * the gentlest nagging available: never now, always eventually. */
  dismiss(): void {
    this._available.set(false);
  }

  /**
   * Take the new version: activate it, then reload — in that order, because
   * activation only swaps which version the *next* load gets. The reload happens
   * even if activation reports nothing to do (no service worker, or a version
   * that installed itself in another tab), since a reload is what the user asked
   * for and it is never wrong.
   */
  async activate(): Promise<void> {
    this._busy.set(true);
    try {
      if (this.sw.isEnabled) await this.sw.activateUpdate();
    } catch {
      // A failed activation still leaves a reload as the useful next move: the
      // fresh load re-registers the worker from scratch.
    } finally {
      // The user pressed Update; being asked whether they meant to leave is a
      // second question nobody asked (see `WarnUnsynced.expectUnload`).
      this.unload.reload();
    }
  }
}
