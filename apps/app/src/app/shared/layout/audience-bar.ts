// Audience bar — Epic 9 ▸ viewer controls
// Spec: docs/achordeon-implementation.md §Epic 9
//
// The viewer's controls, dropped into the shell's one bottom bar so a phone
// shows a single bar — the same composition as StageBar. Three icon-only targets
// (no labels): Summary · Fullscreen · More, where More holds the rarer acts
// (lobby info, hide chords, transpose, leave). It reads AudienceSession, never a
// store.

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { CdkConnectedOverlay, CdkOverlayOrigin } from '@angular/cdk/overlay';
import { Button, Icon } from '../../primitives';
import { AudienceSession } from './audience-session';
import { Fullscreen } from './fullscreen';
import { transposeActionLabel } from './transpose';
import { turnPageLabel } from './turn-label';
import { UiStore } from './ui-store';
import { TransposeStepper } from './transpose-stepper';

@Component({
  selector: 'app-audience-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Button,
    Icon,
    CdkConnectedOverlay,
    CdkOverlayOrigin,
    CdkTrapFocus,
    TransposeStepper,
  ],
  host: { '(document:keydown.escape)': 'onEscape()' },
  template: `
    <div
      class="bar"
      role="group"
      cdkOverlayOrigin
      #barOrigin="cdkOverlayOrigin"
      [attr.aria-label]="groupLabel"
    >
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
          role="menuitem"
          data-testid="audience-sync"
          (click)="onSync()"
        >
          <app-icon name="reset" />
          {{ syncLabel }}
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

        <!-- The viewer's own key, exactly like Hide chords above it: the
             performer sends one render, and the instrument in front of this
             screen may not be the one on stage. The offset rides in the label,
             the way the performer's menu carries it. -->
        <button
          type="button"
          class="item"
          role="menuitem"
          aria-haspopup="dialog"
          [class.is-active]="session.transpose() !== 0"
          data-testid="audience-transpose"
          (click)="onTranspose()"
        >
          <span class="item-icon">
            <app-icon name="note" />
            <app-icon class="badge" name="transposeBoth" />
          </span>
          {{ transposeLabel() }}
        </button>

        <!-- The dark page — the viewer's own, exactly like Hide chords above
             it. The performer never sends this: a stage is dark and a kitchen
             table is not, and each screen answers for the room it is in
             (CONTEXT.md §Audience). It overrides the app's setting for this
             viewing only. -->
        <button
          type="button"
          class="item"
          role="menuitemcheckbox"
          [attr.aria-checked]="session.isSongDark()"
          [class.is-active]="session.isSongDark()"
          data-testid="audience-dark-page"
          (click)="onDarkPage()"
        >
          <app-icon name="moon" />
          {{ darkPageLabel }}
        </button>

        <!-- Turn the page (ADR-0013). Only here when a quarter turn would gain
             this song room: a control that cannot act is not offered, and the
             row appearing is itself the app saying this song is not using the
             screen it arrived on. The viewer's own, like everything above it —
             the performer is not turning their phone. -->
        @if (ui.isPageTurnOffered()) {
          <button
            type="button"
            class="item"
            role="menuitemcheckbox"
            [attr.aria-checked]="ui.isPageTurnArmed()"
            [class.is-active]="ui.isPageTurnArmed()"
            data-testid="audience-turn-page"
            (click)="onTurnPage()"
          >
            <span class="item-icon">
              <!-- The device turns with the page: armed, the phone is drawn the
                   quarter round the song will be. -->
              <app-icon
                name="smartphone"
                [class.is-turned]="ui.isPageTurnArmed()"
              />
              <app-icon class="badge" name="rotateCcw" />
            </span>
            {{ turnPageLabel }}
          </button>
        }

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

    <!-- The transpose sheet — the performer's, in the viewer's bar. It stays up
         while you step so the song you are judging it against stays visible; the
         backdrop or Escape puts it down. -->
    <ng-template
      [cdkConnectedOverlay]="{ origin: barOrigin }"
      [cdkConnectedOverlayOpen]="isTransposeOpen()"
      [cdkConnectedOverlayPositions]="positions"
      [cdkConnectedOverlayHasBackdrop]="true"
      cdkConnectedOverlayBackdropClass="cdk-overlay-transparent-backdrop"
      (backdropClick)="closeTranspose()"
      (detach)="closeTranspose()"
    >
      <div
        class="sheet"
        cdkTrapFocus
        [cdkTrapFocusAutoCapture]="true"
        role="dialog"
        [attr.aria-label]="transposeTitle"
        data-testid="audience-transpose-sheet"
      >
        <span class="sheet-title">{{ transposeTitle }}</span>
        <app-transpose-stepper
          [value]="session.transpose()"
          (stepped)="session.transposeBy($event)"
          (cleared)="session.resetTranspose()"
        />
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

    /* The performing menu's composed glyph, unchanged: a note badged with both
       directions, held in the 20px a plain <app-icon> would have taken. */
    .item-icon {
      position: relative;
      flex: none;
      display: inline-flex;
      inline-size: 20px;
      block-size: 20px;
    }

    /* Turn the page, armed: the phone lies down the same quarter turn the song
       does. The arrow beside it does not move — it names the act, and the act is
       the same one whichever way the page is currently lying. */
    .item-icon app-icon.is-turned {
      transform: rotate(-90deg);
      transition: transform 150ms ease;
    }

    .item-icon .badge {
      --icon-size: 14px;
      position: absolute;
      inset-block-start: -1px;
      inset-inline-end: -2px;
      color: var(--brand);
    }

    .item.is-danger {
      color: var(--danger, #c0362c);
    }

    .item.is-danger:hover {
      background: color-mix(in srgb, var(--danger, #c0362c) 12%, transparent);
    }

    /* The performing bar's sheet, to the pixel: the two bars read alike, and so
       do the panels they raise. */
    .sheet {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-2) var(--space-3);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      background: var(--surface-overlay);
      box-shadow: var(--shadow-2);
    }

    .sheet-title {
      font-size: var(--text-sm);
      color: var(--text-muted);
    }
  `,
})
export class AudienceBar {
  protected readonly session = inject(AudienceSession);
  protected readonly fullscreen = inject(Fullscreen);
  /** Turn the page is device-local and shared with Stage — one flag for the
   * Performance view, so it is `UiStore`'s rather than either session's. */
  protected readonly ui = inject(UiStore);

