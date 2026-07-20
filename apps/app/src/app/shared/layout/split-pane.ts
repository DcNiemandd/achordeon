// Split pane — Epic 13
// Spec: PRD-UI-SHELL.md §5.1

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import { Panes } from './panes';
import { Viewport } from './viewport';

/** Sized to hold the render-settings dialog (520px) with margin, so the dialog
 * gets its full width instead of being clamped to a narrow pane. Coupled to that
 * number — move one, check the other (PRD-UI-SHELL.md §4, §5.1). */
const MIN_A_PX = 560;
/** No structural floor; a narrow pane B is a deliberate "focus on the text" drag. */
const MIN_B_PX = 240;
const RESET_RATIO = 0.5;
const KEY_STEP = 0.02;

/**
 * Two panes with a draggable divider.
 *
 * What happens when there is not enough width is the **feature's** call, and
 * there are two answers (`narrow`):
 *
 * - `switch` — one pane at a time below the compact breakpoint, with the shell's
 *   bottom bar offering the switcher. Right where the panes are alternatives:
 *   you write the song, then you look at the render.
 * - `stack` — both panes, one above the other, below the much narrower stack
 *   breakpoint. Right where the panes are a **pair**: the songbook builder moves
 *   rows from one list to the other, and a tab that hides the destination is a
 *   transfer list you cannot transfer across (and, once Epic 14 lands, cannot
 *   drag across either).
 *
 * Hand-rolled: no ARIA pattern covers it (it is layout, not semantics), and
 * `angular-split` is stale against Angular 21. ~60 lines is the right price.
 *
 * **Stateless about persistence** — it takes a ratio in and emits the settled
 * ratio out; the shell decides whether that is worth storing.
 */
@Component({
  selector: 'app-split-pane',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.is-compact]': 'isSwitching()',
    '[class.is-stacked]': 'isStacked()',
    '[style.--split]': 'ratio()',
  },
  template: `
    <div
      class="pane"
      [class.is-absent]="isAbsent('a')"
      [class.is-covered]="isCovered('a')"
      data-testid="pane-a"
    >
      <ng-content select="[pane-a]" />
    </div>

    @if (isResizable()) {
      <div
        class="resizer"
        role="separator"
        tabindex="0"
        aria-orientation="vertical"
        [attr.aria-label]="resizerLabel()"
        [attr.aria-valuenow]="percent()"
        aria-valuemin="0"
        aria-valuemax="100"
        data-testid="split-resizer"
        (pointerdown)="onPointerDown($event)"
        (dblclick)="reset()"
        (keydown.arrowleft)="nudge(-KEY_STEP, $event)"
        (keydown.arrowright)="nudge(KEY_STEP, $event)"
        (keydown.home)="commit(RESET_RATIO, $event)"
      ></div>
    }

    <div
      class="pane"
      [class.is-absent]="isAbsent('b')"
      [class.is-covered]="isCovered('b')"
      data-testid="pane-b"
    >
      <ng-content select="[pane-b]" />
    </div>
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: calc(var(--split) * 100%) auto 1fr;
      min-height: 0;
      min-width: 0;
      block-size: 100%;
    }

    /* Stacked: both panes, one above the other, each keeping its own scroll.
       Rows rather than a share of the height — a transfer list is read top to
       bottom, and pane A's search box plus a few rows is what you need to see of
       it while you work in pane B. */
    :host(.is-stacked) {
      grid-template-columns: 1fr;
      grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
    }

    /* Compact: one column, and the two panes STACK in the single cell rather
       than the inactive one being removed. That is deliberate — a covered pane
       stays in the DOM, so a focused editor keeps the on-screen keyboard when
       you flip to the render and back. display:none would destroy the editor and
       drop the keyboard every time you switched tab. */
    :host(.is-compact) {
      grid-template-columns: 1fr;
      grid-template-rows: 1fr;
    }

    :host(.is-compact) .pane {
      grid-area: 1 / 1;
      /* An opaque base, so the pane on top fully hides the one beneath even where
         its own content does not paint every pixel. */
      background: var(--surface);
    }

    .pane {
      min-inline-size: 0;
      min-block-size: 0;
      overflow: auto;
    }

    /* The unused second pane of a single-pane frame (hasTwoPanes=false): truly
       gone, not stacked — there is no tab to bring it back and nothing to keep
       focused behind. */
    .is-absent {
      display: none;
    }

    /* The inactive tab in a compact split: underneath, and inert to touch so a
       tap lands on the pane on top. Kept visible (not hidden) on purpose — see
       the stacking note above. */
    :host(.is-compact) .pane.is-covered {
      z-index: 0;
      pointer-events: none;
    }

    :host(.is-compact) .pane:not(.is-covered) {
      z-index: 1;
    }

    /* The seam between stacked panes: a rule, not a grab target — there is no
       ratio to drag when the panes are rows. */
    :host(.is-stacked) .pane:last-child {
      border-block-start: 1px solid var(--border);
    }

    .resizer {
      /* An 8px grab target over a 1px rule: the hit area is not the hairline. */
      inline-size: 8px;
      margin-inline: -4px;
      cursor: col-resize;
      background: none;
      border: 0;
      position: relative;
      z-index: 1;
      touch-action: none;
    }

    .resizer::after {
      content: '';
      position: absolute;
      inset-block: 0;
      inset-inline-start: 50%;
      inline-size: 1px;
      translate: -50% 0;
      background: var(--border);
      transition: background var(--duration-fast) var(--ease);
    }

    .resizer:hover::after,
    .resizer:focus-visible::after {
      background: var(--brand);
      inline-size: 2px;
    }
  `,
})
export class SplitPane {
  protected readonly viewport = inject(Viewport);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly panes = inject(Panes);

