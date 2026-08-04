// Songbook preview — the print preview in /songbooks pane B
// Spec: CONTEXT.md §Songbook; PRD-UI-SHELL.md §4
//
// A **paged** viewer, not a scroll pane. It shows the book a screenful at a time —
// `columns` pages side by side — and a wheel notch or an arrow key turns to the
// next screenful rather than nudging pixels. That is what a book is: pages you
// turn, not a ribbon you slide. Zoom is the column count (1 → read one page,
// up to every page at once → a contact sheet).
//
// A **controlled component**: it takes a `SongbookPreview` (the pages, already
// rendered, and the paper they sit on) and shows it. It does not render, does not
// know what a songbook is; the presenter assembles the preview through
// `DownloadService.previewSongbook`, the WYSIWYG twin of the PDF.

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import type { SongbookPreview as SongbookPreviewModel } from '@achordeon/shared/data-access';
import { Button, Icon, Tooltip } from '../../primitives';
import { SongRender } from '../song-render';

/**
 * How much wheel travel turns a page. Accumulated rather than one-step-per-event:
 * a mouse notch arrives as a single large delta (one turn), a trackpad as a burst
 * of small ones (coalesced into one turn past the threshold), so both feel like a
 * page turn instead of the mouse turning once and the trackpad flying through the
 * book. A dev's control surface, not a user setting.
 */
const WHEEL_STEP_PX = 90;