  protected readonly isMenuOpen = signal(false);
  protected readonly isTransposeOpen = signal(false);

  protected readonly transposeLabel = computed(() =>
    transposeActionLabel(this.session.transpose()),
  );

  protected readonly turnPageLabel = turnPageLabel;

  protected closeMenu(): void {
    this.isMenuOpen.set(false);
  }

  /** Whichever is up. Both, in the order they stack, so one Escape is enough. */
  protected onEscape(): void {
    this.closeMenu();
    this.closeTranspose();
  }

  protected closeTranspose(): void {
    this.isTransposeOpen.set(false);
  }

  /** The menu hands over to the sheet: two panels over one song is one too many. */
  protected onTranspose(): void {
    this.closeMenu();
    this.isTransposeOpen.set(true);
  }

  protected onLobby(): void {
    this.closeMenu();
    this.session.openLobby();
  }

  protected onSync(): void {
    this.closeMenu();
    this.session.sync();
  }

  protected onHideChords(): void {
    this.session.toggleHideChords();
  }

  /** The menu stays open, as Hide chords does: both are things you flip while
   * looking at the song to see whether you like it better that way. */
  protected onDarkPage(): void {
    this.session.toggleSongDark();
  }

  /** Stays open like the two above it: you turn the page, look, and turn it
   * back if your hands disagree. */
  protected onTurnPage(): void {
    this.ui.togglePageTurn();
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

  /** Opens upward: both the menu and the sheet hang off the bar. */
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
  protected readonly syncLabel = $localize`:@@audience.sync:Re-sync`;
  protected readonly hideChordsLabel = $localize`:@@audience.hideChords:Hide chords`;
  // The same words as the performing menu, so the one id serves both bars —
  // the pattern `@@stage.menu` already follows here.
  protected readonly darkPageLabel = $localize`:@@stage.darkPage:Dark page`;
  protected readonly leaveLabel = $localize`:@@audience.exit:Leave audience`;
  protected readonly transposeTitle = $localize`:@@transpose.title:Transpose`;
  protected readonly enterFullscreenLabel = $localize`:@@stage.enterFullscreen:Enter fullscreen`;
  protected readonly exitFullscreenLabel = $localize`:@@stage.exitFullscreen:Exit fullscreen`;
}
