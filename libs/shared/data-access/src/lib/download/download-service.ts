// DownloadService — Epic 7 ▸ subtasks 4, 5, 6
// Spec: PRD-INFRASTRUCTURE.md §1 (DownloadService: render → PNG/PDF/ZIP), §8
// (single song PNG or PDF; several = ZIP of images / ZIP of PDFs / one
// multi-page PDF; a songbook is always a PDF), PRD-RENDERING §2 (the format
// facade; every output is a *sink* on the one SVG, rendered **offscreen in a
// loop** so a songbook of songs nobody has opened still exports).
//
// Download is the *player's* format (`export-import.mdx`): a picture, not a
// database. The counterpart is `ExportService`, which is the database.

import { Injectable, inject } from '@angular/core';
import {
  ALL_SONGS_ID,
  isAllSongs,
  resolveSettings,
  titlePageAst,
  type GlobalSettings,
  type Song,
  type SongAst,
  type Songbook,
  type Uuid,
} from '@achordeon/shared/domain';
import {
  DEFAULT_TUNING,
  type RenderPlan,
  turnedSvg,
} from '@achordeon/shared/render-core';
import { ParserService } from '../parser/parser-service';
import { BODY_FAMILY, FontLoader } from '../render/font-loader';
import { RenderService } from '../render/render-service';
import { SettingsStore } from '../stores/settings-store';
import { SONGBOOK_REPOSITORY, SONG_REPOSITORY } from '../stores/repositories';
import { ExportService } from '../transfer/export-service';
import { embedSnapshot } from '../transfer/embedded-metadata';
import { fileDate, saveFile, toFileSlug } from '../transfer/file-io';
import {
  MM,
  PAGE_SIZES,
  orient,
  pageForBox,
  placeInto,
  type PageSizeName,
  type Size,
} from './page-geometry';
import { createPdf, drawOnPage, drawSvg, registerFonts } from './pdf-doc';
import { svgToPng } from './raster';
import {
  layoutSummary,
  summaryToSvg,
  type MeasureText,
  type SummaryItem,
  type SummaryLayout,
  type SummaryNumberPlace,
  type SummarySvgStyle,
} from './summary-layout';
import { planSongbook, type SongbookPageKind } from './songbook-plan';
import type { jsPDF } from 'jspdf';

/** The axis All songs is ordered by for print. `title` is the printed heading;
 * the rest mirror the library's own sort axes. */
export type SongOrderAxis = 'title' | 'name' | 'created' | 'changed';

export interface SongOrder {
  readonly axis: SongOrderAxis;
  readonly dir: 'asc' | 'desc';
  readonly favoritesFirst: boolean;
}

/** The order All songs falls back to when none is asked for: by title, A→Z. */
export const DEFAULT_SONG_ORDER: SongOrder = {
  axis: 'title',
  dir: 'asc',
  favoritesFirst: false,
};

/**
 * The order the virtual **All songs** prints in.
 *
 * Only All songs uses this — a real songbook's order *is* its content. The
 * default axis is `title`, the heading a reader flips to find: sorting by `name`
 * alone was the original bug, because a song's library name stays "New song"
 * until it is renamed while its title comes from the content, so a written-but-
 * unrenamed library came out in insertion order. `name` is offered too, and the
 * two date axes, all with a direction and an optional starred-first float.
 *
 * Pure and exported so the order is testable without the render pipeline.
 */
export function librarySongOrder(
  songs: readonly Song[],
  order: SongOrder = DEFAULT_SONG_ORDER,
): Song[] {
  const text = (song: Song): string =>
    order.axis === 'name' ? song.name : song.cache.title || song.name;
  const num = (song: Song): number =>
    order.axis === 'changed' ? song.updatedAt : song.createdAt;

  const compare = (a: Song, b: Song): number => {
    const by =
      order.axis === 'created' || order.axis === 'changed'
        ? num(a) - num(b)
        : text(a).localeCompare(text(b));
    // Name breaks every tie, so the order is stable and never insertion-random.
    return (order.dir === 'desc' ? -by : by) || a.name.localeCompare(b.name);
  };

  const live = songs.filter((song) => song.deletedAt === null).sort(compare);

  if (!order.favoritesFirst) return live;
  // Stable partition: starred songs float up but keep their sorted order among
  // themselves, and so do the rest.
  return [
    ...live.filter((song) => song.favorite),
    ...live.filter((song) => !song.favorite),
  ];
}

