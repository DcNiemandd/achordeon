// Stage bar — Epic 8 ▸ performing mode (mobile)
// Spec: apps/docs/docs/stage-audience/index.mdx (Prev | Summary | Menu | Next)

import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { CdkConnectedOverlay, CdkOverlayOrigin } from '@angular/cdk/overlay';
import { Button, Icon } from '../../primitives';
import { Fullscreen } from './fullscreen';
import { StageSession } from './stage-session';

/**
 * The performing controls, dropped into the shell's bottom bar so a phone shows
 * **one** bar (the shell's), not a second one of the feature's. The docs order
 * is `Prev | Summary | Menu | Next`; the menu carries the rarer acts —
 * Fullscreen, Create audience, Exit — so the four thumb targets stay big.
 *
 * It reads `StageSession`, never a store: the shell may not touch the business
 * layer (the presenter rule, PRD-UI-SHELL.md §3), and the render-derived state
 * it does not need lives in the route-scoped presenter. The menu is a CDK
 * overlay opening upward, the same composition as `ModuleSwitcher`.
 */
@Component({
  selector: 'app-stage-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Icon, CdkConnectedOverlay, CdkOverlayOrigin, CdkTrapFocus],
  host: { '(document:keydown.escape)': 'closeMenu()' },
  template: `
    <div class="bar" role="group" [attr.aria-label]="groupLabel">
      <button
        appButton
        type="button"
        variant="ghost"
        class="control"
        [disabled]="!session.hasPrev()"
        [attr.aria-label]="prevLabel"
        data-testid="stage-prev"
        (click)="session.prev()"
      >
        <app-icon name="chevronLeft" />
        {{ prevShort }}
      </button>

      <button
        appButton
        type="button"
        variant="ghost"
        class="control"
        [class.is-active]="session.isSummaryOpen()"
        [attr.aria-pressed]="session.isSummaryOpen()"
        [attr.aria-label]="summaryLabel"
        data-testid="stage-summary"
        (click)="session.toggleSummary()"
      >
        <app-icon name="list" />
        {{ summaryShort }}
      </button>

      <button
        appButton
        type="button"
        variant="ghost"
        class="control"
        cdkOverlayOrigin
        #menuOrigin="cdkOverlayOrigin"
        [attr.aria-label]="menuLabel"
        [attr.aria-expanded]="isMenuOpen()"
        aria-haspopup="true"
        data-testid="stage-menu"
        (click)="isMenuOpen.set(!isMenuOpen())"
      >
        <app-icon name="more" />
        {{ menuShort }}
      </button>

      <button
        appButton
        type="button"
        variant="ghost"
        class="control"
        [disabled]="!session.hasNext()"
        [attr.aria-label]="nextLabel"
        data-testid="stage-next"
        (click)="session.next()"
      >
        <app-icon name="chevronRight" />
        {{ nextShort }}
      </button>
    </div>

    <ng-template
      [cdkConnectedOverlay]="{ origin: menuOrigin }"
      [cdkConnectedOverlayOpen]="isMenuOpen()"
      [cdkConnectedOverlayPositions]="positions"
      [cdkConnectedOverlayHasBackdrop]="true"
      cdkConnectedOverlayBackdropClass="cdk-overlay-transparent-backdrop"
      (backdropClick)="closeMenu()"
      (detach)="closeMenu()"
    >
      <div
        class="menu"
        cdkTrapFocus
        [cdkTrapFocusAutoCapture]="true"
        role="menu"
        [attr.aria-label]="menuLabel"
        data-testid="stage-menu-popup"
      >
        <button
          type="button"
          class="item"
          role="menuitem"
          data-testid="stage-fullscreen"
          (click)="onFullscreen()"
        >
          <app-icon
            [name]="fullscreen.isActive() ? 'fullscreenExit' : 'fullscreen'"
          />
          {{
            fullscreen.isActive() ? exitFullscreenLabel : enterFullscreenLabel
          }}
        </button>

        <button
          type="button"
          class="item"
          role="menuitem"
          data-testid="stage-audience"
          (click)="onAudience()"
        >
          <app-icon name="audience" />
          {{ audienceLabel }}
        </button>

        <button
          type="button"
          class="item is-danger"
          role="menuitem"
          data-testid="stage-exit"
          (click)="onExit()"
        >
          <app-icon name="close" />
          {{ exitLabel }}
        </button>
      </div>
    </ng-template>
  `,
  styles: `
    :host {
      flex: 1;
      min-inline-size: 0;
    }

    /* Four equal thumb targets across the bar's leftover width — the same even
       split the pane switcher uses, so the two bars read alike. */
    .bar {
      display: flex;
      gap: 2px;
    }

    .control {
      flex: 1;
      min-inline-size: 0;
      flex-direction: column;
      gap: 2px;
      block-size: var(--tap-target);
      font-size: var(--text-xs);
    }

    .control app-icon {
      --icon-size: 20px;
    }

    .control.is-active {
      color: var(--brand);
    }

    .menu {
      min-inline-size: 200px;
      padding: var(--space-1);
      background: var(--surface-overlay);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-2);
    }

    .item {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      inline-size: 100%;
      padding: var(--space-3);
      border: 0;
      border-radius: var(--radius-md);
      background: none;
      color: var(--text);
      font: inherit;
      text-align: start;
      cursor: pointer;
    }

    .item:hover {
      background: var(--surface-sunken);
    }

    .item.is-danger {
      color: var(--danger, #c0362c);
    }

    .item.is-danger:hover {
      background: color-mix(in srgb, var(--danger, #c0362c) 12%, transparent);
    }
  `,
})
export class StageBar {
  protected readonly session = inject(StageSession);
  protected readonly fullscreen = inject(Fullscreen);
  private readonly router = inject(Router);

