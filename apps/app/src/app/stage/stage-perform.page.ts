// Stage perform page — Epic 8 ▸ performing mode
// Spec: docs/achordeon-implementation.md §Epic 8; apps/docs/docs/stage-audience/index.mdx

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import qrcode from 'qrcode-generator';
import {
  Button,
  Dialog,
  EmptyState,
  Field,
  Icon,
  Premium,
  Tooltip,
} from '../primitives';
import {
  BlankPage,
  Fullscreen,
  StageSession,
  Viewport,
} from '../shared/layout';
import { SongRender } from '../shared/song-render';
import { StagePerformPresenter } from './stage-perform.presenter';

/** Minimum horizontal travel (px) that counts as a swipe. */
const SWIPE_THRESHOLD_PX = 60;

/**
 * Performing mode: one song at a time, full-screen, swipe to navigate.
 *
 * The bar differs by width, and the two do not share a shape:
 *
 * - **Mobile** renders no bar of its own — the controls live in the shell's one
 *   bottom bar (`StageBar`, reached through `StageSession`), so a phone shows a
 *   single bar, not the feature's stacked on the shell's. There is no title.
 * - **Desktop** keeps its own top grid bar: actions unwrapped on the left,
 *   Prev/Next centered, a red exit cross on the right (the songs/songbooks
 *   close position). The Audience button is icon-only.
 *
 * The performance itself is **persistent**: which book, which song and the
 * lobby live in `StageSession` (root), so leaving for another module keeps the
 * session alive and returning resumes it. Only the exit cross ends it
 * (`session.end()`); leaving the route merely drops fullscreen.
 *
 * Swipe detection uses the Pointer Events API so it works for both mouse and
 * touch. A drag is horizontal when |dx| > SWIPE_THRESHOLD_PX and |dx| > |dy|,
 * which avoids competing with a vertical scroll gesture. Any pointer event on
 * the render reveals the chrome in fullscreen (`fullscreen.reveal()`), so a tap
 * doubles as tap-to-reveal with no dedicated zone (spec).
 *
 * The summary is a non-blocking panel that slides over the render area and
 * stays open until dismissed, so the performer can browse without losing place.
 */
