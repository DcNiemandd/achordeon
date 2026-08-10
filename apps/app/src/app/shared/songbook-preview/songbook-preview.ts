// Songbook preview — the print preview in /songbooks pane B
// Spec: CONTEXT.md §Songbook; PRD-UI-SHELL.md §4
//
// A **scrolling** viewer. The desk is a real scroll box and nothing more: the
// reader gets the browser's own scrollbar, the trackpad and touch physics they
// already know, and PageDown where they expect it. It used to turn a screenful
// at a time off the wheel, which meant no scrollbar at all, a trackpad flick
// flying through a dozen sheets, and no way to cross a long book quickly. There
// is deliberately no snapping — see `.desk`. Zoom is the column count (1 → read
// one page, up to every page at once → a contact sheet).
//
// **Nothing is drawn until it is nearly on screen.** Every sheet has a frame in
// the DOM from the start — that is what makes the scrollbar tell the truth about
// a two-hundred-page book — but a frame is a box with a spinner in it until the
// reader comes within `DRAW_MARGIN_PX` of it, at which point `neared` asks the
// owner for that sheet. Sheets that fall well behind are unmounted again, so
// reading to the end of a book does not leave every song's SVG in the page.
//
// A **controlled component**: it takes a `SongbookPreview` (the paper, the
// sequence, and whichever sheets have been drawn so far) and shows it. It does
// not render, does not know what a songbook is; the presenter assembles the
// preview through `DownloadService.openSongbookPreview`, the WYSIWYG twin of the
// PDF, and answers `neared` by drawing.

import type { SongbookPreview as SongbookPreviewModel } from '@achordeon/shared/data-access';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
  viewChildren,
} from '@angular/core';
import { Button, Icon, Tooltip } from '../../primitives';
import { SongRender } from '../song-render';

/**
 * How close to the viewport a sheet has to come before it is drawn, and how far
 * past it it stays mounted.
 *
 * Generous on purpose: laying a song out takes a handful of milliseconds, and a
 * page that starts drawing when its top edge appears is a page the reader
 * watches assemble. Roughly a screenful either side at a normal desk size, so a
 * steady scroll always arrives at paper that is already inked.
 */
const DRAW_MARGIN_PX = 900;

/** Same elements, same order — the question `watch` asks of a recomputed query. */
function isSameList(a: readonly Element[], b: readonly Element[]): boolean {
  return a.length === b.length && a.every((element, i) => element === b[i]);
}

