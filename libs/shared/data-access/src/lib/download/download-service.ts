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
  resolveSettings,
  titlePageAst,
  type GlobalSettings,
  type Song,
  type Songbook,
  type Uuid,
} from '@achordeon/shared/domain';
import type { RenderPlan } from '@achordeon/shared/render-core';
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
  fitInto,
  orient,
  pageForBox,
  type PageSizeName,
  type Size,
} from './page-geometry';
import { createPdf, drawSvg, registerFonts } from './pdf-doc';
import { svgToPng } from './raster';
import type { jsPDF } from 'jspdf';

/** What a single song can come out as. */
export type SongFormat = 'png' | 'pdf';

/** …and what a handful of them can (§8). */
export type MultiFormat = 'zip-png' | 'zip-pdf' | 'pdf';

export type PageNumberPosition =
  | 'bottom-center'
  | 'bottom-right'
  | 'bottom-left'
  | 'top-center'
  | 'top-right'
  | 'top-left';

/** The title-page layouts. Only `classic` is drawn today (the render centres a
 * title block on the page); the others are named so the dialog can offer them
 * and are honoured as `classic` until each lands. */
export type TitlePageVariant = 'classic' | 'centered' | 'banner' | 'minimal';

export interface SongbookPdfOptions {
  readonly pageSize?: PageSizeName;
  readonly isLandscape?: boolean;
  /** Page margin in **millimetres**. Added to the song's own `padding`, never
   * replacing it — the padding is inside the page the user shaped (§4.11). */
  readonly marginMm?: number;
  readonly hasTitlePage?: boolean;
  readonly titlePageVariant?: TitlePageVariant;
  readonly hasSummary?: boolean;
  readonly hasPageNumbers?: boolean;
  readonly pageNumberPosition?: PageNumberPosition;
}

const DEFAULT_SONGBOOK_OPTIONS: Required<SongbookPdfOptions> = {
  pageSize: 'A4',
  isLandscape: false,
  marginMm: 10,
  hasTitlePage: true,
  titlePageVariant: 'classic',
  hasSummary: false,
  hasPageNumbers: true,
  pageNumberPosition: 'bottom-center',
};

