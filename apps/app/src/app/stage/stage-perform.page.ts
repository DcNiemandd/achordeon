// Stage perform page — Epic 8 ▸ performing mode
// Spec: docs/achordeon-implementation.md §Epic 8; apps/docs/docs/stage-audience/index.mdx

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  Button,
  Dialog,
  EmptyState,
  Field,
  Icon,
  Menu,
  MenuItem,
  Premium,
  Tooltip,
} from '../primitives';
import { ActionBar, BlankPage, Fullscreen } from '../shared/layout';
import { SongRender } from '../shared/song-render';
import { StagePerformPresenter } from './stage-perform.presenter';

/** Minimum horizontal travel (px) that counts as a swipe. */
const SWIPE_THRESHOLD_PX = 60;

type AudienceState = 'closed' | 'create' | 'active';

/**
 * Performing mode: one song at a time, full-screen, swipe to navigate.
 *
 * Action bar (docs spec): Prev | n/total | Next | Summary | Menu
 * Menu items: Fullscreen toggle, Create audience (premium), Exit.
 *
 * The action bar auto-hides in fullscreen mode and comes back on any pointer
 * event — the `Fullscreen` service handles this through `reveal()`. There is
 * no dedicated tap zone: the entire render area reveals the chrome.
 *
 * Swipe detection uses the Pointer Events API so it works for both mouse and
 * touch. A drag is horizontal when |dx| > SWIPE_THRESHOLD_PX and |dx| > |dy|,
 * which avoids competing with a vertical scroll gesture.
 *
 * The summary is a non-blocking panel that slides over the render area. It
 * stays open until dismissed so the performer can browse without losing their
 * place.
 *
 * DestroyRef exits fullscreen on route leave so the browser chrome is restored
 * automatically — no manual "exit before leaving" friction.
 */
@Component({
  selector: 'app-stage-perform-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [StagePerformPresenter],
  host: {
    '(document:keydown)': 'onKeyDown($event)',
  },
  imports: [
    RouterLink,
    ActionBar,
    BlankPage,
    SongRender,
    EmptyState,
    Button,
    Field,
    Icon,
    Tooltip,
    Menu,
    MenuItem,
    Premium,
    Dialog,
  ],
  template: `
    <div
      class="screen"
      (pointerdown)="startSwipe($event)"
      (pointerup)="endSwipe($event)"
    >
      <app-action-bar [title]="presenter.name()">
        <!-- Spec order: Prev | Summary | Menu | Next -->
        <button
          appButton
          type="button"
          [isIconOnly]="true"
          [disabled]="!presenter.hasPrev()"
          [attr.aria-label]="prevLabel"
          [appTooltip]="prevLabel"
          data-testid="stage-prev"
          (click)="presenter.prev()"
        >
          <app-icon name="chevronLeft" />
        </button>

        <button
          appButton
          type="button"
          variant="secondary"
          [isIconOnly]="true"
          [class.is-active]="presenter.isSummaryOpen()"
          [attr.aria-pressed]="presenter.isSummaryOpen()"
          [attr.aria-label]="summaryLabel"
          [appTooltip]="summaryLabel"
          data-testid="stage-summary"
          (click)="toggleSummary()"
        >
          <app-icon name="list" />
        </button>

        <!-- Menu: Fullscreen | Create audience (premium) | Exit -->
        <app-menu [label]="menuLabel" testid="stage-menu">
          <button
            appMenuItem
            type="button"
            data-testid="stage-menu-fullscreen"
            (chosen)="fullscreen.toggle()"
          >
            <app-icon
              [name]="fullscreen.isActive() ? 'fullscreenExit' : 'fullscreen'"
            />
            {{
              fullscreen.isActive() ? exitFullscreenLabel : enterFullscreenLabel
            }}
          </button>

          <app-premium [label]="audienceLabel">
            <button
              appMenuItem
              type="button"
              [attr.aria-describedby]="audiencePremiumId"
              data-testid="stage-menu-audience"
              (chosen)="openAudienceDialog()"
            >
              <app-icon name="audience" />
              {{ audienceLabel }}
            </button>
          </app-premium>

          <button
            appMenuItem
            type="button"
            class="is-danger"
            routerLink="/stage"
            data-testid="stage-menu-exit"
          >
            <app-icon name="close" />
            {{ exitLabel }}
          </button>
        </app-menu>

        <button
          appButton
          type="button"
          [isIconOnly]="true"
          [disabled]="!presenter.hasNext()"
          [attr.aria-label]="nextLabel"
          [appTooltip]="nextLabel"
          data-testid="stage-next"
          (click)="presenter.next()"
        >
          <app-icon name="chevronRight" />
        </button>
      </app-action-bar>

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
           Escape and clicking the summary button again dismiss it. -->
      @if (presenter.isSummaryOpen()) {
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
              (click)="presenter.closeSummary()"
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
                  [class.is-current]="row.index === presenter.index()"
                  [attr.data-testid]="'stage-summary-row-' + row.index"
                  (click)="presenter.jumpTo(row.index)"
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
      @if (audienceState() !== 'closed') {
        <app-dialog
          [title]="audienceDialogTitle"
          mode="viewport"
          data-testid="stage-audience-dialog"
          (closed)="closeAudienceDialog()"
        >
          @if (audienceState() === 'create') {
            <p class="dialog-info">{{ audienceCreateInfo }}</p>
          }
          @if (audienceState() === 'create') {
            <ng-container dialog-actions>
              <app-premium [label]="createLobbyLabel">
                <button
                  appButton
                  type="button"
                  variant="primary"
                  [attr.aria-describedby]="audiencePremiumId"
                  data-testid="stage-create-lobby"
                  (click)="createLobby()"
                >
                  {{ createLobbyLabel }}
                </button>
              </app-premium>
            </ng-container>
          }

          @if (audienceState() === 'active') {
            <dl class="lobby-info">
              <dt>{{ lobbyPinLabel }}</dt>
              <dd class="lobby-pin" data-testid="stage-lobby-pin">
                {{ lobbyPin() }}
              </dd>
              <dt>{{ lobbyLinkLabel }}</dt>
              <dd>
                <code class="lobby-link" data-testid="stage-lobby-link">
                  {{ audienceUrl() }}
                </code>
              </dd>
              <dt>{{ lobbyQrLabel }}</dt>
              <dd class="lobby-qr" data-testid="stage-lobby-qr">
                <span class="qr-placeholder">QR</span>
                <span class="qr-url">{{ audienceUrl() }}</span>
              </dd>
            </dl>
          }
          @if (audienceState() === 'active') {
            <button
              appButton
              type="button"
              class="is-danger"
              dialog-actions
              data-testid="stage-end-lobby"
              (click)="endLobby()"
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

    .lobby-info {
      margin: 0;
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: var(--space-1) var(--space-3);
      align-items: baseline;
      font-size: var(--text-sm);
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
      font-size: var(--text-xs);
      word-break: break-all;
    }

    .lobby-qr {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-1);
    }

    .qr-placeholder {
      display: grid;
      place-items: center;
      inline-size: 120px;
      block-size: 120px;
      border: 2px dashed var(--border);
      border-radius: var(--radius-md);
      font-size: var(--text-xl);
      font-weight: 700;
      color: var(--text-faint);
    }

    .qr-url {
      font-size: var(--text-xs);
      color: var(--text-faint);
    }
  `,
})
export class StagePerformPage {
  protected readonly presenter = inject(StagePerformPresenter);
  protected readonly fullscreen = inject(Fullscreen);