@Component({
  selector: 'app-songbook-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SongRender, Button, Icon, Tooltip],
  host: {
    tabindex: '0',
    '[class.is-dark]': 'isDark()',
    '(wheel)': 'onWheel($event)',
    '(keydown)': 'onKey($event)',
  },
  template: `
    <div class="desk" data-testid="songbook-preview">
      <div class="spread" [style.--columns]="columns()">
        @for (page of visible(); track page.key) {
          <div
            class="page"
            [attr.data-testid]="page.testid"
            [style.aspect-ratio]="preview()?.aspect ?? A4_RATIO"
          >
            <div
              class="content"
              [class.full-bleed]="page.isFullBleed"
              [style.inset]="page.isFullBleed ? '0' : marginInset()"
            >
              <app-song-render [svg]="page.svg" />
            </div>
            @if (page.folio) {
              <span class="folio" [class]="folioClass()">{{ page.folio }}</span>
            }
          </div>
        }
      </div>
    </div>

    <!-- The controls sit UNDER the paper: the dark page on the left, the page
         number centred, the zoom on the right. Zoom is by column count and reads
         as a magnifier — zoom IN shows fewer, larger pages, zoom OUT more,
         smaller ones — so the buttons move columns the OTHER way from their
         sign. -->
    <div class="bar">
      <!-- The one dark page in the app that is not telling the truth about its
           output, so the warning stands beside the switch that caused it rather
           than in a tooltip nobody opens. It is a caption, not an alert: this is
           a thing you chose, and it is undone by the button next to it. -->
      <div class="paper">
        <button
          appButton
          type="button"
          [isIconOnly]="true"
          [class.is-active]="isDark()"
          [attr.aria-pressed]="isDark()"
          [attr.aria-label]="darkPageLabel"
          [appTooltip]="darkPageLabel"
          data-testid="preview-dark-page"
          (click)="darkToggled.emit()"
        >
          <app-icon name="moon" />
        </button>
        @if (isDark()) {
          <span class="not-print" data-testid="preview-not-print">{{
            notPrintLabel
          }}</span>
        }
      </div>
      <span class="range" data-testid="preview-range">{{ rangeLabel() }}</span>
      <div class="zoom" role="group" [attr.aria-label]="zoomLabel">
        <button
          appButton
          type="button"
          [isIconOnly]="true"
          [disabled]="columns() >= maxColumns()"
          [attr.aria-label]="zoomOutLabel"
          [appTooltip]="zoomOutLabel"
          data-testid="preview-zoom-out"
          (click)="setColumns(columns() + 1)"
        >
          <app-icon name="zoomOut" />
        </button>
        <button
          appButton
          type="button"
          [isIconOnly]="true"
          [disabled]="columns() <= 1"
          [attr.aria-label]="zoomInLabel"
          [appTooltip]="zoomInLabel"
          data-testid="preview-zoom-in"
          (click)="setColumns(columns() - 1)"
        >
          <app-icon name="zoomIn" />
        </button>
      </div>
    </div>
  `,
  styles: `
    /* A pane, and panes do not scroll: the desk turns pages instead of scrolling
       and the bar ellipsises instead of growing, so anything that still spills is
       a bug and must not become a scrollbar on the app. */
    :host {
      display: flex;
      flex-direction: column;
      block-size: 100%;
      min-inline-size: 0;
      overflow: hidden;
      outline: none;
    }

    /* Under the paper, kept low. Three columns so the page number sits dead-centre
       of the whole bar whatever the side controls' width: paper | range | zoom.

       minmax(0, 1fr) and not a bare 1fr: a grid track's floor is its content, so
       the nowrap caption in the left cell would make the bar wider than the pane
       and put a horizontal scrollbar on the app rather than ellipsising. The
       middle track stays auto — the page number is the one thing here that may
       not shrink. */
    .bar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
      align-items: center;
      gap: var(--space-2);
      padding: 2px var(--space-2);
      border-block-start: 1px solid var(--border);
      min-inline-size: 0;
    }

    .range {
      grid-column: 2;
      text-align: center;
      font-size: var(--text-xs);
      color: var(--text-faint);
      font-variant-numeric: tabular-nums;
    }

    /* The paper controls, in the bar's left cell. */
    .paper {
      grid-column: 1;
      justify-self: start;
      display: flex;
      align-items: center;
      gap: var(--space-2);
      min-inline-size: 0;
    }

    /* Says what the dark pages are NOT. Truncates rather than pushing the page
       number off centre — the bar's middle cell is the one thing in here that
       must not move. */
    .not-print {
      font-size: var(--text-xs);
      color: var(--text-faint);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      /* A flex item's floor is its content too — without this the ellipsis can
         never engage and the nowrap text simply widens the bar. */
      min-inline-size: 0;
    }

    .paper button.is-active {
      color: var(--brand);
    }

    .zoom {
      grid-column: 3;
      justify-self: end;
      display: flex;
      align-items: center;
      gap: var(--space-1);
    }

    /* Compact icon buttons, so the bar is a slim strip rather than a toolbar. */
    .zoom button,
    .paper button {
      --icon-size: 15px;
      block-size: 26px;
      min-inline-size: 26px;
    }

    /* The desk the pages sit on. A definite-size box (container units below
       measure the space, not the content), and it never scrolls — turning a page
       is a step, not a slide. */
    .desk {
      flex: 1;
      min-block-size: 0;
      display: grid;
      place-items: center;
      padding: var(--space-4);
      background: var(--surface-sunken);
      overflow: hidden;
      container-type: size;
    }

    .spread {
      display: grid;
      grid-template-columns: repeat(var(--columns), 1fr);
      gap: var(--space-3);
      /* Fit the whole spread within the desk in both axes: the widest the row can
         be without its tallest page overflowing the desk height. */
      inline-size: 100%;
      max-block-size: 100%;
      align-items: start;
      justify-items: center;
    }

    .page {
      position: relative;
      inline-size: 100%;
      /* Paper is paper — white in both themes, like BlankPage. */
      background: #fff;
      box-shadow: var(--shadow-2);
      /* The tallest page must fit the desk: cap each page's height to the desk and
         let the aspect ratio drive the width down to match. */
      max-block-size: 100cqb;
      overflow: hidden;
      /* A query container so the folio can size itself off the page's own width
         (cqi) — it shrinks with the page as columns are added, the way the SVG's
         own text does; a fixed size would loom huge on a contact-sheet page. */
      container-type: inline-size;
    }

    .content {
      position: absolute;
    }

    .content.full-bleed {
      inset: 0;
    }

    /* A page number sits where the PDF prints it — the corner, a margin in — and
       scales with the page (see the container above). */
    .folio {
      position: absolute;
      font-size: clamp(4px, 2.6cqi, 12px);
      color: #1a1a1a;
      font-variant-numeric: tabular-nums;
    }

    .folio.top {
      inset-block-start: 4%;
    }
    .folio.bottom {
      inset-block-end: 3%;
    }
    .folio.left {
      inset-inline-start: 6%;
    }
    .folio.right {
      inset-inline-end: 6%;
    }
    .folio.center {
      inset-inline-start: 0;
      inset-inline-end: 0;
      text-align: center;
    }

    /* The dark page, exactly as BlankPage draws it: true black for the OLED
       panel this is read on, the desk turned over with it so a lit frame does
       not glare around the spread, and the drop shadow inverted to a faint rim
       so the sheet's edge — and the margin the song is not filling — stays
       visible against the desk. The pages' own ink is dark because they were
       RENDERED dark (RenderOpts.dark); nothing here restyles an SVG. */
    :host(.is-dark) .desk,
    :host(.is-dark) .page {
      background: #000;
    }

    :host(.is-dark) .page {
      box-shadow:
        0 0 0 1px rgb(255 255 255 / 12%),
        0 1px 4px rgb(255 255 255 / 5%);
    }

    /* The folio is drawn by this component rather than by the renderer, so it
       is the one mark on the page that has to be re-inked by hand. */
    :host(.is-dark) .folio {
      color: #ebebeb;
    }
  `,
})
export class SongbookPreview {
  /** A4 portrait ratio — the fallback frame shape while a preview loads. */
  protected readonly A4_RATIO = 210 / 297;