/** One song, laid out and serialized once — the unit every sink consumes. */
interface RenderedSong {
  readonly song: Song;
  readonly svg: string;
  readonly plan: RenderPlan;
}

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
    const base = toFileSlug(rendered.song.name, 'song');

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
  ): Promise<void> {
    const rendered = await this.render(ids);
    if (rendered.length === 0) return;
    const stamp = fileDate();

    if (format === 'pdf') {
      await saveFile(
        await this.toPdf(rendered),
        `achordeon-songs-${stamp}.pdf`,
        'application/pdf',
      );
      return;
    }

    const files: Record<string, Uint8Array> = {};
    for (const one of rendered) {
      const blob =
        format === 'zip-png' ? await this.toPng(one) : await this.toPdf([one]);
      const ext = format === 'zip-png' ? 'png' : 'pdf';
      files[uniqueName(files, toFileSlug(one.song.name, 'song'), ext)] =
        new Uint8Array(await blob.arrayBuffer());
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
  ): Promise<void> {
    const opts = { ...DEFAULT_SONGBOOK_OPTIONS, ...options };
    const book = await this.songbooks.get(id);
    if (!book) return;

    const rendered = await this.render(book.entries, book);
    const page = orient(PAGE_SIZES[opts.pageSize], opts.isLandscape);
    const margin = opts.marginMm * MM;

    const doc = await createPdf(page);
    // The body face first, for the PDF's own text (the summary). Songs bring
    // their own faces; the summary is not a render and has none.
    registerFonts(doc, this.fonts.book([BODY_FAMILY]));
    for (const one of rendered) registerFonts(doc, one.plan.fonts);

    // The title page is a *render*, not drawn text: it obeys the songbook's own
    // fonts and colours, which is what makes it the book's title page rather
    // than a header the exporter invented. This is what replaces the plain-text
    // `<app-title-page>` stand-in Epic 6 mounts.
    let isFirst = true;
    if (opts.hasTitlePage) {
      const title = await this.renderTitlePage(book);
      registerFonts(doc, title.fonts);
      await drawSvg(doc, title.svg, fitInto(title.box, page, margin));
      isFirst = false;
    }

    // Counted before anything is drawn, because a summary that lists page 7 has
    // to know how many pages it will itself take up first.
    const summaryPages = opts.hasSummary
      ? this.summaryPageCount(rendered.length, page, margin)
      : 0;
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
    const frontMatter = (opts.hasTitlePage ? 1 : 0) + summaryPages;

    if (opts.hasSummary) {
      this.drawSummary(doc, rendered, page, margin, frontMatter, isFirst);
      isFirst = false;
    }

    for (const one of rendered) {
      if (!isFirst) doc.addPage([page.width, page.height]);
      isFirst = false;
      await drawSvg(doc, one.svg, fitInto(one.plan.box, page, margin));
    }

    if (opts.hasPageNumbers) {
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
   * Songs, rendered offscreen (§2). Missing ids and tombstones fall out; a slot
   * repeated in a songbook is rendered again, because it prints twice.
   */
  private async render(
    ids: readonly Uuid[],
    book?: Songbook,
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
      const plan = this.renderer.layout(
        this.parser.parse(song.content),
        settings[i],
      );
      // `inlineFonts` — a downloaded file has no CSS to lean on, and Safari
      // will not fetch a font from inside an SVG (ADR-0002).
      return { song, svg: this.renderer.emit(plan, true), plan };
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

  private async toPdf(songs: readonly RenderedSong[]): Promise<Blob> {
    const first = pageForBox(songs[0].plan.box);
    const doc = await createPdf(first);
    for (const one of songs) registerFonts(doc, one.plan.fonts);

    for (const [index, one] of songs.entries()) {
      const page = pageForBox(one.plan.box);
      if (index > 0) doc.addPage([page.width, page.height]);
      await drawSvg(doc, one.svg, { x: 0, y: 0, ...page });
    }
    return doc.output('blob');
  }

  /** The songbook's title page, as a song with no lines. */
  private async renderTitlePage(
    book: Songbook,
  ): Promise<{ svg: string; box: Size; fonts: RenderPlan['fonts'] }> {
    const settings = resolveSettings(this.settings.global(), book.settings);
    await this.renderer.ensureFonts([settings]);
    // Centred, not hugging the corner: this is a page of the book rather than a
    // song, and three lines in the top-left of a sheet of paper read as a
    // mistake. (§4.5 hugs for songs; `align` is the option that says otherwise.)
    const plan = this.renderer.layout(titlePageAst(book), settings, {
      align: 'center',
    });
    return {
      svg: this.renderer.emit(plan, true),
      box: plan.box,
      fonts: plan.fonts,
    };
  }

  /** Height of one summary line, in points. */
  private summaryLineHeight(page: Size): number {
    return Math.max(page.height / 40, 12);
  }

  private summaryLinesPerPage(page: Size, margin: number): number {
    const usable = page.height - margin * 2 - this.summaryLineHeight(page) * 2;
    return Math.max(Math.floor(usable / this.summaryLineHeight(page)), 1);
  }

  private summaryPageCount(count: number, page: Size, margin: number): number {
    return Math.max(
      Math.ceil(count / this.summaryLinesPerPage(page, margin)),
      1,
    );
  }

  /**
   * The summary, drawn as PDF text rather than rendered as an SVG.
   *
   * It is the one page that is not a song: a list of names against page numbers,
   * where the page number is only knowable after the pagination is decided. A
   * two-pass render for typography nobody is reading as music would buy nothing.
   */
  private drawSummary(
    doc: jsPDF,
    songs: readonly RenderedSong[],
    page: Size,
    margin: number,
    frontMatter: number,
    isFirstPage: boolean,
  ): void {
    const lineHeight = this.summaryLineHeight(page);
    const perPage = this.summaryLinesPerPage(page, margin);
    let y = margin + lineHeight * 2;

    // The bundled body face, not jsPDF's built-in Helvetica: Helvetica is
    // WinAnsi-encoded and has no `ě ř ů`, so a Czech title came out of the
    // summary with holes in it while the song two pages later was perfect.
    doc.setFont(BODY_FAMILY, 'normal');

    songs.forEach((one, index) => {
      if (index > 0 && index % perPage === 0) {
        doc.addPage([page.width, page.height]);
        y = margin + lineHeight * 2;
      } else if (index === 0 && !isFirstPage) {
        doc.addPage([page.width, page.height]);
      }
      doc.setFontSize(lineHeight * 0.7);

      // The printed number, and the sheet it is actually on — different by the
      // front matter, which carries no number of its own.
      const printed = String(index + 1);
      const sheet = frontMatter + index + 1;
      const title = one.song.cache.title || one.song.name;

      // **The whole line links**, not only the digits: a page number is a
      // two-character target, and the thing a reader is pointing at is the
      // title. Both go to the same page.
      doc.textWithLink(title, margin, y, { pageNumber: sheet });
      doc.textWithLink(printed, page.width - margin, y, {
        align: 'right',
        pageNumber: sheet,
      });
      y += lineHeight;
    });
  }

  /**
   * Numbers on the song pages, added last so the count is known.
   *
   * **Front matter carries none.** A title page that says "1" makes the first
   * song page 2, and then every number the summary prints is one more than the
   * number of songs the reader has counted past. Numbering starts where the
   * songs start.
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

/** Two songs may share a name; a ZIP entry may not. */
function uniqueName(
  taken: Record<string, unknown>,
  base: string,
  ext: string,
): string {
  let name = `${base}.${ext}`;
  let n = 2;
  while (name in taken) name = `${base}-${n++}.${ext}`;
  return name;
}
