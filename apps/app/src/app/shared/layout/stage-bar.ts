// Stage bar — Epic 8 ▸ performing mode (mobile)
// Spec: apps/docs/docs/stage-audience/index.mdx (Prev | Summary | Menu | Next)

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { CdkConnectedOverlay, CdkOverlayOrigin } from '@angular/cdk/overlay';
import { Button, Icon } from '../../primitives';
import { Fullscreen } from './fullscreen';
import { StageSession } from './stage-session';
import { transposeActionLabel } from './transpose';
import { TransposeStepper } from './transpose-stepper';
import { turnPageLabel } from './turn-label';
import { UiStore } from './ui-store';

/**
 * The performing controls, dropped into the shell's bottom bar so a phone shows
 * **one** bar (the shell's), not a second one of the feature's. The docs order
 * is `Prev | Summary | Menu | Next`; the menu carries the rarer acts —
 * Fullscreen, the audience, Exit — so the four thumb targets stay big.
 *
 * It reads `StageSession`, never a business store: the shell may not touch the
 * business layer (the presenter rule, PRD-UI-SHELL.md §3), and the
 * render-derived state it does not need lives in the route-scoped presenter.
 * (`UiStore` is fair game — it is shell state itself, §7.) The menu is a CDK
 * overlay opening upward, the same composition as `ModuleSwitcher`.
 */
@Component({
  selector: 'app-stage-bar',
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
        [disabled]="!session.hasPrev()"
        [attr.aria-label]="prevLabel"
        data-testid="stage-prev"
        (click)="session.prev()"
      >
        <app-icon name="chevronLeft" />
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

        <!-- The dark page. A checkbox, not an act: it stays on until the
             performer turns it off, so the row lights up rather than swapping
             its label the way Fullscreen above does. It overrides the app's
             setting for THIS performance only — the library keeps drawing what
             the theme says, and the audience keeps its own answer. -->
        <button
          type="button"
          class="item"
          role="menuitemcheckbox"
          [attr.aria-checked]="session.isSongDark()"
          [class.is-active]="session.isSongDark()"
          data-testid="stage-dark-page"
          (click)="session.toggleSongDark()"
        >
          <app-icon name="moon" />
          {{ darkPageLabel }}
        </button>

        <!-- Turn the page (ADR-0013). Only here when a quarter turn would gain
             this song room — a control that cannot act is not offered, and the
             row appearing is itself the app pointing out that the song is not
             using the screen it is on. Device-local like the dark page, and the
             same flag the Audience reads: it is a fact about the hands holding
             this phone, not about the performance. -->
        @if (ui.isPageTurnOffered()) {
          <button
            type="button"
            class="item"
            role="menuitemcheckbox"
            [attr.aria-checked]="ui.isPageTurnArmed()"
            [class.is-active]="ui.isPageTurnArmed()"
            data-testid="stage-turn-page"
            (click)="onTurnPage()"
          >
            <span class="item-icon">
              <!-- The device turns with the page: armed, the phone is drawn the
                   quarter round the song will be, which is the state showing
                   itself rather than a word for it. -->
              <app-icon
                name="smartphone"
                [class.is-turned]="ui.isPageTurnArmed()"
              />
              <app-icon class="badge" name="rotateCcw" />
            </span>
            {{ turnPageLabel }}
          </button>
        }

        <!-- The offset is in the row's own label, the way the audience row says
             which act it is: behind ⋯ there is nothing else on screen to show a
             number, and "Transpose" alone would not admit that the set has been
             running a tone up for the last half hour.

             The note is badged with BOTH arrows, unlike the stepper it opens:
             this row is the act, not a step of it, and a single arrow would
             promise that tapping it moves the song up. -->
        <button
          type="button"
          class="item"
          role="menuitem"
          aria-haspopup="dialog"
          [class.is-active]="session.transpose() !== 0"
          data-testid="stage-transpose"
          (click)="onTranspose()"
        >
          <span class="item-icon">
            <app-icon name="note" />
            <app-icon class="badge" name="transposeBoth" />
          </span>
          {{ transposeLabel() }}
        </button>

        <!-- The one action that changes its mind: create a lobby, or manage the
             one already running. Lit brand while it is running, the same
             is-active the summary control uses, so the row reads as live and
             not merely as another thing to start. -->
        <button
          type="button"
          class="item"
          role="menuitem"
          [class.is-active]="session.hasLobby()"
          data-testid="stage-audience"
          (click)="onAudience()"
        >
          <app-icon name="audience" />
          {{ session.audienceLabel() }}
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

    <!-- The transpose sheet: a strip at the foot of the screen, the shape the
         update offer already uses there. Not the menu it was opened from and not
         a modal — you step, you look at the song, you step again, and the thing
         you are looking at must stay on screen. It is anchored to the bar rather
         than to the ⋯ button so it sits centred over the width of the screen. -->
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
        data-testid="stage-transpose-sheet"
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

    /* Four equal thumb targets across the bar's leftover width — the same even
       split the pane switcher uses, so the two bars read alike. */
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

    /* A composed glyph in a row of plain ones: the span is the 20px an
       <app-icon> would have taken, so the labels stay in one column. */
    .item-icon {
      position: relative;
      flex: none;
      display: inline-flex;
      inline-size: 20px;
      block-size: 20px;
    }

    .item-icon .badge {
      --icon-size: 14px;
      position: absolute;
      inset-block-start: -1px;
      inset-inline-end: -2px;
      color: var(--brand);
    }

    /* Turn the page, armed: the phone lies down the same quarter turn the song
       does, counter-clockwise like everything else sideways in Achordeon. The
       arrow beside it does not move — it names the act, and the act is the same
       one whichever way the page is currently lying. */
    .item-icon app-icon.is-turned {
      transform: rotate(-90deg);
      transition: transform 150ms ease;
    }

    .item.is-danger {
      color: var(--danger, #c0362c);
    }

    .item.is-danger:hover {
      background: color-mix(in srgb, var(--danger, #c0362c) 12%, transparent);
    }

    /* The update bar's shape, because it is the same kind of thing in the same
       place: one line, sitting above the bottom bar rather than over the song. */
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
export class StageBar {
  protected readonly session = inject(StageSession);
  protected readonly fullscreen = inject(Fullscreen);
  /** Turn the page is device-local and shared with the Audience — one flag for
   * the Performance view, so it is `UiStore`'s rather than the session's. */
  protected readonly ui = inject(UiStore);
  private readonly router = inject(Router);

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

  /** Stays open, like the dark page above it: you turn the page, look, and turn
   * it back if your hands disagree with the screen. */
  protected onTurnPage(): void {
    this.ui.togglePageTurn();
  }

  /** The menu hands over to the sheet: two panels over one song is one too many. */
  protected onTranspose(): void {
    this.closeMenu();
    this.isTransposeOpen.set(true);
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

  /** Opens upward: both the menu and the sheet hang off the bottom bar. */
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
  /** "Page", not "mode": what turns over is the paper the song is printed on,
   * and the app's own theme is untouched by it. */
  protected readonly darkPageLabel = $localize`:@@stage.darkPage:Dark page`;
  protected readonly exitLabel = $localize`:@@stage.exit:Exit performing`;
  protected readonly transposeTitle = $localize`:@@transpose.title:Transpose`;
}