@Component({
  selector: 'app-stage-perform-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [StagePerformPresenter],
  host: {
    '(document:keydown)': 'onKeyDown($event)',
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
  },
  imports: [
    BlankPage,
    SongRender,
    EmptyState,
    Button,
    Field,
    Icon,
    Tooltip,
    Premium,
    Dialog,
  ],
  template: `
    <div
      class="screen"
      (pointerdown)="startSwipe($event)"
      (pointerup)="endSwipe($event)"
    >
      <!-- Desktop only: the feature's own top grid bar. Mobile draws nothing
           here — its controls are the shell's bottom bar (StageBar). -->
      @if (!viewport.isCompact()) {
        <nav
          class="stage-bar stage-bar--top"
          [hidden]="!fullscreen.isChromeVisible()"
          data-testid="stage-bar"
        >
          <!-- Left: title + actions, unwrapped, no overflow menu. -->
          <div class="bar-start">
            <span class="bar-title">{{ presenter.name() }}</span>

            <button
              appButton
              type="button"
              [isIconOnly]="true"
              [class.is-active]="session.isSummaryOpen()"
              [attr.aria-pressed]="session.isSummaryOpen()"
              [attr.aria-label]="summaryLabel"
              [appTooltip]="summaryLabel"
              data-testid="stage-summary"
              (click)="session.toggleSummary()"
            >
              <app-icon name="list" />
            </button>

            <button
              appButton
              type="button"
              [isIconOnly]="true"
              [attr.aria-label]="
                fullscreen.isActive()
                  ? exitFullscreenLabel
                  : enterFullscreenLabel
              "
              [appTooltip]="
                fullscreen.isActive()
                  ? exitFullscreenLabel
                  : enterFullscreenLabel
              "
              data-testid="stage-fullscreen"
              (click)="fullscreen.toggle()"
            >
              <app-icon
                [name]="fullscreen.isActive() ? 'fullscreenExit' : 'fullscreen'"
              />
            </button>

            <!-- Audience: icon-only, plain button; the premium tint lives in
                 the dialog, not on the bar. -->
            <button
              appButton
              type="button"
              [isIconOnly]="true"
              [attr.aria-label]="audienceLabel"
              [appTooltip]="audienceLabel"
              data-testid="stage-audience"
              (click)="session.openAudience()"
            >
              <app-icon name="audience" />
            </button>
          </div>

          <!-- Center: Prev + Next (centered by 1fr/auto/1fr grid). -->
          <div class="bar-nav">
            <button
              appButton
              type="button"
              [isIconOnly]="true"
              [disabled]="!session.hasPrev()"
              [attr.aria-label]="prevLabel"
              [appTooltip]="prevLabel"
              data-testid="stage-prev"
              (click)="session.prev()"
            >
              <app-icon name="chevronLeft" />
            </button>

            <button
              appButton
              type="button"
              [isIconOnly]="true"
              [disabled]="!session.hasNext()"
              [attr.aria-label]="nextLabel"
              [appTooltip]="nextLabel"
              data-testid="stage-next"
              (click)="session.next()"
            >
              <app-icon name="chevronRight" />
            </button>
          </div>

          <!-- Right: red exit cross — same position as songs/songbooks close. -->
          <div class="bar-end-slot">
            <button
              appButton
              type="button"
              [isIconOnly]="true"
              class="btn-exit"
              [attr.aria-label]="exitLabel"
              [appTooltip]="exitLabel"
              data-testid="stage-exit"
              (click)="exit()"
            >
              <app-icon name="close" />
            </button>
          </div>
        </nav>
      }

      <!-- The render — fills whatever the bar left. Any pointer event on the
           render area reveals the chrome in fullscreen mode; startSwipe() calls
           fullscreen.reveal() so a tap (pointerdown without a swipe) also
           works, and no separate click handler is needed on this div. -->
      <div class="render" data-testid="stage-render">
        @if (presenter.isEmpty()) {
          <app-empty-state
            [text]="emptySongbookText"
            data-testid="stage-perform-empty"
          />
        } @else {
          <app-blank-page [ratio]="presenter.pageRatio()">
            @if (presenter.svg(); as svg) {
              <app-song-render [svg]="svg" />
            }
          </app-blank-page>
        }
      </div>

      <!-- Summary panel: a non-blocking overlay with search + jump list.
           Positioned over the render so the song stays visible behind it.
           Escape and the summary button again dismiss it. -->
      @if (session.isSummaryOpen()) {
        <div
          class="summary"
          role="dialog"
          [attr.aria-label]="summaryLabel"
          data-testid="stage-summary-panel"
        >
          <div class="summary-head">
            <h2 class="summary-title">{{ summaryHeading }}</h2>
            <button
              appButton
              type="button"
              [isIconOnly]="true"
              [attr.aria-label]="closeSummaryLabel"
              (click)="session.closeSummary()"
            >
              <app-icon name="close" />
            </button>
          </div>

          <input
            appField
            type="search"
            class="summary-search"
            [placeholder]="searchPlaceholder"
            [value]="presenter.summaryQuery()"
            data-testid="stage-summary-search"
            (input)="onSummarySearch($event)"
          />

          <ul class="summary-list" data-testid="stage-summary-list">
            @for (row of presenter.summaryRows(); track row.index) {
              <li>
                <button
                  type="button"
                  class="summary-row"
                  [class.is-current]="row.index === session.index()"
                  [attr.data-testid]="'stage-summary-row-' + row.index"
                  (click)="session.jumpTo(row.index)"
                >
                  <span class="summary-num">{{ row.index + 1 }}</span>
                  <span class="summary-info">
                    <span class="summary-name">{{ row.name }}</span>
                    @if (row.title) {
                      <span class="summary-sub">{{ row.title }}</span>
                    }
                  </span>
                </button>
              </li>
            }
            @if (presenter.summaryRows().length === 0) {
              <li class="summary-empty">{{ noMatchText }}</li>
            }
          </ul>
        </div>
      }

      <!-- Audience dialog — stub for Epic 9 lobby creation.
           Pre-creation: "Create lobby" button (premium highlighted).
           Post-creation: PIN, audience URL, QR placeholder, "End lobby". -->
      @if (session.audienceState() !== 'closed') {
        <app-dialog
          [title]="audienceDialogTitle"
          mode="container"
          data-testid="stage-audience-dialog"
          (closed)="session.closeAudience()"
        >
          @if (session.audienceState() === 'create') {
            <p class="dialog-info">{{ audienceCreateInfo }}</p>
          }
          @if (session.audienceState() === 'create') {
            <!-- Premium indicator lives in the dialog, not on the bar button. -->
            <app-premium [label]="createLobbyLabel" dialog-actions>
              <button
                appButton
                type="button"
                variant="primary"
                data-testid="stage-create-lobby"
                (click)="session.createLobby()"
              >
                {{ createLobbyLabel }}
              </button>
            </app-premium>
          }

          @if (session.audienceState() === 'active') {
            <!-- Gold tint marks the lobby as a Premium feature, the same
                 language the premium glow speaks elsewhere (§5.3). -->
            <p class="premium-note" data-testid="stage-lobby-premium">
              <app-icon name="favorite" [isFilled]="true" />
              {{ lobbyPremiumNote }}
            </p>
            <dl class="lobby-info">
              <dt>{{ lobbyPinLabel }}</dt>
              <dd class="lobby-pin" data-testid="stage-lobby-pin">
                {{ session.lobbyPin() }}
              </dd>
              <dt>{{ lobbyAudienceLabel }}</dt>
              <dd data-testid="stage-lobby-count">
                {{ session.audienceCount() }}
              </dd>
              <dt>{{ lobbyLinkLabel }}</dt>
              <dd>
                <!-- Click to copy: the link is long and hand-typing it is the
                     thing we are trying to avoid. A button, not a code span, so
                     it is focusable and announces the copy action. -->
                <button
                  type="button"
                  class="lobby-link"
                  data-testid="stage-lobby-link"
                  [attr.aria-label]="isCopied() ? copiedLabel : copyLinkLabel"
                  [appTooltip]="isCopied() ? copiedLabel : copyLinkLabel"
                  (click)="copyLink()"
                >
                  {{ session.audienceUrl() }}
                </button>
              </dd>
              <dt>{{ lobbyQrLabel }}</dt>
              <dd class="lobby-qr" data-testid="stage-lobby-qr">
                <img class="qr" [src]="qrDataUrl()" [alt]="lobbyQrLabel" />
              </dd>
            </dl>
          }
          @if (session.audienceState() === 'active') {
            <button
              appButton
              type="button"
              class="is-danger"
              dialog-actions
              data-testid="stage-end-lobby"
              (click)="session.endLobby()"
            >
              {{ endLobbyLabel }}
            </button>
          }
        </app-dialog>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      block-size: 100%;
    }

    .screen {
      display: flex;
      flex-direction: column;
      block-size: 100%;
      position: relative;
      overflow: hidden;
      /* Prevent text selection during swipe gestures. */
      user-select: none;
    }

    .render {
      flex: 1;
      min-block-size: 0;
    }

    /* Desktop top bar — grid: [left 1fr] [nav auto] [right 1fr] = nav centered */
    .stage-bar--top {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      padding: var(--space-1) var(--space-3);
      background: var(--surface-raised);
      border-block-end: 1px solid var(--border);
    }

    .bar-start {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-wrap: nowrap;
      min-inline-size: 0;
    }

    .bar-title {
      font-size: var(--text-md);
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin-inline-end: var(--space-1);
    }

    .bar-nav {
      display: flex;
      align-items: center;
      gap: var(--space-1);
    }

    .bar-end-slot {
      display: flex;
      justify-content: flex-end;
      align-items: center;
    }

    /* Red exit button — danger color. */
    .btn-exit {
      color: var(--danger, #c0362c);
    }

    .btn-exit:hover:not(:disabled) {
      background: color-mix(in srgb, var(--danger, #c0362c) 12%, transparent);
    }

    /* Summary panel — overlays the render from the right side. */
    .summary {
      position: absolute;
      inset-block: 0;
      inset-inline-end: 0;
      inline-size: min(340px, 80cqi);
      display: flex;
      flex-direction: column;
      background: var(--surface-raised);
      border-inline-start: 1px solid var(--border);
      box-shadow: var(--shadow-2);
      z-index: 10;
    }

    .summary-head {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2) var(--space-3);
      border-block-end: 1px solid var(--border);
    }

    .summary-title {
      flex: 1;
      margin: 0;
      font-size: var(--text-sm);
      font-weight: 500;
    }

    .summary-search {
      margin: var(--space-2) var(--space-3);
    }

    .summary-list {
      flex: 1;
      min-block-size: 0;
      overflow-y: auto;
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .summary-row {
      display: flex;
      align-items: baseline;
      gap: var(--space-2);
      inline-size: 100%;
      padding: var(--space-2) var(--space-3);
      border: none;
      background: none;
      color: inherit;
      font: inherit;
      text-align: start;
      cursor: pointer;
    }

    .summary-row:hover {
      background: var(--surface-hover);
    }

    .summary-row.is-current {
      background: var(--brand-subtle);
      color: var(--brand);
      font-weight: 500;
    }

    .summary-num {
      flex: none;
      min-inline-size: 2ch;
      font-size: var(--text-xs);
      color: var(--text-faint);
      text-align: end;
    }

    .summary-row.is-current .summary-num {
      color: inherit;
    }

    .summary-info {
      flex: 1;
      min-inline-size: 0;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .summary-name {
      font-size: var(--text-sm);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .summary-sub {
      font-size: var(--text-xs);
      color: var(--text-faint);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .summary-row.is-current .summary-sub {
      color: inherit;
      opacity: 0.75;
    }

    .summary-empty {
      padding: var(--space-3);
      font-size: var(--text-sm);
      color: var(--text-faint);
    }

    /* Audience dialog */
    .dialog-info {
      margin: 0;
      color: var(--text-muted);
    }

    .premium-note {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      margin: 0 0 var(--space-3);
      padding: var(--space-2) var(--space-3);
      border: 1px solid var(--premium);
      border-radius: var(--radius-md);
      background: hsl(45 90% 45% / 0.1);
      color: var(--premium);
      font-size: var(--text-sm);
      font-weight: 500;
    }

    .premium-note app-icon {
      --icon-size: 16px;
    }

    .lobby-info {
      margin: 0;
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: var(--space-4) var(--space-3);
      align-items: baseline;
      font-size: var(--text-sm);
      /* The screen kills selection so a swipe never grabs text; the dialog is
         where you copy the PIN and link by hand, so it opts back in. */
      user-select: text;
    }

    .lobby-info dt {
      color: var(--text-muted);
      font-weight: 500;
    }

    .lobby-info dd {
      margin: 0;
    }

    .lobby-pin {
      font-size: var(--text-xl);
      font-weight: 700;
      letter-spacing: 0.15em;
      font-variant-numeric: tabular-nums;
    }

    .lobby-link {
      padding: 0;
      border: 0;
      background: none;
      color: var(--brand);
      font-family: var(--font-ui);
      font-size: var(--text-xs);
      text-align: start;
      text-decoration: underline;
      word-break: break-all;
      cursor: pointer;
    }

    .lobby-link:hover {
      color: var(--brand-hover);
    }

    .lobby-qr {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-1);
    }

    .qr {
      inline-size: 200px;
      block-size: 200px;
      /* The generator draws its own quiet-zone margin, so a white plate keeps
         the code scannable in dark mode without any padding of our own. */
      background: #fff;
      border-radius: var(--radius-md);
      image-rendering: pixelated;
    }
  `,
})
export class StagePerformPage {
  protected readonly presenter = inject(StagePerformPresenter);
  protected readonly session = inject(StageSession);
  protected readonly fullscreen = inject(Fullscreen);
  protected readonly viewport = inject(Viewport);
  private readonly router = inject(Router);