/**
 * The song's page number, in front of its title — "7. Wonderwall". What
 * `pageNumberPosition: 'before-title'` draws, instead of a number in a corner.
 *
 * **Unpadded** (1, 2, … 10, 11). Padding is a *filename's* problem: `01-` exists
 * in the image ZIP only so a lexical sort keeps ten songs in order. A reader
 * sorts nothing, and "07" on a printed page reads as a serial number rather than
 * as the seventh song. (The summary pads *after* the number instead, with
 * whitespace, so its titles line up without the digits being disfigured.)
 *
 * Written into the AST rather than drawn over the finished render, because a
 * title *is* content: the number then wears the title's own face and colour, and
 * follows the title onto the left-hand spine when the settings put it there
 * (§4.5) — none of which a number painted onto the page afterwards would do.
 *
 * A song with no title of its own gets the bare number, not a dangling "7.":
 * the number still has to reach the page, or the summary sends a reader to a
 * sheet with nothing on it to confirm they arrived.
 */
export function numberedAst(ast: SongAst, n: number): SongAst {
  const title = ast.title?.trim();
  return { ...ast, title: title ? `${n}. ${title}` : String(n) };
}

/** What a single song can come out as. */
export type SongFormat = 'png' | 'pdf';

/** …and what a handful of them can (§8). */
export type MultiFormat = 'zip-png' | 'zip-pdf' | 'pdf';

/** What a **songbook** can come out as: one printable PDF, or a ZIP of one PNG
 * per song named in book order behind a `00-summary.png` contents page. */
export type SongbookFormat = 'pdf' | 'zip-png';

/** Reports how far a multi-song download has generated: `done` of `total`. The
 * UI turns it into a spinner and an "n of N" count. */
export type DownloadProgress = (done: number, total: number) => void;

/**
 * Where a song's page number goes.
 *
 * Five of these are a spot on the paper. **`before-title` is not**: it puts the
 * number into the song's heading — "7. Wonderwall" — which is how a book is used
 * out loud ("turn to 7") and how a photocopied or re-bound page still says which
 * song it is, long after the corner it was printed in has been trimmed off.
 *
 * One choice rather than two toggles, because a number in the heading and a
 * number in the corner of the same sheet are the same number twice.
 */
export type PageNumberPosition =
  | 'bottom-center'
  | 'bottom-right'
  | 'bottom-left'
  | 'top-center'
  | 'top-right'
  | 'top-left'
  | 'before-title';

/** The title-page layouts. Only `classic` is drawn today (the render centres a
 * title block on the page); the others are named so the dialog can offer them
 * and are honoured as `classic` until each lands. */
export type TitlePageVariant = 'classic' | 'centered' | 'banner' | 'minimal';

export interface SongbookPdfOptions {
  /** PDF (the paper options below apply) or a ZIP of per-song images (they do
   * not — only the summary and, for All songs, the order carry over). */
  readonly format?: SongbookFormat;
  readonly pageSize?: PageSizeName;
  readonly isLandscape?: boolean;
  /** Page margin in **millimetres**. Added to the song's own `padding`, never
   * replacing it — the padding is inside the page the user shaped (§4.11). */
  readonly marginMm?: number;
  readonly hasTitlePage?: boolean;
  readonly titlePageVariant?: TitlePageVariant;
  readonly hasSummary?: boolean;
  /** Which side of the title the summary's page number sits on. */
  readonly summaryNumberPlace?: SummaryNumberPlace;
  readonly hasPageNumbers?: boolean;
  readonly pageNumberPosition?: PageNumberPosition;
  /** The order All songs prints in — ignored for a real songbook. */
  readonly songOrder?: SongOrder;
}

const DEFAULT_SONGBOOK_OPTIONS: Required<SongbookPdfOptions> = {
  format: 'pdf',
  pageSize: 'A4',
  isLandscape: false,
  marginMm: 10,
  hasTitlePage: true,
  titlePageVariant: 'classic',
  hasSummary: false,
  summaryNumberPlace: 'after',
  hasPageNumbers: true,
  pageNumberPosition: 'bottom-center',
  songOrder: DEFAULT_SONG_ORDER,
};

/** One song, laid out and serialized once — the unit every sink consumes. */
interface RenderedSong {
  readonly song: Song;
  readonly svg: string;
  readonly plan: RenderPlan;
}

/** One sheet of the on-screen print preview. */
export interface SongbookPreviewPage {
  readonly kind: SongbookPageKind;
  /** A screen SVG — the CSS-loaded face, not inlined bytes (far lighter per page,
   * and the screen has CSS to lean on where an exported file does not). */
  readonly svg: string;
  /** The printed number, or null for front matter. The preview overlays it in a
   * corner unless it is baked into the heading (`before-title`) or off. */
  readonly number: number | null;
}

