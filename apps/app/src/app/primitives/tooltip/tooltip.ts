// Tooltip — Epic 13
// Spec: PRD-UI-SHELL.md §5.2
//
// Angular Aria has no tooltip pattern, so this is ours, on the CDK's Overlay.
// Note the CDK's own `keydownEvents()` / `outsidePointerEvents()` are
// Observable-shaped; we use native listeners instead so the no-RxJS rule
// (PRD-INFRASTRUCTURE.md §3) holds without a single conversion.

import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import {
  Overlay,
  OverlayPositionBuilder,
  type OverlayRef,
} from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';

/** Grace period so the pointer can travel from the host onto the tooltip
 * without it vanishing — WCAG 1.4.13 "hoverable". */
const LEAVE_GRACE_MS = 120;
const SHOW_DELAY_MS = 350;

let nextId = 0;

@Component({
  selector: 'app-tooltip-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `{{ text() }}`,
  styles: `
    :host {
      display: block;
      max-inline-size: 32ch;
      padding: var(--space-1) var(--space-2);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--surface-overlay);
      color: var(--text);
      box-shadow: var(--shadow-2);
      font-family: var(--font-ui);
      font-size: var(--text-sm);
      line-height: var(--leading-tight);
      white-space: pre-line;
    }
  `,
})
export class TooltipPanel {
  readonly text = signal('');
}

/**
 * `[appTooltip]` — a label for an icon-only control, or a help toggle-tip.
 *
 * Two triggers, because the two uses have genuinely different needs:
 *
 * - `hover` (default) — names an icon-only button. Opens on hover **and**
 *   keyboard focus. Absent on touch, by design: we do not fake it with
 *   long-press, which is why every icon-only control also carries a real
 *   `aria-label`.
 * - `click` — the settings `(?)`. Touch has no hover and the settings panel is
 *   edited on mobile, so a hover-only help affordance would simply not exist
 *   there. Stays open until dismissed, because it is prose you need time to read.
 *
 * Accessible naming (PRD-UI-SHELL.md §5.2): a `hover` tooltip repeats the host's
 * own `aria-label`, so its panel is `aria-hidden` and it announces once. A
 * `click` tooltip carries *different* content, so it wires `aria-describedby`.
 */
@Directive({
  selector: '[appTooltip]',
  host: {
    '(pointerenter)': 'onPointerEnter()',
    '(pointerleave)': 'onPointerLeave()',
    '(focus)': 'onFocus()',
    '(blur)': 'hide()',
    '(click)': 'onClick()',
    '[attr.aria-describedby]': 'describedBy()',
  },
})
export class Tooltip {
  readonly appTooltip = input.required<string>();
  readonly appTooltipTrigger = input<'hover' | 'click'>('hover');

  private readonly overlay = inject(Overlay);
  private readonly positions = inject(OverlayPositionBuilder);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly document = inject(DOCUMENT);

  private readonly id = `app-tooltip-${nextId++}`;
  private readonly isOpen = signal(false);
  private ref: OverlayRef | null = null;
  private panel: TooltipPanel | null = null;
  private leaveTimer: ReturnType<typeof setTimeout> | null = null;
  private showTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly describedBy = () =>
    this.appTooltipTrigger() === 'click' && this.isOpen() ? this.id : null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.hide());
  }

  protected onPointerEnter(): void {
    if (this.appTooltipTrigger() !== 'hover') {
      return;
    }
    this.cancelLeave();
    this.showTimer ??= setTimeout(() => this.show(), SHOW_DELAY_MS);
  }

  protected onPointerLeave(): void {
    if (this.appTooltipTrigger() !== 'hover') {
      return;
    }
    this.scheduleLeave();
  }

  protected onFocus(): void {
    // Keyboard parity: a focused icon button must name itself too.
    if (this.appTooltipTrigger() === 'hover') {
      this.show();
    }
  }

  protected onClick(): void {
    if (this.appTooltipTrigger() !== 'click') {
      return;
    }
    if (this.isOpen()) {
      this.hide();
    } else {
      this.show();
    }
  }

  private show(): void {
    this.clearTimers();
    if (this.ref) {
      return;
    }

    const position = this.positions
      .flexibleConnectedTo(this.host)
      .withPositions([
        {
          originX: 'center',
          originY: 'bottom',
          overlayX: 'center',
          overlayY: 'top',
          offsetY: 6,
        },
        {
          originX: 'center',
          originY: 'top',
          overlayX: 'center',
          overlayY: 'bottom',
          offsetY: -6,
        },
        {
          originX: 'end',
          originY: 'center',
          overlayX: 'start',
          overlayY: 'center',
          offsetX: 6,
        },
        {
          originX: 'start',
          originY: 'center',
          overlayX: 'end',
          overlayY: 'center',
          offsetX: -6,
        },
      ])
      .withPush(true);

    this.ref = this.overlay.create({
      positionStrategy: position,
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
    });

    this.panel = this.ref.attach(new ComponentPortal(TooltipPanel)).instance;
    this.panel.text.set(this.appTooltip());

    const element = this.ref.overlayElement;
    element.id = this.id;
    if (this.appTooltipTrigger() === 'hover') {
      // The host's own aria-label already says this. Announcing it again from
      // the panel would double-name the control.
      element.setAttribute('aria-hidden', 'true');
      element.addEventListener('pointerenter', this.onPanelEnter);
      element.addEventListener('pointerleave', this.onPanelLeave);
    } else {
      element.setAttribute('role', 'tooltip');
    }

    this.document.addEventListener('keydown', this.onKeydown, true);
    this.document.addEventListener(
      'pointerdown',
      this.onDocumentPointerDown,
      true,
    );
    this.isOpen.set(true);
  }

  protected hide(): void {
    this.clearTimers();
    this.document.removeEventListener('keydown', this.onKeydown, true);
    this.document.removeEventListener(
      'pointerdown',
      this.onDocumentPointerDown,
      true,
    );
    this.ref?.dispose();
    this.ref = null;
    this.panel = null;
    this.isOpen.set(false);
  }

  /** WCAG 1.4.13 "dismissible": Esc closes without moving the pointer. */
  private readonly onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      this.hide();
    }
  };

  private readonly onDocumentPointerDown = (event: Event): void => {
    if (this.appTooltipTrigger() !== 'click') {
      return;
    }
    const target = event.target as Node;
    const inHost = (this.host.nativeElement as HTMLElement).contains(target);
    const inPanel = this.ref?.overlayElement.contains(target) ?? false;
    if (!inHost && !inPanel) {
      this.hide();
    }
  };

  private readonly onPanelEnter = (): void => this.cancelLeave();
  private readonly onPanelLeave = (): void => this.scheduleLeave();

  private scheduleLeave(): void {
    this.cancelLeave();
    this.leaveTimer = setTimeout(() => this.hide(), LEAVE_GRACE_MS);
  }

  private cancelLeave(): void {
    if (this.leaveTimer !== null) {
      clearTimeout(this.leaveTimer);
      this.leaveTimer = null;
    }
  }

  private clearTimers(): void {
    this.cancelLeave();
    if (this.showTimer !== null) {
      clearTimeout(this.showTimer);
      this.showTimer = null;
    }
  }
}
