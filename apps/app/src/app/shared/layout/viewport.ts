// Viewport — Epic 13
// Spec: PRD-UI-SHELL.md §6 (single-sourced breakpoint), §8 (no RxJS)

import { DOCUMENT, Injectable, inject, signal } from '@angular/core';

/** Fallback if the stylesheet hasn't applied when this is first read. */
const FALLBACK_BP_PX = 1200;

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

  /** True below `--bp-compact`. Derived, never stored (PRD-UI-SHELL.md §7). */
  readonly isCompact = this._isCompact.asReadonly();

  constructor() {
    const view = this.document.defaultView;
    // `matchMedia` is missing in jsdom and in non-browser hosts, and the method
    // can be absent even when `defaultView` is not — so feature-detect the call,
    // not just the view. Without it, we simply stay non-compact.
    if (typeof view?.matchMedia !== 'function') {
      return;
    }

    const query = view.matchMedia(
      `(max-width: ${this.breakpointPx() - 0.02}px)`,
    );
    this._isCompact.set(query.matches);
    query.addEventListener('change', (e) => this._isCompact.set(e.matches));
  }

  private breakpointPx(): number {
    const raw = getComputedStyle(this.document.documentElement)
      .getPropertyValue('--bp-compact')
      .trim();
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : FALLBACK_BP_PX;
  }
}