/** The whole songbook, laid out for the screen — a WYSIWYG of its PDF. */
export interface SongbookPreview {
  readonly pages: readonly SongbookPreviewPage[];
  /** width / height of the paper each sheet shows on. */
  readonly aspect: number;
  /** The margin as a fraction of the paper's width and height, so a page frame
   * insets a song into the sheet the way the PDF does (the summary carries its
   * own margin and is shown full-bleed). */
  readonly marginRatioX: number;
  readonly marginRatioY: number;
  /** Where a corner page number sits, and whether the preview draws one. */
  readonly pageNumberPosition: PageNumberPosition;
  readonly hasCornerNumbers: boolean;
}

/** The summary's face and ink in the preview: the body family, printed black. */
const SUMMARY_PREVIEW_STYLE: SummarySvgStyle = {
  fontFamily: BODY_FAMILY,
  color: '#1a1a1a',
};

/**
 * The same, for a preview being read on a dark page.
 *
 * `DEFAULT_TUNING.dark.textColor`, so the one page the renderer does not draw
 * still lands on the renderer's own dark ink rather than a second opinion about
 * what "light grey" means. It is the on-screen preview only — `drawSummary`,
 * which is the PDF, has no dark form and never will.
 */
const SUMMARY_PREVIEW_STYLE_DARK: SummarySvgStyle = {
  fontFamily: BODY_FAMILY,
  color: DEFAULT_TUNING.dark.textColor,
};

@Injectable({ providedIn: 'root' })
export class DownloadService {
  private readonly songs = inject(SONG_REPOSITORY);
  private readonly songbooks = inject(SONGBOOK_REPOSITORY);
  private readonly parser = inject(ParserService);
  private readonly renderer = inject(RenderService);
  private readonly settings = inject(SettingsStore);
  private readonly exporter = inject(ExportService);
  private readonly fonts = inject(FontLoader);

  /** A single song as a picture. PNG carries the song inside it (see below). */
  async downloadSong(id: Uuid, format: SongFormat): Promise<void> {
    const [rendered] = await this.render([id]);
    if (!rendered) return;
    const base = songFileSlug(rendered.song);

    if (format === 'png') {
      await saveFile(await this.toPng(rendered), `${base}.png`, 'image/png');
      return;
    }
    await saveFile(
      await this.toPdf([rendered]),
      `${base}.pdf`,
      'application/pdf',
    );
  }

  /**
   * Several songs (§8). A ZIP of pictures, a ZIP of documents, or one document.
   *
   * The multi-page PDF gives **each song its own page shape** rather than
   * flattening them onto one paper size — these are N separate songs, not a
   * songbook, and a songbook is where a single page size becomes the point.
   */
  async downloadSongs(
    ids: readonly Uuid[],
    format: MultiFormat,
    onProgress?: DownloadProgress,
  ): Promise<void> {
    const rendered = await this.render(ids);
    if (rendered.length === 0) return;
    const stamp = fileDate();

    if (format === 'pdf') {
      await saveFile(
        await this.toPdf(rendered, onProgress),
        `achordeon-songs-${stamp}.pdf`,
        'application/pdf',
      );
      return;
    }

    const files: Record<string, Uint8Array> = {};
    // Numbered in selection order, zero-padded so the files hold that order under
    // a lexical sort — the same `NN-title-subtitle` shape a songbook's image ZIP
    // uses, and what makes the prefix, not a `-2` suffix, disambiguate two songs
    // that share a title.
    const pad = (n: number): string =>
      String(n).padStart(Math.max(2, String(rendered.length).length), '0');
    for (const [index, one] of rendered.entries()) {
      const blob =
        format === 'zip-png' ? await this.toPng(one) : await this.toPdf([one]);
      const ext = format === 'zip-png' ? 'png' : 'pdf';
      files[`${pad(index + 1)}-${songFileSlug(one.song)}.${ext}`] =
        new Uint8Array(await blob.arrayBuffer());
      onProgress?.(index + 1, rendered.length);
      if (index + 1 < rendered.length) await yieldToPaint();
    }
    await saveFile(
      new Blob([(await zip(files)) as unknown as BlobPart], {
        type: 'application/zip',
      }),
      `achordeon-songs-${stamp}.zip`,
      'application/zip',
    );
  }

