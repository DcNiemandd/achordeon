// Stage perform page — Epic 8 ▸ performing mode
// Spec: docs/achordeon-implementation.md §Epic 8

import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Button, EmptyState, Field, Icon, Tooltip } from '../primitives';
import { ActionBar, BlankPage, Fullscreen } from '../shared/layout';
import { SongRender } from '../shared/song-render';
import { StagePerformPresenter } from './stage-perform.presenter';

/** Minimum horizontal travel (px) that counts as a swipe. */
const SWIPE_THRESHOLD_PX = 60;

/**
 * Performing mode: one song at a time, full-screen, swipe to navigate.
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
  ],
  template: `
    <div
      class="screen"
      (pointerdown)="startSwipe($event)"
      (pointerup)="endSwipe($event)"
    >
      <app-action-bar [title]="presenter.name()">
        <a
          appButton
          bar-end
          routerLink="/stage"
          [attr.aria-label]="backLabel"
          [appTooltip]="backLabel"
          data-testid="stage-back"
        >
          <app-icon name="close" />
        </a>

        <!-- Prev / position / next — the core navigation trio. -->
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

        <span class="position" aria-live="polite" data-testid="stage-position">
          {{ presenter.position() }} / {{ presenter.total() }}
        </span>

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

        <!-- Summary: compact song list to jump. -->
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

        <!-- Fullscreen: enter / exit performing mode. -->
        <button
          appButton
          type="button"
          variant="secondary"
          [isIconOnly]="true"
          [attr.aria-label]="
            fullscreen.isActive() ? exitFullscreenLabel : enterFullscreenLabel
          "
          [appTooltip]="
            fullscreen.isActive() ? exitFullscreenLabel : enterFullscreenLabel
          "
          data-testid="stage-fullscreen"
          (click)="fullscreen.toggle()"
        >
          <app-icon
            [name]="fullscreen.isActive() ? 'fullscreenExit' : 'fullscreen'"
          />
        </button>

        <!-- Create audience — entry point for Epic 9.
             Placeholder: linked to /audience but Epic 9 is not yet built. -->
        <a
          appButton
          variant="secondary"
          routerLink="/audience"
          [attr.aria-label]="audienceLabel"
          [appTooltip]="audienceLabel"
          data-testid="stage-audience"
        >
          <app-icon name="audience" />
        </a>
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

    .position {
      padding-inline: var(--space-2);
      font-size: var(--text-sm);
      color: var(--text-muted);
      white-space: nowrap;
      min-inline-size: 4ch;
      text-align: center;
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
  `,
})
export class StagePerformPage {
  protected readonly presenter = inject(StagePerformPresenter);
  protected readonly fullscreen = inject(Fullscreen);

  /** `/stage/:songbookId`, delivered by `withComponentInputBinding()`. */
  readonly songbookId = input.required<string>();

  private swipeStartX: number | null = null;
  private swipeStartY: number | null = null;

  constructor() {
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
    } else if (event.key === 'Escape' && !this.fullscreen.isActive()) {
      // Escape without fullscreen bounces to the picker. In fullscreen, Escape
      // is handled by the browser and fires fullscreenchange, which the
      // Fullscreen service already handles.
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

  protected readonly backLabel = $localize`:@@stage.back:Back to songbook list`;
  protected readonly prevLabel = $localize`:@@stage.prev:Previous song`;
  protected readonly nextLabel = $localize`:@@stage.next:Next song`;
  protected readonly summaryLabel = $localize`:@@stage.summary:Song list`;
  protected readonly closeSummaryLabel = $localize`:@@stage.closeSummary:Close song list`;
  protected readonly enterFullscreenLabel = $localize`:@@stage.enterFullscreen:Enter fullscreen`;
  protected readonly exitFullscreenLabel = $localize`:@@stage.exitFullscreen:Exit fullscreen`;
  protected readonly audienceLabel = $localize`:@@stage.audience:Create an audience`;
  protected readonly summaryHeading = $localize`:@@stage.summaryHeading:Songs`;
  protected readonly searchPlaceholder = $localize`:@@stage.search:Search…`;
  protected readonly emptySongbookText = $localize`:@@stage.emptySongbook:This songbook has no songs.`;
  protected readonly noMatchText = $localize`:@@stage.noMatch:No songs match your search.`;
}
