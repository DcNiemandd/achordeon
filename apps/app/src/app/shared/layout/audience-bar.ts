// Audience bar — Epic 9 ▸ viewer controls
// Spec: docs/achordeon-implementation.md §Epic 9
//
// The viewer's controls, dropped into the shell's one bottom bar so a phone
// shows a single bar — the same composition as StageBar. Three icon-only targets
// (no labels): Summary · Fullscreen · More, where More holds the rarer acts
// (lobby info, hide chords, leave). It reads AudienceSession, never a store.

import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { CdkConnectedOverlay, CdkOverlayOrigin } from '@angular/cdk/overlay';
import { Button, Icon } from '../../primitives';
import { AudienceSession } from './audience-session';
import { Fullscreen } from './fullscreen';

@Component({
  selector: 'app-audience-bar',
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
        [class.is-active]="session.isSummaryOpen()"
        [attr.aria-pressed]="session.isSummaryOpen()"
        [attr.aria-label]="summaryLabel"
        data-testid="audience-summary"
        (click)="session.toggleSummary()"
      >
        <app-icon name="list" />
      </button>

      <button
        appButton
        type="button"
        variant="ghost"
        class="control"
        [attr.aria-pressed]="fullscreen.isActive()"
        [attr.aria-label]="fullscreenLabel()"
        data-testid="audience-fullscreen"
        (click)="fullscreen.toggle()"
      >
        <app-icon
          [name]="fullscreen.isActive() ? 'fullscreenExit' : 'fullscreen'"
        />
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
        data-testid="audience-menu"
        (click)="isMenuOpen.set(!isMenuOpen())"
      >
        <app-icon name="more" />
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
        data-testid="audience-menu-popup"
      >
        <button
          type="button"
          class="item"
          role="menuitem"
          data-testid="audience-lobby"
          (click)="onLobby()"
        >
          <app-icon name="audience" />
          {{ lobbyLabel }}
        </button>

        <button
          type="button"
          class="item"
          role="menuitemcheckbox"
          [attr.aria-checked]="session.hideChords()"
          [class.is-active]="session.hideChords()"
          data-testid="audience-hide-chords"
          (click)="onHideChords()"
        >
          <app-icon name="note" />
          {{ hideChordsLabel }}
        </button>

        <button
          type="button"
          class="item is-danger"
          role="menuitem"
          data-testid="audience-exit"
          (click)="onLeave()"
        >
          <app-icon name="close" />
          {{ leaveLabel }}
        </button>
      </div>
    </ng-template>
  `,
  styles: `
    :host {
      flex: 1;
      min-inline-size: 0;
    }

    /* Three equal thumb targets, icon-only (no labels). */
    .bar {
      display: flex;
      gap: 2px;
    }

    .control {
      flex: 1;
      min-inline-size: 0;
      block-size: var(--tap-target);
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

    .item.is-active {
      color: var(--brand);
    }

    .item.is-danger {
      color: var(--danger, #c0362c);
    }

    .item.is-danger:hover {
      background: color-mix(in srgb, var(--danger, #c0362c) 12%, transparent);
    }
  `,
})
export class AudienceBar {
  protected readonly session = inject(AudienceSession);
  protected readonly fullscreen = inject(Fullscreen);

  protected readonly isMenuOpen = signal(false);

  protected closeMenu(): void {
    this.isMenuOpen.set(false);
  }

  protected onLobby(): void {
    this.closeMenu();
    this.session.openLobby();
  }

  protected onHideChords(): void {
    this.session.toggleHideChords();
  }

  protected onLeave(): void {
    this.closeMenu();
    this.session.leave();
  }

  protected fullscreenLabel(): string {
    return this.fullscreen.isActive()
      ? this.exitFullscreenLabel
      : this.enterFullscreenLabel;
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

  protected readonly groupLabel = $localize`:@@audience.controls:Audience controls`;
  protected readonly summaryLabel = $localize`:@@audience.summary:Song list`;
  protected readonly menuLabel = $localize`:@@stage.menu:More`;
  protected readonly lobbyLabel = $localize`:@@audience.lobby:Lobby`;
  protected readonly hideChordsLabel = $localize`:@@audience.hideChords:Hide chords`;
  protected readonly leaveLabel = $localize`:@@audience.exit:Leave audience`;
  protected readonly enterFullscreenLabel = $localize`:@@stage.enterFullscreen:Enter fullscreen`;
  protected readonly exitFullscreenLabel = $localize`:@@stage.exitFullscreen:Exit fullscreen`;
}