  /**
   * A songbook, always as one PDF (§8).
   *
   * Every song is scaled to fit the chosen page while keeping its own aspect
   * ratio — the ratio is the user's decision at song scope (§4.1) and the book
   * is not allowed to overrule it, only to give it less room. A song shaped
   * unlike the paper therefore sits centred with white either side, which is the
   * honest outcome and not a bug.
   */
  async downloadSongbook(
    id: Uuid,
    options: SongbookPdfOptions = {},
    onProgress?: DownloadProgress,
  ): Promise<void> {
    const opts = { ...DEFAULT_SONGBOOK_OPTIONS, ...options };
    const book = await this.bookFor(id, opts.songOrder);
    if (!book) return;

    // `before-title` is the one page-number position the *render* has to know
    // about: the number is part of the heading, so it has to be there before the
    // song is laid out, not stamped on afterwards like a corner number.
    const isNumberInTitle =
      opts.hasPageNumbers && opts.pageNumberPosition === 'before-title';
    const rendered = await this.render(book.entries, book, isNumberInTitle);

    // The other shape a book can take: a folder of pictures instead of a
    // document. Everything below is about paper, which a ZIP has none of.
    if (opts.format === 'zip-png') {
      await this.songbookImages(book, rendered, opts, onProgress);
      return;
    }

    const page = orient(PAGE_SIZES[opts.pageSize], opts.isLandscape);
    const margin = opts.marginMm * MM;

    const doc = await createPdf(page);
    // The body face first, for the PDF's own text (the summary). Songs bring
    // their own faces; the summary is not a render and has none.
    registerFonts(doc, this.fonts.book([BODY_FAMILY]));
    for (const one of rendered) registerFonts(doc, one.plan.fonts);

    // Laid out before anything is drawn, because a summary that lists page 7 has
    // to know how many pages it will itself take up first — and because the
    // column split is what decides that count. Measuring needs the body face
    // registered, which it now is.
    const summary = opts.hasSummary
      ? layoutSummary(
          summaryItems(rendered),
          page,
          margin,
          measureWith(doc),
          opts.summaryNumberPlace,
        )
      : undefined;
    const summaryPages = summary?.pages ?? 0;

    // The one definition of the page sequence and its numbering, shared with the
    // on-screen preview so the two cannot disagree on which sheet is page 7.
    const plan = planSongbook({
      hasTitlePage: opts.hasTitlePage,
      summaryPages,
      songCount: rendered.length,
    });

    // The title page is a *render*, not drawn text: it obeys the songbook's own
    // fonts and colours, which is what makes it the book's title page rather
    // than a header the exporter invented. This is what replaces the plain-text
    // `<app-title-page>` stand-in Epic 6 mounts.
    let isFirst = true;
    if (opts.hasTitlePage) {
      const title = await this.renderTitlePage(book);
      registerFonts(doc, title.fonts);
      await drawOnPage(doc, title.svg, title.box, page, margin);
      isFirst = false;
    }

    /**
     * How many sheets come before the songs.
     *
     * **The first song is page 1**, and the title page and summary carry no
     * number at all — they are front matter. Numbering them would have the
     * summary send a reader to "page 3" for the first song, which is a number
     * they can only use by counting past two sheets that also claim numbers. The
     * physical sheet index and the printed number therefore differ by exactly
     * this, and every link below converts.
     */
    const frontMatter = plan.frontMatter;

    if (summary && summary.pages > 0) {
      this.drawSummary(doc, summary, page, frontMatter, isFirst);
      isFirst = false;
    }

    let drawn = 0;
    for (const one of rendered) {
      if (!isFirst) doc.addPage([page.width, page.height]);
      isFirst = false;
      await drawOnPage(doc, one.svg, one.plan.box, page, margin);
      onProgress?.(++drawn, rendered.length);
      if (drawn < rendered.length) await yieldToPaint();
    }

    // …and the corner is skipped when the number went into the heading instead:
    // it is one number in one place, not a number and its echo.
    if (opts.hasPageNumbers && !isNumberInTitle) {
      this.drawPageNumbers(
        doc,
        page,
        margin,
        opts.pageNumberPosition,
        frontMatter,
      );
    }

    await saveFile(
      doc.output('blob'),
      `${toFileSlug(book.name, 'songbook')}.pdf`,
      'application/pdf',
    );
  }