  /** `/stage/:songbookId`, delivered by `withComponentInputBinding()`. */
  readonly songbookId = input.required<string>();

  private swipeStartX: number | null = null;
  private swipeStartY: number | null = null;

  protected readonly audienceState = signal<AudienceState>('closed');
  protected readonly lobbyPin = signal('');

  protected readonly audienceUrl = () =>
    `${location.origin}/audience/${this.lobbyPin()}`;

  /** Referenced by aria-describedby on the premium audience button. */
  protected readonly audiencePremiumId = 'stage-audience-premium';

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => void this.fullscreen.exit());

    effect(() => {
      void this.presenter.load(this.songbookId());
    });
  }

  protected onKeyDown(event: KeyboardEvent): void {
    if (this.presenter.isSummaryOpen()) {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.presenter.closeSummary();
      }
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.presenter.prev();
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      this.presenter.next();
    }
  }

  protected startSwipe(event: PointerEvent): void {
    // Only track swipes that start on the render area, not on the summary panel
    // or action bar buttons.
    if ((event.target as HTMLElement).closest('.summary, button, a')) return;
    this.swipeStartX = event.clientX;
    this.swipeStartY = event.clientY;
    // Reveal chrome on any pointer interaction — tap-to-reveal, no dedicated
    // zone (spec). The Fullscreen service resets the idle timer.
    this.fullscreen.reveal();
  }

  protected endSwipe(event: PointerEvent): void {
    if (this.swipeStartX === null || this.swipeStartY === null) return;
    const dx = event.clientX - this.swipeStartX;
    const dy = event.clientY - this.swipeStartY;
    this.swipeStartX = null;
    this.swipeStartY = null;

    if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
    if (Math.abs(dy) >= Math.abs(dx)) return; // not horizontal enough

    if (dx < 0) {
      this.presenter.next();
    } else {
      this.presenter.prev();
    }
  }

  protected toggleSummary(): void {
    if (this.presenter.isSummaryOpen()) {
      this.presenter.closeSummary();
    } else {
      this.presenter.openSummary();
    }
  }

  protected onSummarySearch(event: Event): void {
    this.presenter.setSummaryQuery((event.target as HTMLInputElement).value);
  }

  protected openAudienceDialog(): void {
    this.audienceState.set('create');
  }

  protected closeAudienceDialog(): void {
    this.audienceState.set('closed');
  }

  protected createLobby(): void {
    // Stub — Epic 9 will wire this to the Supabase lobby RPC.
    // Generate a random 5-digit PIN until the backend is in place.
    const pin = Math.floor(10000 + Math.random() * 90000).toString();
    this.lobbyPin.set(pin);
    this.audienceState.set('active');
  }

  protected endLobby(): void {
    // Stub — Epic 9 will call the Supabase end-lobby RPC.
    this.lobbyPin.set('');
    this.audienceState.set('closed');
  }

  protected readonly menuLabel = $localize`:@@stage.menu:More options`;
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
  protected readonly lobbyPinLabel = $localize`:@@stage.audienceDialog.pin:PIN`;
  protected readonly lobbyLinkLabel = $localize`:@@stage.audienceDialog.link:Link`;
  protected readonly lobbyQrLabel = $localize`:@@stage.audienceDialog.qr:QR code`;
}