  /** `/stage/:songbookId`, delivered by `withComponentInputBinding()`. */
  readonly songbookId = input.required<string>();

  /**
   * The join URL as a scannable QR, generated client-side (no backend, no
   * network round-trip): the audience points a camera at it instead of typing
   * the PIN. A GIF data URL, built synchronously so it stays a plain computed;
   * empty string until a lobby exists.
   */
  protected readonly qrDataUrl = computed(() => {
    const url = this.session.audienceUrl();
    if (url === '') return '';
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    return qr.createDataURL(6, 2);
  });

  private swipeStartX: number | null = null;
  private swipeStartY: number | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);
    // Leaving the route drops fullscreen (chrome must come back on the next
    // module) and stops the shell drawing the stage controls — but the session
    // itself lives on. Only the exit cross ends it (see exit()).
    destroyRef.onDestroy(() => {
      this.session.leaveView();
      void this.fullscreen.exit();
      if (this.copiedResetTimer !== null) clearTimeout(this.copiedResetTimer);
    });

    // The shell draws the stage controls while this view is on screen.
    this.session.enterView();

    effect(() => {
      void this.presenter.open(this.songbookId());
    });
  }

  protected exit(): void {
    this.session.end();
    void this.router.navigate(['/stage']);
  }

  /** Briefly true after a copy, so the label can flip to "Copied". */
  protected readonly isCopied = signal(false);
  private copiedResetTimer: ReturnType<typeof setTimeout> | null = null;

  protected copyLink(): void {
    const url = this.session.audienceUrl();
    if (url === '') return;
    void navigator.clipboard?.writeText(url);
    this.isCopied.set(true);
    if (this.copiedResetTimer !== null) clearTimeout(this.copiedResetTimer);
    this.copiedResetTimer = setTimeout(() => this.isCopied.set(false), 2000);
  }

  protected onKeyDown(event: KeyboardEvent): void {
    if (this.session.isSummaryOpen()) {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.session.closeSummary();
      }
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.session.prev();
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      this.session.next();
    }
  }

  protected startSwipe(event: PointerEvent): void {
    // Only track gestures that start on the render area, not on the summary
    // panel or action bar buttons. No reveal here: a swipe must leave the chrome
    // hidden, so the reveal decision waits for pointerup, where a tap is told
    // apart from a swipe.
    if ((event.target as HTMLElement).closest('.summary, button, a')) return;
    this.swipeStartX = event.clientX;
    this.swipeStartY = event.clientY;
  }

  protected endSwipe(event: PointerEvent): void {
    if (this.swipeStartX === null || this.swipeStartY === null) return;
    const dx = event.clientX - this.swipeStartX;
    const dy = event.clientY - this.swipeStartY;
    this.swipeStartX = null;
    this.swipeStartY = null;

    const isHorizontalSwipe =
      Math.abs(dx) >= SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy);
    if (!isHorizontalSwipe) {
      // A tap, not a swipe: reveal the chrome (tap-to-reveal, no dedicated
      // zone — spec). The swipe itself never reveals.
      this.fullscreen.reveal();
      return;
    }

    if (dx < 0) {
      this.session.next();
    } else {
      this.session.prev();
    }
  }

  /**
   * Click/tap outside the open summary dismisses it. The toggle button is
   * excluded — it owns the open/close itself, and closing here too would fight
   * it. On the pointerdown that opens the panel the panel is not open yet, so
   * this is a no-op then.
   */
  protected onDocumentPointerDown(event: PointerEvent): void {
    if (!this.session.isSummaryOpen()) return;
    const target = event.target as HTMLElement;
    if (target.closest('.summary')) return;
    if (target.closest('[data-testid="stage-summary"]')) return;
    this.session.closeSummary();
  }

  protected onSummarySearch(event: Event): void {
    this.presenter.setSummaryQuery((event.target as HTMLInputElement).value);
  }

  protected readonly prevLabel = $localize`:@@stage.prev:Previous song`;
  protected readonly nextLabel = $localize`:@@stage.next:Next song`;
  protected readonly summaryLabel = $localize`:@@stage.summary:Song list`;
  protected readonly closeSummaryLabel = $localize`:@@stage.closeSummary:Close song list`;
  protected readonly enterFullscreenLabel = $localize`:@@stage.enterFullscreen:Enter fullscreen`;
  protected readonly exitFullscreenLabel = $localize`:@@stage.exitFullscreen:Exit fullscreen`;
  protected readonly audienceLabel = $localize`:@@stage.audience:Create an audience`;
  protected readonly exitLabel = $localize`:@@stage.exit:Exit performing`;

  protected readonly summaryHeading = $localize`:@@stage.summaryHeading:Songs`;
  protected readonly searchPlaceholder = $localize`:@@stage.search:Search…`;
  protected readonly emptySongbookText = $localize`:@@stage.emptySongbook:This songbook has no songs.`;
  protected readonly noMatchText = $localize`:@@stage.noMatch:No songs match your search.`;

  protected readonly audienceDialogTitle = $localize`:@@stage.audienceDialog.title:Create an audience`;
  protected readonly audienceCreateInfo = $localize`:@@stage.audienceDialog.info:Share the code or link with your audience so they can follow along on their devices.`;
  protected readonly createLobbyLabel = $localize`:@@stage.audienceDialog.create:Create lobby`;
  protected readonly endLobbyLabel = $localize`:@@stage.audienceDialog.end:End lobby`;
  protected readonly lobbyPremiumNote = $localize`:@@stage.audienceDialog.premium:Audiences are a Premium feature — free while in testing.`;
  protected readonly lobbyPinLabel = $localize`:@@stage.audienceDialog.pin:PIN`;
  protected readonly lobbyAudienceLabel = $localize`:@@stage.audienceDialog.count:Listening`;
  protected readonly lobbyLinkLabel = $localize`:@@stage.audienceDialog.link:Link`;
  protected readonly copyLinkLabel = $localize`:@@stage.audienceDialog.copyLink:Copy link`;
  protected readonly copiedLabel = $localize`:@@stage.audienceDialog.copied:Copied`;
  protected readonly lobbyQrLabel = $localize`:@@stage.audienceDialog.qr:QR code`;
}