  /**
   * A songbook as a **ZIP of images** — one PNG per song, named in book order so
   * a file browser or a printer keeps the songs in the sequence you arranged,
   * behind a `00-summary.png` contents page.
   *
   * Each song PNG carries its own Export JSON (`toPng`, like every downloaded
   * picture), so dropping one back on Import rebuilds the song, settings and all.
   */
  private async songbookImages(
    book: Songbook,
    rendered: readonly RenderedSong[],
    opts: Required<SongbookPdfOptions>,
    onProgress?: DownloadProgress,
  ): Promise<void> {
    const files: Record<string, Uint8Array> = {};

    // Zero-padded to the count's width, so lexical order survives past nine
    // songs — `10-` must not sort between `01-` and `02-`. At least two digits,
    // so the summary's `00` files with the songs rather than ahead as `0`.
    const width = Math.max(2, String(rendered.length).length);
    const pad = (n: number): string => String(n).padStart(width, '0');

    if (opts.hasSummary) {
      const summary = await this.contentsImage(book, rendered);
      files[`${pad(0)}-summary.png`] = new Uint8Array(
        await summary.arrayBuffer(),
      );
    }

    let n = 1;
    for (const one of rendered) {
      const png = await this.toPng(one);
      // The number prefix is already unique — two songs sharing a title still
      // get `03-` and `04-`.
      files[`${pad(n)}-${songFileSlug(one.song)}.png`] = new Uint8Array(
        await png.arrayBuffer(),
      );
      onProgress?.(n, rendered.length);
      if (n < rendered.length) await yieldToPaint();
      n++;
    }

    await saveFile(
      new Blob([(await zip(files)) as unknown as BlobPart], {
        type: 'application/zip',
      }),
      `${toFileSlug(book.name, 'songbook')}.zip`,
      'application/zip',
    );
  }

  /**
   * The contents page as a PNG: the book's title over its songs, numbered in the
   * same order their image files are.
   *
   * Rendered through the **one pipeline** (§2) rather than drawn as ad-hoc canvas
   * text, so it wears the book's own fonts and colours — the same reason the PDF
   * title page is a render (`renderTitlePage`) and not typed text. Page numbers
   * would be a lie here: every song is its own file, and the file's number is its
   * place, so the list carries that number and nothing more.
   */
  private async contentsImage(
    book: Songbook,
    rendered: readonly RenderedSong[],
  ): Promise<Blob> {
    const settings = resolveSettings(this.settings.global(), book.settings);
    await this.renderer.ensureFonts([settings]);
    const titles = rendered.map((one) => one.song.cache.title || one.song.name);
    const plan = this.renderer.layout(contentsAst(book, titles), settings);
    return svgToPng(this.renderer.emit(plan, true), plan.box);
  }

  /**
   * The book behind an id — real, or the **virtual All songs** synthesised on
   * the spot.
   *
   * All songs has no record, so it is the whole library ordered by title (see
   * `librarySongOrder`), with a title page that says what it is (no author —
   * nobody wrote it). Built here rather than passed in so the one entry point
   * (`downloadSongbook(id)`) works for both, and the id stays the thing the UI
   * hands over.
   */
  private async bookFor(
    id: Uuid,
    order: SongOrder,
  ): Promise<Songbook | undefined> {
    if (!isAllSongs(id)) return this.songbooks.get(id);
    const songs = librarySongOrder(await this.songs.all(), order);
    return {
      id: ALL_SONGS_ID,
      createdAt: 0,
      updatedAt: 0,
      deletedAt: null,
      name: 'All songs',
      title: 'All songs',
      subtitle: '',
      author: '',
      settings: {},
      entries: songs.map((song) => song.id),
    };
  }

  /**
   * Songs, rendered offscreen (§2). Missing ids and tombstones fall out; a slot
   * repeated in a songbook is rendered again, because it prints twice.
   */
  private async render(
    ids: readonly Uuid[],
    book?: Songbook,
    isNumberInTitle = false,
    inlineFonts = true,
    isDark = false,
  ): Promise<RenderedSong[]> {
    const rows = await Promise.all(ids.map((id) => this.songs.get(id)));
    const songs = rows.filter(
      (row): row is Song => row !== undefined && row.deletedAt === null,
    );
    const settings = songs.map((song) => this.settingsFor(song, book));

    // Every face first, and awaited: the screen may render a frame in a
    // fallback and correct itself, a file cannot (PRD-RENDERING §3).
    await this.renderer.ensureFonts(settings);

    return songs.map((song, i) => {
      const ast = this.parser.parse(song.content);
      // The number is the song's place in *this* list — the filtered one, which
      // is also what the summary numbers off, so the two agree even when a
      // songbook points at a song that has since been deleted.
      // `isDark` is only ever true for the on-screen preview: a file is paper
      // (PRD-RENDERING §5), so every export path leaves it at its default.
      const plan = this.renderer.layout(
        isNumberInTitle ? numberedAst(ast, i + 1) : ast,
        settings[i],
        { dark: isDark },
      );
      // `inlineFonts` — a downloaded FILE has no CSS to lean on and Safari will
      // not fetch a font from inside an SVG (ADR-0002), so exports inline the
      // bytes. The on-screen preview leans on the CSS-loaded face and leaves them
      // out, which is far lighter per page.
      return { song, svg: this.renderer.emit(plan, inlineFonts), plan };
    });
  }

