// Viewport — Epic 13
// Spec: PRD-UI-SHELL.md §6 (single-sourced breakpoint), §8 (no RxJS)

import { DOCUMENT, Injectable, inject, signal } from '@angular/core';

/** Fallbacks if the stylesheet hasn't applied when these are first read. */
const FALLBACK_COMPACT_PX = 1200;
const FALLBACK_STACK_PX = 500;

/**
 * Is the viewport below the compact breakpoint (hamburger + tabs) or at/above it
 * (rail + split)?
 *
 * Hand-rolled over `matchMedia` rather than the CDK's `BreakpointObserver`,
 * which is Observable-shaped and would break the absolute no-RxJS rule
 * (PRD-INFRASTRUCTURE.md §3) for a twelve-line service.
 *
 * The query is built from `--bp-compact`, which `_breakpoints.scss` emits from
 * the same `$bp-compact` that drives its media-query mixins. SCSS is the single
 * source; this reads it back so TS can never drift from CSS.
 */
@Injectable({ providedIn: 'root' })
export class Viewport {
  private readonly document = inject(DOCUMENT);
  private readonly _isCompact = signal(false);
  private readonly _isStacked = signal(false);

  /** True below `--bp-compact`. Derived, never stored (PRD-UI-SHELL.md §7). */
  readonly isCompact = this._isCompact.asReadonly();

  /**
   * True below `--bp-stack`: too narrow for two panes side by side.
   *
   * A **different question** from `isCompact`, which asks whether the shell is
   * compact. Between the two, a module may still show both its panes — the
   * songbook builder does, because a transfer list that hides one of its two
   * lists behind a tab is a transfer list you cannot drag across.
   */
  readonly isStacked = this._isStacked.asReadonly();

  constructor() {
    const view = this.document.defaultView;
    // `matchMedia` is missing in jsdom and in non-browser hosts, and the method
    // can be absent even when `defaultView` is not — so feature-detect the call,
    // not just the view. Without it, we simply stay non-compact.
    if (typeof view?.matchMedia !== 'function') {
      return;
    }

    this.watch('--bp-compact', FALLBACK_COMPACT_PX, this._isCompact);
    this.watch('--bp-stack', FALLBACK_STACK_PX, this._isStacked);
  }

  private watch(
    property: string,
    fallback: number,
    into: { set(value: boolean): void },
  ): void {
    const view = this.document.defaultView;
    const query = view?.matchMedia(
      `(max-width: ${this.breakpointPx(property, fallback) - 0.02}px)`,
    );
    if (!query) {
      return;
    }
    into.set(query.matches);
    query.addEventListener('change', (e) => into.set(e.matches));
  }

  private breakpointPx(property: string, fallback: number): number {
    const raw = getComputedStyle(this.document.documentElement)
      .getPropertyValue(property)
      .trim();
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