  /** The rendered book and its paper, or null while nothing is picked / loading. */
  readonly preview = input<SongbookPreviewModel | null>(null);

  /**
   * Which book these pages are of — **the identity of the document**, which the
   * pages themselves do not carry.
   *
   * The place in the book is kept per document, and a re-render is not a new
   * document: turning the paper over, or editing the print structure, hands this
   * component a brand-new `preview` object for the book you are already reading.
   * Without a name for the document there is no way to tell that apart from a
   * different book being picked, and the moon dropped the reader back to page one.
   */
  readonly bookId = input<string | null>(null);

  /**
   * Are these pages drawn on black paper?
   *
   * An input, and the moon below is an output: this component is controlled, and
   * the pages it is handed were **rendered** dark or light by whoever produced
   * them. Flipping it here would leave black chrome around light songs.
   */
  readonly isDark = input(false);

  /** The moon was pressed. The owner re-renders the book and hands it back. */
  readonly darkToggled = output<void>();

  /** Zoom, as a column count. Not persisted — a viewing gesture, not a
   * preference (the whole state resets when a different book is picked). */
  protected readonly columns = signal(1);

  /** Index of the first page in the visible screenful. Snapped to a column
   * boundary so a page never straddles two screenfuls. */
  private readonly cursor = signal(0);

  private wheelAcc = 0;

  protected readonly pageCount = computed(
    () => this.preview()?.pages.length ?? 0,
  );

  /** At most every page at once — a one-row contact sheet of the whole book. */
  protected readonly maxColumns = computed(() => Math.max(1, this.pageCount()));

  /** The first index a screenful can start on, so the last turn lands on a clean
   * group and shows the final `columns` pages (a short last group is fine). */
  private readonly lastStart = computed(() => {
    const cols = this.columns();
    const count = this.pageCount();
    return count === 0 ? 0 : Math.floor((count - 1) / cols) * cols;
  });

  constructor() {
    // A new book is a new document: back to the first page. Columns stay (a
    // person browsing at three-up wants the next book three-up too). Keyed on
    // the book, not on the preview object — see `bookId`.
    effect(() => {
      this.bookId();
      untracked(() => this.cursor.set(0));
    });

    // The same book, re-rendered: the place is kept, but the book may have got
    // shorter under it (a slot removed, the summary switched off), so both the
    // zoom and the cursor are clamped to what there is now.
    effect(() => {
      const max = this.maxColumns();
      untracked(() => {
        this.columns.update((cols) => Math.min(cols, max));
        this.cursor.update((at) => Math.min(at, this.lastStart()));
      });
    });
  }