  private settingsFor(song: Song, book?: Songbook): GlobalSettings {
    return resolveSettings(
      this.settings.global(),
      book?.settings,
      song.settings,
    );
  }

  /**
   * A PNG, with the song's own Export JSON inside it (§8).
   *
   * So one file is both the picture and the song: a friend can look at it, drop
   * it on the import button, and have the thing itself — settings and all.
   */
  private async toPng(one: RenderedSong): Promise<Blob> {
    const png = await svgToPng(one.svg, one.plan.box);
    const snapshot = await this.exporter.snapshot({ songIds: [one.song.id] });
    return embedSnapshot(png, this.exporter.toJson(snapshot));
  }

  private async toPdf(
    songs: readonly RenderedSong[],
    onProgress?: DownloadProgress,
  ): Promise<Blob> {
    const first = pageForBox(songs[0].plan.box);
    const doc = await createPdf(first);
    for (const one of songs) registerFonts(doc, one.plan.fonts);

    for (const [index, one] of songs.entries()) {
      const page = pageForBox(one.plan.box);
      if (index > 0) doc.addPage([page.width, page.height]);
      await drawSvg(doc, one.svg, { x: 0, y: 0, ...page });
      onProgress?.(index + 1, songs.length);
      if (index + 1 < songs.length) await yieldToPaint();
    }
    return doc.output('blob');
  }

  /** The songbook's title page, as a song with no lines. */
  private async renderTitlePage(
    book: Songbook,
    inlineFonts = true,
    isDark = false,
  ): Promise<{ svg: string; box: Size; fonts: RenderPlan['fonts'] }> {
    const settings = resolveSettings(this.settings.global(), book.settings);
    await this.renderer.ensureFonts([settings]);
    // Centred, not hugging the corner: this is a page of the book rather than a
    // song, and three lines in the top-left of a sheet of paper read as a
    // mistake. (§4.5 hugs for songs; `align` is the option that says otherwise.)
    const plan = this.renderer.layout(titlePageAst(book), settings, {
      align: 'center',
      dark: isDark,
    });
    return {
      svg: this.renderer.emit(plan, inlineFonts),
      box: plan.box,
      fonts: plan.fonts,
    };
  }

  /**
   * The whole songbook as on-screen pages — the print preview `/songbooks` pane B
   * shows, WYSIWYG of the PDF `downloadSongbook` would write.
   *
   * The same assembly as the PDF, drawn for the screen instead of the page: it
   * reuses `bookFor` (so the virtual All songs works), `render` (screen SVGs,
   * fonts left to the CSS-loaded face), `renderTitlePage`, `layoutSummary` and the
   * one `planSongbook` — so the two sinks cannot disagree about which sheet is
   * page 7. The only thing drawn by a different hand is the summary, which the PDF
   * types and the preview emits as SVG off the identical placements.
   */
  async previewSongbook(
    id: Uuid,
    options: SongbookPdfOptions = {},
    isDark = false,
  ): Promise<SongbookPreview> {
    const opts = { ...DEFAULT_SONGBOOK_OPTIONS, ...options };
    const page = orient(PAGE_SIZES[opts.pageSize], opts.isLandscape);
    const margin = opts.marginMm * MM;
    const empty: SongbookPreview = {
      pages: [],
      aspect: page.width / page.height,
      marginRatioX: margin / page.width,
      marginRatioY: margin / page.height,
      pageNumberPosition: opts.pageNumberPosition,
      hasCornerNumbers: false,
    };

    const book = await this.bookFor(id, opts.songOrder);
    if (!book) return empty;

    const isNumberInTitle =
      opts.hasPageNumbers && opts.pageNumberPosition === 'before-title';
    const rendered = await this.render(
      book.entries,
      book,
      isNumberInTitle,
      false,
      isDark,
    );

    const summary = opts.hasSummary
      ? layoutSummary(
          summaryItems(rendered),
          page,
          margin,
          previewMeasure(),
          opts.summaryNumberPlace,
        )
      : undefined;
    const summaryPages = summary?.pages ?? 0;

    const plan = planSongbook({
      hasTitlePage: opts.hasTitlePage,
      summaryPages,
      songCount: rendered.length,
    });

    const title = opts.hasTitlePage
      ? await this.renderTitlePage(book, false, isDark)
      : undefined;

    // The preview is a WYSIWYG of the PDF, so it turns what the PDF turns
    // (ADR-0013) — through the same `placeInto`, never a second rule. A preview
    // that showed a landscape song letterboxed while the file laid it sideways
    // would be worse than no preview.
    const asPrinted = (svg: string, box: Size): string =>
      placeInto(box, page, margin).isTurned ? turnedSvg(svg, box) : svg;

    const pages: SongbookPreviewPage[] = plan.pages.map((entry) => {
      if (entry.kind === 'title') {
        return {
          kind: entry.kind,
          svg: title ? asPrinted(title.svg, title.box) : '',
          number: null,
        };
      }
      if (entry.kind === 'summary') {
        return {
          kind: entry.kind,
          svg: summary
            ? summaryToSvg(
                summary,
                page,
                entry.sourceIndex ?? 0,
                isDark ? SUMMARY_PREVIEW_STYLE_DARK : SUMMARY_PREVIEW_STYLE,
              )
            : '',
          number: null,
        };
      }
      const one = rendered[entry.sourceIndex ?? 0];
      return {
        kind: entry.kind,
        svg: asPrinted(one.svg, one.plan.box),
        number: entry.number,
      };
    });

    return {
      ...empty,
      pages,
      hasCornerNumbers: opts.hasPageNumbers && !isNumberInTitle,
    };
  }

