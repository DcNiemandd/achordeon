// Menu — Epic 7 (a three-dot overflow of row actions)
// Spec: PRD-UI-SHELL.md §2 (base components); WAI-ARIA APG (menu button)
//
// A trigger and a popup of commands, on the CDK Overlay — the same seam
// `<app-tooltip>` and the module switcher use, because Angular Aria v21 still
// ships no menu-button pattern we would reuse here. The items are projected, so
// a caller writes ordinary `<button appMenuItem>`s and this owns only the
// opening, the outside-click, the focus trap and the Escape.
//
// **Why a menu at all.** A row that carries edit, rename, duplicate, download,
// export and delete is six targets fighting for one hover strip; past two or
// three, the honest move is to keep the everyday ones out and fold the rest
// behind one button. The trigger says `⋯` and nothing else, so its `aria-label`
// is the whole of its accessible name.

import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  forwardRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  CdkConnectedOverlay,
  CdkOverlayOrigin,
  type ConnectedPosition,
} from '@angular/cdk/overlay';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { Button } from '../button/button';
import { Icon } from '../icon/icon';

/**
 * One command in the popup. A plain button that closes the menu when pressed —
 * a menu that stayed open after you chose from it would be a menu you then have
 * to dismiss, which is a second gesture for one decision.
 */
@Directive({
  selector: 'button[appMenuItem]',
  host: {
    type: 'button',
    role: 'menuitem',
    class: 'app-menu-item',
    '(click)': 'onClick()',
  },
})
export class MenuItem {
  /** Emitted on the click — what the caller binds its action to. */
  readonly chosen = output<void>();

  // The enclosing menu, so a chosen item closes it. `forwardRef` because `Menu`
  // is declared below; optional so the directive is still a plain button if a
  // test mounts it alone.
  private readonly menu = inject(
    forwardRef(() => Menu),
    { optional: true },
  );

  protected onClick(): void {
    this.chosen.emit();
    this.menu?.close();
  }
}

@Component({
  selector: 'app-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkConnectedOverlay, CdkOverlayOrigin, CdkTrapFocus, Button, Icon],
  // On the document, not the panel: the panel is not focusable, so a keydown
  // bound to it would never fire once focus moves onto an item. Escape has to
  // work from wherever focus is.
  host: { '(document:keydown.escape)': 'close()' },
  template: `
    <button
      appButton
      type="button"
      [isIconOnly]="true"
      cdkOverlayOrigin
      #origin="cdkOverlayOrigin"
      [attr.aria-label]="label()"
      [attr.aria-expanded]="isOpen()"
      aria-haspopup="menu"
      [attr.data-testid]="testid()"
      (click)="toggle()"
    >
      <app-icon name="more" />
    </button>

    <ng-template
      [cdkConnectedOverlay]="{ origin }"
      [cdkConnectedOverlayOpen]="isOpen()"
      [cdkConnectedOverlayPositions]="positions"
      [cdkConnectedOverlayHasBackdrop]="true"
      cdkConnectedOverlayBackdropClass="cdk-overlay-transparent-backdrop"
      (backdropClick)="close()"
      (detach)="close()"
    >
      <div
        class="panel"
        role="menu"
        cdkTrapFocus
        [cdkTrapFocusAutoCapture]="true"
        [attr.aria-label]="label()"
        [attr.data-testid]="panelTestid()"
      >
        <!-- Each item closes the menu itself (see MenuItem) — no click handler
             on the panel, which would be a non-interactive element pretending to
             be one. -->
        <ng-content />
      </div>
    </ng-template>
  `,
  styles: `
    .panel {
      min-inline-size: 12rem;
      padding: var(--space-1);
      background: var(--surface-overlay);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-2);
    }

    ::ng-deep .app-menu-item {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      inline-size: 100%;
      justify-content: flex-start;
      padding: var(--space-2) var(--space-3);
    }

    ::ng-deep .app-menu-item.is-danger {
      color: var(--danger, #b42318);
    }
  `,
})
export class Menu {
  /** The trigger's accessible name — it shows only `⋯`, so this is all it says. */
  readonly label = input.required<string>();
  readonly testid = input<string | null>(null);

  protected readonly isOpen = signal(false);

  protected readonly panelTestid = () => {
    const id = this.testid();
    return id ? `${id}-panel` : null;
  };

  protected toggle(): void {
    this.isOpen.update((open) => !open);
  }

  /** Public because a chosen `MenuItem` closes its menu, and Escape does. */
  close(): void {
    this.isOpen.set(false);
  }

  /** Below the trigger, right-aligned; flips above when there is no room. The
   * row actions live at the right edge, so the panel hangs to the left. */
  protected readonly positions: ConnectedPosition[] = [
    {
      originX: 'end',
      originY: 'bottom',
      overlayX: 'end',
      overlayY: 'top',
      offsetY: 4,
    },
    {
      originX: 'end',
      originY: 'top',
      overlayX: 'end',
      overlayY: 'bottom',
      offsetY: -4,
    },
  ];
}