  protected readonly isMenuOpen = signal(false);

  protected closeMenu(): void {
    this.isMenuOpen.set(false);
  }

  protected onFullscreen(): void {
    this.closeMenu();
    void this.fullscreen.toggle();
  }

  protected onAudience(): void {
    this.closeMenu();
    this.session.openAudience();
  }

  protected onExit(): void {
    this.closeMenu();
    this.session.end();
    void this.router.navigate(['/stage']);
  }

  /** Opens upward: the trigger lives in the bottom bar. */
  protected readonly positions = [
    {
      originX: 'center' as const,
      originY: 'top' as const,
      overlayX: 'center' as const,
      overlayY: 'bottom' as const,
      offsetY: -8,
    },
    {
      originX: 'center' as const,
      originY: 'bottom' as const,
      overlayX: 'center' as const,
      overlayY: 'top' as const,
      offsetY: 8,
    },
  ];

  protected readonly groupLabel = $localize`:@@stage.controls:Performance controls`;
  protected readonly prevLabel = $localize`:@@stage.prev:Previous song`;
  protected readonly nextLabel = $localize`:@@stage.next:Next song`;
  protected readonly summaryLabel = $localize`:@@stage.summary:Song list`;
  protected readonly menuLabel = $localize`:@@stage.menu:More`;
  protected readonly enterFullscreenLabel = $localize`:@@stage.enterFullscreen:Enter fullscreen`;
  protected readonly exitFullscreenLabel = $localize`:@@stage.exitFullscreen:Exit fullscreen`;
  protected readonly audienceLabel = $localize`:@@stage.audience:Create an audience`;
  protected readonly exitLabel = $localize`:@@stage.exit:Exit performing`;

  protected readonly prevShort = $localize`:@@stage.prevShort:Prev`;
  protected readonly nextShort = $localize`:@@stage.nextShort:Next`;
  protected readonly summaryShort = $localize`:@@stage.summaryShort:Songs`;
  protected readonly menuShort = $localize`:@@stage.menuShort:More`;
}