  protected readonly visible = computed(() => {
    const preview = this.preview();
    if (!preview) return [];
    const from = this.cursor();
    const cols = this.columns();
    const withCorner = preview.hasCornerNumbers;
    return preview.pages.slice(from, from + cols).map((page, i) => ({
      key: from + i,
      svg: page.svg,
      isFullBleed: page.kind === 'summary',
      // Named by kind so the title page stays findable — its preview shows the
      // book's own title-page fields, and that is worth asserting.
      testid:
        page.kind === 'title'
          ? 'title-page'
          : page.kind === 'summary'
            ? 'summary-page'
            : 'song-page',
      // The folio the preview overlays: a corner number on a song page, unless
      // the number is baked into the heading (before-title) or switched off.
      folio: withCorner && page.number !== null ? String(page.number) : '',
    }));
  });

  /** The margin inset for a non-summary page: top/bottom resolve against the
   * frame's height, left/right against its width (that is how `inset` reads a
   * two-value percentage), so a song sits in the sheet the way the PDF fits it. */
  protected readonly marginInset = computed(() => {
    const preview = this.preview();
    if (!preview) return '0';
    return `${preview.marginRatioY * 100}% ${preview.marginRatioX * 100}%`;
  });

  protected readonly folioClass = computed(() => {
    const position = this.preview()?.pageNumberPosition ?? 'bottom-center';
    const vertical = position.startsWith('top') ? 'top' : 'bottom';
    const horizontal = position.endsWith('left')
      ? 'left'
      : position.endsWith('right')
        ? 'right'
        : 'center';
    return `folio ${vertical} ${horizontal}`;
  });

  /** "3–4 / 20", or "3 / 20" for a single-page screenful. */
  protected readonly rangeLabel = computed(() => {
    const count = this.pageCount();
    if (count === 0) return '';
    const from = this.cursor() + 1;
    const to = Math.min(this.cursor() + this.columns(), count);
    const range = from === to ? `${from}` : `${from}–${to}`;
    return $localize`:@@songbookPreview.range:${range}:range: / ${count}:total:`;
  });

  protected setColumns(next: number): void {
    const cols = Math.min(Math.max(1, next), this.maxColumns());
    // Keep the current first page in view, snapped to the new column grid.
    const anchored = Math.floor(this.cursor() / cols) * cols;
    this.columns.set(cols);
    this.cursor.set(Math.min(anchored, this.lastStart()));
  }

  protected onWheel(event: WheelEvent): void {
    if (this.pageCount() === 0) return;
    // The desk does not scroll; the wheel turns pages instead.
    event.preventDefault();
    this.wheelAcc += event.deltaY;
    if (Math.abs(this.wheelAcc) < WHEEL_STEP_PX) return;
    this.step(this.wheelAcc > 0 ? 1 : -1);
    this.wheelAcc = 0;
  }

  protected onKey(event: KeyboardEvent): void {
    switch (event.key) {
      case 'PageDown':
      case 'ArrowRight':
      case 'ArrowDown':
        this.step(1);
        break;
      case 'PageUp':
      case 'ArrowLeft':
      case 'ArrowUp':
        this.step(-1);
        break;
      case 'Home':
        this.cursor.set(0);
        break;
      case 'End':
        this.cursor.set(this.lastStart());
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  private step(direction: 1 | -1): void {
    const next = this.cursor() + direction * this.columns();
    this.cursor.set(Math.min(Math.max(0, next), this.lastStart()));
  }

  // The same words the performing menu uses for the same act — one name for one
  // feature, the pattern `@@stage.menu` already follows across the bars.
  protected readonly darkPageLabel = $localize`:@@stage.darkPage:Dark page`;
  /** What the dark pages are not. Short: it sits in a slim bar beside a
   * button, and the long version is the setting's own help text. */
  protected readonly notPrintLabel = $localize`:@@songbookPreview.notPrint:Not the print output`;
  protected readonly zoomLabel = $localize`:@@songbookPreview.zoom:Zoom`;
  protected readonly zoomInLabel = $localize`:@@songbookPreview.zoomIn:Zoom in`;
  protected readonly zoomOutLabel = $localize`:@@songbookPreview.zoomOut:Zoom out`;
}
