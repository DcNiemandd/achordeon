// Split pane — Epic 13
// Spec: PRD-UI-SHELL.md §5.1

import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { Viewport } from './viewport';

/** Sized to hold the render-settings dialog (~300px) with margin, so the dialog
 * never spills over the render. Coupled to that number — move one, check the
 * other (PRD-UI-SHELL.md §4, §5.1). */
const MIN_A_PX = 320;
/** No structural floor; a narrow pane B is a deliberate "focus on the text" drag. */
const MIN_B_PX = 240;
const RESET_RATIO = 0.5;
const KEY_STEP = 0.02;

/**
 * Two panes with a draggable divider, collapsing to one pane below the compact
 * breakpoint.
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
    '[class.is-compact]': 'viewport.isCompact()',
    '[style.--split]': 'ratio()',
  },
  template: `
    <div class="pane" [class.is-hidden]="isHidden('a')" data-testid="pane-a">
      <ng-content select="[pane-a]" />
    </div>

    @if (!viewport.isCompact() && hasTwoPanes()) {
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

    <div class="pane" [class.is-hidden]="isHidden('b')" data-testid="pane-b">
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

    :host(.is-compact) {
      grid-template-columns: 1fr;
    }

    .pane {
      min-inline-size: 0;
      min-block-size: 0;
      overflow: auto;
    }

    .is-hidden {
      display: none;
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

  /** 0..1 — pane A's share of the width. */
  readonly ratio = input(RESET_RATIO);
  /** Which pane is visible when compact. Ignored above the breakpoint. */
  readonly activePane = input<'a' | 'b'>('a');
  /** Single-pane modules still use this component for the pane-A frame. */
  readonly hasTwoPanes = input(true);
  readonly resizerLabel = input($localize`:@@splitPane.resizer:Resize panels`);

  /** Emitted on pointer-up / keyboard commit — never mid-drag. */
  readonly ratioChange = output<number>();

  protected readonly KEY_STEP = KEY_STEP;
  protected readonly RESET_RATIO = RESET_RATIO;
  protected readonly percent = computed(() => Math.round(this.ratio() * 100));

  protected isHidden(pane: 'a' | 'b'): boolean {
    if (!this.hasTwoPanes()) {
      return pane === 'b';
    }
    return this.viewport.isCompact() && this.activePane() !== pane;
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