  /**
   * The summary, drawn as PDF text rather than rendered as an SVG.
   *
   * It is the one page that is not a song: a list of names against page numbers,
   * where the page number is only knowable after the pagination is decided. A
   * two-pass render for typography nobody is reading as music would buy nothing.
   *
   * Where each entry *goes* is `summary-layout`'s answer — the columns, the wide
   * gutter and the truncation are arithmetic, and arithmetic belongs somewhere a
   * test can reach without a PDF. This method is the hand that holds the pen.
   */
  private drawSummary(
    doc: jsPDF,
    layout: SummaryLayout,
    page: Size,
    frontMatter: number,
    isFirstPage: boolean,
  ): void {
    // The bundled body face, not jsPDF's built-in Helvetica: Helvetica is
    // WinAnsi-encoded and has no `ě ř ů`, so a Czech title came out of the
    // summary with holes in it while the song two pages later was perfect.
    const setPen = (): void => {
      doc.setFont(BODY_FAMILY, 'normal');
      doc.setFontSize(layout.metrics.fontSize);
    };
    setPen();

    let sheet = -1;
    for (const entry of layout.placements) {
      if (entry.page !== sheet) {
        // The first summary page is only a NEW page when something (a title
        // page) already claimed the one the document opened with.
        if (entry.page > 0 || !isFirstPage) {
          doc.addPage([page.width, page.height]);
          setPen();
        }
        sheet = entry.page;
      }

      // The sheet the entry points at — the printed number plus the front
      // matter, which carries no number of its own. Every song is one page, so
      // the entry's index is its printed number minus one.
      const target = frontMatter + entry.index + 1;

      // **The whole line links**, not only the digits: a page number is a
      // two-character target, and the thing a reader is pointing at is the
      // title. The leader is part of that line, so it carries the link too —
      // a run of dots that is not clickable is a hole across the middle of it.
      doc.textWithLink(entry.title, entry.titleX, entry.y, {
        pageNumber: target,
      });
      doc.textWithLink(entry.number, entry.numberX, entry.y, {
        align: entry.numberAlign,
        pageNumber: target,
      });
      if (entry.leader) {
        doc.textWithLink(entry.leader, entry.leaderX, entry.y, {
          pageNumber: target,
        });
      }
    }
  }

  /**
   * Numbers on the song pages, added last so the count is known.
   *
   * **Front matter carries none.** A title page that says "1" makes the first
   * song page 2, and then every number the summary prints is one more than the
   * number of songs the reader has counted past. Numbering starts where the
   * songs start.
   *
   * Never called for `before-title` — that number is drawn by the *render*, in
   * the heading, and the caller skips this so the page does not get both.
   */
  private drawPageNumbers(
    doc: jsPDF,
    page: Size,
    margin: number,
    position: PageNumberPosition,
    frontMatter: number,
  ): void {
    const total = doc.getNumberOfPages();
    const isTop = position.startsWith('top');
    const isLeft = position.endsWith('left');
    const isRight = position.endsWith('right');
    const y = isTop ? margin : page.height - margin / 2;
    const x = isLeft ? margin : isRight ? page.width - margin : page.width / 2;
    const align = isLeft ? 'left' : isRight ? 'right' : 'center';

    doc.setFont(BODY_FAMILY, 'normal');
    for (let sheet = frontMatter + 1; sheet <= total; sheet++) {
      doc.setPage(sheet);
      doc.setFontSize(9);
      doc.text(String(sheet - frontMatter), x, y, { align });
    }
  }
}