  constructor() {
    // Tell the shell whether it has a switcher to draw, and what it is showing.
    // The bar is the shell's and the split is the feature's; this is the one
    // fact that has to cross (see Panes).
    effect(() =>
      this.panes.report(
        this.isSwitching() && this.hasTwoPanes(),
        this.activePane(),
      ),
    );
    inject(DestroyRef).onDestroy(() => this.panes.clear());
  }

  /** 0..1 — pane A's share of the width. */
  readonly ratio = input(RESET_RATIO);
  /** Which pane is visible when compact. Ignored above the breakpoint. */
  readonly activePane = input<'a' | 'b'>('a');
  /** Single-pane modules still use this component for the pane-A frame. */
  readonly hasTwoPanes = input(true);
  /** What too little width means here — see the class comment. */
  readonly narrow = input<'switch' | 'stack'>('switch');
  readonly resizerLabel = input($localize`:@@splitPane.resizer:Resize panels`);

  /** Emitted on pointer-up / keyboard commit — never mid-drag. */
  readonly ratioChange = output<number>();

  /** Showing one pane at a time, with a switcher in the shell's bottom bar. */
  protected readonly isSwitching = computed(
    () => this.narrow() === 'switch' && this.viewport.isCompact(),
  );

  /** Both panes, one above the other. */
  protected readonly isStacked = computed(
    () =>
      this.narrow() === 'stack' &&
      this.hasTwoPanes() &&
      this.viewport.isStacked(),
  );

  /** The divider exists only while the panes actually sit side by side. */
  protected readonly isResizable = computed(
    () => this.hasTwoPanes() && !this.isSwitching() && !this.isStacked(),
  );

  protected readonly KEY_STEP = KEY_STEP;
  protected readonly RESET_RATIO = RESET_RATIO;
  protected readonly percent = computed(() => Math.round(this.ratio() * 100));

  /** The dropped second pane of a single-pane frame — removed, not stacked. */
  protected isAbsent(pane: 'a' | 'b'): boolean {
    return !this.hasTwoPanes() && pane === 'b';
  }

  /** The inactive tab of a compact split — kept in the DOM, stacked underneath. */
  protected isCovered(pane: 'a' | 'b'): boolean {
    return (
      this.isSwitching() && this.hasTwoPanes() && this.activePane() !== pane
    );
  }

  protected onPointerDown(event: PointerEvent): void {
    const target = event.target as HTMLElement;
    target.setPointerCapture(event.pointerId);
    event.preventDefault();

    const element = this.host.nativeElement as HTMLElement;

    // The drag writes a CSS variable directly and only emits on release. The
    // render preview is an SVG regenerated from layout() on resize — feeding it
    // every pointermove would thrash it (PRD-UI-SHELL.md §5.1). It reacts to its
    // own ResizeObserver instead.
    const onMove = (move: PointerEvent) => {
      element.style.setProperty('--split', String(this.ratioFor(move.clientX)));
    };

    const onUp = (up: PointerEvent) => {
      target.releasePointerCapture(up.pointerId);
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
      this.ratioChange.emit(this.ratioFor(up.clientX));
    };

    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
  }

  protected nudge(delta: number, event: Event): void {
    this.commit(this.ratio() + delta, event);
  }

  protected commit(ratio: number, event: Event): void {
    event.preventDefault();
    this.ratioChange.emit(this.clamp(ratio));
  }

  protected reset(): void {
    this.ratioChange.emit(RESET_RATIO);
  }

  /** Pointer x -> ratio, clamped so neither pane drops under its minimum. */
  private ratioFor(clientX: number): number {
    const box = (
      this.host.nativeElement as HTMLElement
    ).getBoundingClientRect();
    return this.clamp((clientX - box.left) / box.width, box.width);
  }

  private clamp(ratio: number, width?: number): number {
    const box =
      width ??
      (this.host.nativeElement as HTMLElement).getBoundingClientRect().width;
    if (box <= 0) {
      return ratio;
    }
    const min = MIN_A_PX / box;
    const max = 1 - MIN_B_PX / box;
    // A viewport too narrow to satisfy both minimums: split the difference
    // rather than let max < min invert the clamp.
    if (min > max) {
      return RESET_RATIO;
    }
    return Math.min(max, Math.max(min, ratio));
  }
}