@Component({
  selector: 'app-songbook-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SongRender, Button, Icon, Tooltip],
  host: {
    '[class.is-dark]': 'isDark()',
  },
  template: `
    <!-- The scroll box, and the thing that takes focus: a focused DESK is what
         makes PageDown, the arrows and Home/End scroll the book instead of the
         window. None of them are handled here — they are the browser's, and the
         browser is better at them. -->
    <div #desk class="desk" tabindex="0" data-testid="songbook-preview">
      <div class="spread" [style.--columns]="columns()">
        @for (sheet of sheets(); track sheet.index) {
          <div
            #pageEl
            class="page"
            [attr.data-testid]="sheet.testid"
            [style.--page-ratio]="preview()?.aspect ?? A4_RATIO"
          >
            @if (sheet.svg) {
              <div
                class="content"
                [class.full-bleed]="sheet.isFullBleed"
                [style.inset]="sheet.isFullBleed ? '0' : marginInset()"
              >
                <app-song-render [svg]="sheet.svg" />
              </div>
            } @else if (sheet.isNear) {
              <!-- Blank paper and a turning ring: the sheet is real, its size is
                   already right, and what is missing is only the ink. -->
              <span class="drawing" aria-hidden="true"></span>
            }
            @if (sheet.folio) {
              <span class="folio" [class]="folioClass()">{{
                sheet.folio
              }}</span>
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
    /* The pane itself does not scroll — the desk inside it does, and the bar
       ellipsises instead of growing, so anything that still spills is a bug and
       must not become a scrollbar on the app. */
    :host {
      display: flex;
      flex-direction: column;
      block-size: 100%;
      min-inline-size: 0;
      overflow: hidden;
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

    /* The desk the pages sit on — the scroll box, and a plain one: no snapping.
       Snap points would take the scroll off the reader, and a mouse notch under
       mandatory scroll-snap moves exactly one page, so getting from page 3 to
       page 40 is thirty-seven gestures. Free scrolling can rest halfway between
       two sheets, and that is the reader's business.

       scroll-padding matches the desk's own padding, so a page brought into view
       (the zoom's anchor) sits inside the desk rather than against its edge.

       A size container, so the sheets can be fitted to it in BOTH axes the way
       BlankPage fits the single-song preview — see .page below. Its own size
       comes from the flex row above and never from the book inside it, so size
       containment costs nothing here. */
    .desk {
      flex: 1;
      min-block-size: 0;
      padding: var(--space-4);
      background: var(--surface-sunken);
      overflow-y: auto;
      overscroll-behavior: contain;
      scroll-padding: var(--space-4);
      outline: none;
      container-type: size;
    }

    .spread {
      display: grid;
      grid-template-columns: repeat(var(--columns), 1fr);
      gap: var(--space-3);
      align-items: start;
      justify-items: center;
    }

    .page {
      position: relative;
      /* Contain-fit in BOTH axes, exactly as BlankPage fits the single-song
         preview: the column's full width, or the width a page of this shape may
         have if its HEIGHT is to fit the desk — whichever is smaller. It used to
         be a flat 100%, so on a wide, short pane one page was taller than the
         desk and "one page at a time" meant scrolling through a single sheet.
         The aspect ratio then sets the height, so a page never spills either way. */
      inline-size: min(100%, 100cqb * var(--page-ratio));
      aspect-ratio: var(--page-ratio);
      /* Paper is paper — white in both themes, like BlankPage. */
      background: #fff;
      box-shadow: var(--shadow-2);
      overflow: hidden;
      /* The frames are all here from the start, so that the scrollbar is honest
         about the length of the book. This is what keeps that cheap: a sheet
         nowhere near the viewport is not laid out or painted at all, and its
         size is known anyway because the aspect ratio and the column width give
         it one. */
      content-visibility: auto;
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

    /* The sheet is coming. A thin ring rather than a word: it sits on paper, and
       whatever it says would be read as part of the song. */
    .drawing {
      position: absolute;
      inset-block-start: 50%;
      inset-inline-start: 50%;
      inline-size: 22px;
      block-size: 22px;
      margin: -11px;
      border: 2px solid #0000001f;
      border-block-start-color: #00000059;
      border-radius: 50%;
      animation: spin 800ms linear infinite;
    }

    @keyframes spin {
      to {
        transform: rotate(1turn);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .drawing {
        animation: none;
      }
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

    :host(.is-dark) .drawing {
      border-color: #ffffff29;
      border-block-start-color: #ffffff80;
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

  private readonly injector = inject(Injector);

  private readonly desk = viewChild.required<ElementRef<HTMLElement>>('desk');
  private readonly pageEls = viewChildren<ElementRef<HTMLElement>>('pageEl');

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

  /**
   * The sheets now within reach of the viewport, in book order — the owner's cue
   * to draw the ones it has not drawn yet.
   *
   * The whole set every time rather than the newcomers, so it is also the answer
   * to "what is on screen" after a book is reopened and every sheet goes blank
   * at once: nobody has scrolled, so nothing else would say.
   */
  readonly neared = output<readonly number[]>();

  /** Zoom, as a column count. Not persisted — a viewing gesture, not a
   * preference (the whole state resets when a different book is picked). */
  protected readonly columns = signal(1);

  /** Sheets within `DRAW_MARGIN_PX` of the desk: what is drawn, and what stays
   * mounted. */
  private readonly nearIndices = signal<ReadonlySet<number>>(new Set());
  /** Sheets actually on screen — the page-number readout, nothing else. */
  private readonly viewIndices = signal<ReadonlySet<number>>(new Set());

  /** Which sheet each frame is, so an observer entry can name itself. */
  private readonly indexOf = new Map<Element, number>();
  /** The frames the observers are on, to tell a genuinely different book from a
   * query that merely recomputed. */
  private observed: readonly Element[] = [];
  private nearObserver: IntersectionObserver | null = null;
  private viewObserver: IntersectionObserver | null = null;

  protected readonly pageCount = computed(
    () => this.preview()?.pages.length ?? 0,
  );

  /** At most every page at once — a one-row contact sheet of the whole book. */
  protected readonly maxColumns = computed(() => Math.max(1, this.pageCount()));

  constructor() {
    // A new book is a new document: back to the first page. Columns stay (a
    // person browsing at three-up wants the next book three-up too). Keyed on
    // the book, not on the preview object — see `bookId`.
    effect(() => {
      this.bookId();
      untracked(() => this.desk().nativeElement.scrollTo({ top: 0 }));
    });

    // The same book, re-rendered: the place is kept (the scroll box was never
    // touched), but the book may have got shorter under it — a slot removed, the
    // summary switched off — so the zoom is clamped to what there is now.
    effect(() => {
      const max = this.maxColumns();
      untracked(() => this.columns.update((cols) => Math.min(cols, max)));
    });

    // The frames are what the observers watch, and there is one per sheet: a
    // book of a different length is a different set of frames.
    effect(() => {
      const frames = this.pageEls();
      untracked(() => this.watch(frames));
    });

    // Ask for what has come within reach. Sorted, so the owner draws the book
    // downwards rather than in whatever order the observer happened to report.
    effect(() => {
      const near = [...this.nearIndices()].sort((a, b) => a - b);
      this.neared.emit(near);
    });

    inject(DestroyRef).onDestroy(() => {
      this.nearObserver?.disconnect();
      this.viewObserver?.disconnect();
    });
  }

  /**
   * Point the two observers at the current frames.
   *
   * Two, because the questions are different distances: one asks "is this sheet
   * near enough to be worth drawing" with a fat margin, the other asks "is this
   * sheet on screen" for the page-number readout, with none.
   */
  private watch(frames: readonly ElementRef<HTMLElement>[]): void {
    const elements = frames.map((frame) => frame.nativeElement);
    // The same frames as last time: a query result recomputes for reasons that
    // have nothing to do with the book, and starting the observers again would
    // throw away everything they have already told us — every sheet on screen
    // would blink back to its spinner.
    if (isSameList(this.observed, elements)) return;
    this.observed = elements;

    const root = this.desk().nativeElement;

    // No IntersectionObserver (a test renderer, an old engine): draw the lot,
    // which is what this pane did before it learned to be lazy.
    if (typeof IntersectionObserver === 'undefined') {
      this.nearIndices.set(new Set(frames.map((_, index) => index)));
      return;
    }

    this.nearObserver ??= new IntersectionObserver(
      (entries) => this.onSeen(entries, this.nearIndices),
      { root, rootMargin: `${DRAW_MARGIN_PX}px 0px` },
    );
    this.viewObserver ??= new IntersectionObserver(
      (entries) => this.onSeen(entries, this.viewIndices),
      { root },
    );

    this.nearObserver.disconnect();
    this.viewObserver.disconnect();
    this.indexOf.clear();
    // The sets are keyed by index, and the indices behind them have just been
    // re-dealt; the observers report every frame again on their first callback.
    this.nearIndices.set(new Set());
    this.viewIndices.set(new Set());

    for (const [index, frame] of frames.entries()) {
      const element = frame.nativeElement;
      this.indexOf.set(element, index);
      this.nearObserver.observe(element);
      this.viewObserver.observe(element);
    }
  }

  private onSeen(
    entries: readonly IntersectionObserverEntry[],
    into: ReturnType<typeof signal<ReadonlySet<number>>>,
  ): void {
    const next = new Set(into());
    for (const entry of entries) {
      const index = this.indexOf.get(entry.target);
      if (index === undefined) continue;
      if (entry.isIntersecting) next.add(index);
      else next.delete(index);
    }
    into.set(next);
  }

  protected readonly sheets = computed(() => {
    const preview = this.preview();
    if (!preview) return [];
    const near = this.nearIndices();
    const withCorner = preview.hasCornerNumbers;
    return preview.pages.map((page, index) => ({
      index,
      // Mounted only while it is near. The owner keeps the SVG it drew, so
      // scrolling back to a sheet puts it up again without redrawing it — but a
      // book read to the end does not leave two hundred renders in the DOM.
      svg: near.has(index) ? page.svg : null,
      isNear: near.has(index),
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

  /** The topmost sheet on screen, or 0 for an empty book — where the reader is. */
  private readonly firstInView = computed(() => {
    const seen = this.viewIndices();
    return seen.size === 0 ? 0 : Math.min(...seen);
  });

  /** "3–4 / 20", or "3 / 20" when one sheet fills the desk. */
  protected readonly rangeLabel = computed(() => {
    const count = this.pageCount();
    const seen = this.viewIndices();
    if (count === 0 || seen.size === 0) return '';
    const from = Math.min(...seen) + 1;
    const to = Math.max(...seen) + 1;
    const range = from === to ? `${from}` : `${from}–${to}`;
    return $localize`:@@songbookPreview.range:${range}:range: / ${count}:total:`;
  });

  protected setColumns(next: number): void {
    const cols = Math.min(Math.max(1, next), this.maxColumns());
    // Zooming re-flows every row, and the page you were reading would slide off
    // wherever the new arithmetic put it. Keep it: note it, then put it back at
    // the top of the desk once the grid has been laid out again.
    const anchor = this.firstInView();
    this.columns.set(cols);
    afterNextRender(() => this.scrollTo(anchor), { injector: this.injector });
  }

  private scrollTo(index: number): void {
    const frame = this.pageEls()[index]?.nativeElement;
    frame?.scrollIntoView({ block: 'start', behavior: 'instant' });
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