/**
 * The contents list as the layout wants it: a title and a printed number per
 * song, in book order.
 *
 * The number is the song's **printed page number**, which is its index plus one
 * because every song in a songbook occupies exactly one page (each render is
 * scaled to fit one sheet, §8). Front matter is deliberately not in it — the
 * title page and the summary carry no number, so "1" means the first song, which
 * is the number a reader can actually use.
 *
 * Which SIDE of the title that number is drawn on is `summary-layout`'s business
 * (`SummaryNumberPlace`), not this function's: the number is the same fact either
 * way, and where it lands is arithmetic.
 */
function summaryItems(songs: readonly RenderedSong[]): SummaryItem[] {
  return songs.map((one, index) => ({
    title: one.song.cache.title || one.song.name,
    number: String(index + 1),
  }));
}

/**
 * A canvas-backed text measurer for the preview's summary — the screen's answer
 * to `measureWith(doc)`.
 *
 * The summary's page COUNT does not depend on it (rows and columns are geometry,
 * not text width), so the preview and the PDF agree on how many summary sheets
 * there are regardless of which measurer laid them out; this only decides the
 * leader-dot runs and where a long title is clipped. A no-op width in a
 * canvas-less environment simply drops the leaders.
 */
function previewMeasure(): MeasureText {
  const ctx = globalThis.document?.createElement('canvas').getContext('2d');
  if (!ctx) return () => 0;
  return (text, fontSize) => {
    ctx.font = `${fontSize}px ${BODY_FAMILY}`;
    return ctx.measureText(text).width;
  };
}

/**
 * The layout's measurement seam, bound to the document that will draw the text.
 *
 * The face and size are set on every call rather than once up front, because
 * between the layout and the drawing sits `svg2pdf`, which sets whatever the
 * song's SVG asked for. A width measured under a font the summary is not set in
 * is a width that describes nothing.
 */
function measureWith(doc: jsPDF): MeasureText {
  return (text, fontSize) => {
    doc.setFont(BODY_FAMILY, 'normal');
    doc.setFontSize(fontSize);
    return doc.getTextWidth(text);
  };
}

/**
 * Pack, loaded on demand like the PDF kit — a user who never downloads a batch
 * should not carry a zip encoder through first paint.
 *
 * `level: 0` (stored, not deflated): every entry is already a PNG or a PDF, both
 * of which are compressed streams. Deflating them again buys a percent and costs
 * a pass over several megabytes on the user's main thread.
 */
async function zip(files: Record<string, Uint8Array>): Promise<Uint8Array> {
  const { zipSync } = await import('fflate');
  return zipSync(files, { level: 0 });
}

/**
 * Hand the main thread back so the browser can paint between songs.
 *
 * The render → raster/PDF/zip work is synchronous, so without a macrotask break
 * the progress the UI is bound to would land in one jump when the whole job
 * finishes — the spinner never spins and the count never moves. A `setTimeout(0)`
 * yield per song is a few milliseconds against work measured in tens, and it is
 * what keeps the app responsive while a book generates (the generation still runs
 * on the main thread; a worker is the heavier alternative).
 */
function yieldToPaint(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve);
  });
}

/**
 * The contents page of the image ZIP, as a `SongAst` — the book's title over a
 * numbered list of its songs, in book order.
 *
 * Built as content and rendered like any other page, the sibling of
 * `titlePageAst`: the same reason it lives as an AST rather than as drawn text
 * is that the renderer already knows how to lay out a title and lines, and a
 * second layout path would have to be kept in step with the first. Local to the
 * download because it is the one thing that wants it — a title page is previewed
 * elsewhere; a contents *image* is not.
 */
function contentsAst(book: Songbook, titles: readonly string[]): SongAst {
  return {
    title: book.title || book.name,
    subtitle: '',
    blocks: [
      {
        lines: titles.map((text, index) => ({
          text: `${index + 1}. ${text}`,
          chords: [],
        })),
      },
    ],
    warnings: [],
  };
}

/**
 * A song's download file name (before the extension): its **title, then its
 * subtitle** where there is one, slugified.
 *
 * The picture is named for what it *is* — "Wonderwall-Oasis" — rather than the
 * library filing name, which may still be the untouched "New song". Falls back to
 * the title alone, then to the library name when there is no title yet. The slug
 * is the same safe form every other download name takes (`toFileSlug`), so the
 * separators collapse to hyphens.
 */
function songFileSlug(song: Song): string {
  const title = song.cache.title.trim();
  const subtitle = song.cache.subtitle.trim();
  const label = title
    ? subtitle
      ? `${title} - ${subtitle}`
      : title
    : song.name;
  return toFileSlug(label, 'song');
}
