// Viewport — Epic 13
// Spec: PRD-UI-SHELL.md §6 (single-sourced breakpoint), §8 (no RxJS)

import { DOCUMENT, Injectable, inject, signal } from '@angular/core';

/** Fallbacks if the stylesheet hasn't applied when these are first read. */
const FALLBACK_COMPACT_PX = 1200;
const FALLBACK_STACK_PX = 680;
const FALLBACK_ROW_REORDER_PX = 1000;

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
  private readonly _isRowReorderHidden = signal(false);
  private readonly _isScreenTurnable = signal(false);

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

  /**
   * True below `--bp-row-reorder`: a reorderable row is too narrow to also carry
   * its inline per-row move buttons.
   *
   * A **third** question, above `isStacked` — the songbook builder can still be
   * two panes side by side here and yet want its entry rows to shed the move
   * buttons, leaving the drag handle and the bulk-reorder strip to change the
   * order. The list reads this and drops `canReorder` from its capability set.
   */
  readonly isRowReorderHidden = this._isRowReorderHidden.asReadonly();

  /**
   * Can the person reading this screen physically turn it?
   *
   * **A question about the device, not about the window** — which is why it is
   * `(pointer: coarse)` and not a width. Turning the page (ADR-0013) only helps
   * someone who can rotate the thing they are holding: a phone or a tablet can,
   * a monitor cannot, and a *tablet in landscape* is wide enough to be laid out
   * as a desktop while still being the case this feature exists for. Gating on
   * the breakpoint got that one exactly backwards.
   *
   * The **primary** pointer, deliberately: a touchscreen laptop reports a fine
   * primary pointer and a coarse secondary one, and it is a laptop — offering to
   * turn its page would be offering something the hinge will not do.
   *
   * False where nothing will say, so the control stays hidden rather than
   * appearing on a host that cannot answer for itself.
   */
  readonly isScreenTurnable = this._isScreenTurnable.asReadonly();

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
    this.watch(
      '--bp-row-reorder',
      FALLBACK_ROW_REORDER_PX,
      this._isRowReorderHidden,
    );
    // Not a breakpoint, so not through `watch` — see `isScreenTurnable`.
    this.follow(view, '(pointer: coarse)', this._isScreenTurnable);
  }

  /** Track a media query that is about the device rather than the layout. */
  private follow(
    view: Window,
    query: string,
    into: { set(value: boolean): void },
  ): void {
    const media = view.matchMedia(query);
    into.set(media.matches);
    media.addEventListener('change', (e) => into.set(e.matches));
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
