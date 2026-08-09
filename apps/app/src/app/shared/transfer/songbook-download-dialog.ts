// Songbook PDF dialog — Epic 7 ▸ subtask 6
// Spec: PRD-INFRASTRUCTURE.md §8 (title page / summary / page-number toggles +
// position, page size, songs keep their aspect ratio scaled to fit)
//
// A songbook comes out as a PDF, a ZIP of per-song images, or the Achordeon
// file, so this dialog asks the format first and then, for a PDF, about the
// *paper*. Controlled, like every other panel in `app/shared`: values in, one
// choice out.
//
// The Achordeon file is here rather than on a button of its own for the reason
// the song dialog gives at length: Download and Export are one act to choose
// between, not two to know about in advance. This dialog already had the
// control for it — the format select, which was always what decided how much of
// the form below even applies.

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { Button, Dialog } from '../../primitives';
import {
  DATA_FORMAT,
  SHARE_LINK_FORMAT,
  DEFAULT_SONGBOOK_CHOICE,
  type DownloadProgress,
  type PageSizeChoice,
  type SongbookChoiceFormat,
  type SongbookPdfChoice,
} from './transfer-model';

@Component({
  selector: 'app-songbook-download-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Dialog],
  template: `
    <app-dialog
      [title]="title()"
      data-testid="songbook-download-dialog"
      (closed)="closed.emit()"
    >
      <div class="rows">
        <!-- Format first: it decides which of the rows below are even asked.
             A PDF is about paper (size, margins, page numbers); a ZIP of images
             is about none of those, and the Achordeon file is about none of
             *anything* here — it is the book as data, so every question below
             stands down and the dialog is one line and a button. -->
        <label class="row">
          <span class="name">{{ formatLabel }}</span>
          <select
            class="control"
            [value]="choice().format"
            data-testid="songbook-format"
            (change)="patch({ format: format($event) })"
          >
            <option value="pdf">{{ pdfLabel }}</option>
            <option value="zip-png">{{ zipPngLabel }}</option>
            <option value="json">{{ dataLabel }}</option>
            <!-- Disabled, never removed, when the book will not fit: a greyed
                 option that explains itself teaches the limit, where one that
                 vanishes reads as a missing feature. -->
            <option value="share-link" [disabled]="isShareLinkReady() !== true">
              {{ shareLinkLabel }}
            </option>
          </select>
        </label>

        @if (isShareLinkReady() === false) {
          <p class="warn" data-testid="songbook-link-too-big">
            {{ linkTooBigText }}
          </p>
        }

        @if (choice().format === 'pdf') {
          <label class="row">
            <span class="name">{{ pageSizeLabel }}</span>
            <select
              class="control"
              [value]="choice().pageSize"
              data-testid="pdf-page-size"
              (change)="patch({ pageSize: size($event) })"
            >
              <option value="A4">A4</option>
              <option value="Letter">Letter</option>
              <option value="A5">A5</option>
            </select>
          </label>

          <label class="row">
            <span class="name">{{ orientationLabel }}</span>
            <select
              class="control"
              [value]="choice().isLandscape ? 'landscape' : 'portrait'"
              data-testid="pdf-orientation"
              (change)="patch({ isLandscape: value($event) === 'landscape' })"
            >
              <option value="portrait">{{ portraitLabel }}</option>
              <option value="landscape">{{ landscapeLabel }}</option>
            </select>
          </label>

          <label class="row">
            <span class="name">{{ marginLabel }}</span>
            <input
              class="control"
              type="number"
              min="0"
              max="50"
              step="1"
              [value]="choice().marginMm"
              data-testid="pdf-margin"
              (change)="patch({ marginMm: number($event) })"
            />
          </label>
        }

        <!-- Neither the book's structure (title page, contents, page numbers) nor
             — for All songs — its order is here: both belong to the book and are
             set in its settings dialog. This dialog asks only about format and
             paper, and the download draws the book as it already stands. -->
      </div>

      <p class="note">{{ note() }}</p>

      <button
        dialog-actions
        appButton
        type="button"
        variant="secondary"
        [disabled]="busy()"
        data-testid="songbook-download-cancel"
        (click)="closed.emit()"
      >
        {{ cancelLabel }}
      </button>
      <!-- Confirm doubles as the progress once pressed: a spinner and, for more
           than one song, an "n of N" count that advances as the book renders.
           It cannot be pressed again while it works. -->
      <button
        dialog-actions
        appButton
        type="button"
        variant="primary"
        [disabled]="busy()"
        data-testid="songbook-download-confirm"
        (click)="chosen.emit(choice())"
      >
        @if (busy()) {
          <span class="spinner" aria-hidden="true"></span>
          {{ generatingLabel() }}
        } @else {
          {{ downloadLabel() }}
        }
      </button>
    </app-dialog>
  `,
  styles: `
    .rows {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .row {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: var(--space-2);
    }

    .row.is-toggle {
      grid-template-columns: auto 1fr;
      justify-items: start;
    }

    .control {
      min-inline-size: 8rem;
      padding: var(--space-1) var(--space-2);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--surface);
      color: var(--text);
      font: inherit;
    }

    /* The song-order controls, set apart from the paper options above with a
       hairline — they answer a different question ("in what order", not "on what
       paper") and only appear for All songs. */
    .note {
      margin: var(--space-3) 0 0;
      color: var(--text-muted);
      font-size: var(--text-xs);
    }

    /* Why the greyed option is greyed, said next to it rather than hidden
       behind a hover. */
    .warn {
      margin: 0;
      color: var(--text-muted);
      font-size: var(--text-xs);
    }

    /* Rides inside the confirm button while the book renders. Sized to the
       button's text and tinted for its surface, since a primary button's face
       is the brand colour. */
    .spinner {
      inline-size: 15px;
      block-size: 15px;
      flex: none;
      border-radius: 50%;
      border: 2px solid color-mix(in srgb, currentColor 35%, transparent);
      border-block-start-color: currentColor;
      animation: songbook-spin 0.7s linear infinite;
    }

    @keyframes songbook-spin {
      to {
        transform: rotate(360deg);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .spinner {
        animation: none;
      }
    }
  `,
})
export class SongbookDownloadDialog {
  readonly name = input.required<string>();
  /** The options the dialog opens on — the device's last-used paper composed with
   * this book's own print structure (the presenter merges the two homes). */
  readonly initial = input<SongbookPdfChoice>(DEFAULT_SONGBOOK_CHOICE);

  /** The book is rendering — the confirm button becomes the progress. */
  readonly busy = input(false);
  /** How far it has got, or null during the layout pass before the count is
   * known. */
  readonly progress = input<DownloadProgress | null>(null);
  /** Whether the book fits in a link — `null` while it is still being measured.
   * The length is only knowable once the payload is built, so this waits for the
   * real number rather than counting songs. */
  readonly isShareLinkReady = input<boolean | null>(null);

  readonly chosen = output<SongbookPdfChoice>();
  readonly closed = output<void>();

  /** The confirm button's caption while it works: "Generating…" until there is
   * a count, then "Generating n of N…". */
  protected readonly generatingLabel = computed(() => {
    const progress = this.progress();
    return progress
      ? $localize`:@@songbookDownload.generating:Generating ${progress.done}:done: of ${progress.total}:total:…`
      : $localize`:@@songbookDownload.generatingStart:Generating…`;
  });

  // linkedSignal, not a plain signal seeded once: `initial` may arrive after
  // construction (the store hydrates async-ish), and the dialog should reflect
  // it. Local edits win until `initial` itself changes.
  protected readonly choice = linkedSignal(() => this.initial());

  /** The data file or the link is picked — nothing below the format row applies.
   * Neither is about paper: one is the book as a file, the other the same book as
   * a link, and every question underneath is about a printer. */
  protected readonly isData = computed(
    () =>
      this.choice().format === DATA_FORMAT ||
      this.choice().format === SHARE_LINK_FORMAT,
  );

  protected readonly title = computed(
    () => $localize`:@@songbookDownload.title:Download “${this.name()}:name:”`,
  );

  protected patch(change: Partial<SongbookPdfChoice>): void {
    this.choice.update((current) => ({ ...current, ...change }));
  }

  /** The shapes a form event arrives in — narrowed at the one place they enter
   * typed code, which is exactly where a `<select>`'s string stops being one. */
  protected value(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  protected format(event: Event): SongbookChoiceFormat {
    return this.value(event) as SongbookChoiceFormat;
  }

  protected size(event: Event): PageSizeChoice {
    return this.value(event) as PageSizeChoice;
  }

  protected number(event: Event): number {
    const raw = Number((event.target as HTMLInputElement).value);
    // A margin is a length, and a negative one is not a smaller page — it is a
    // song printed off the edge of the paper.
    return Number.isFinite(raw)
      ? Math.max(raw, 0)
      : DEFAULT_SONGBOOK_CHOICE.marginMm;
  }

  protected readonly formatLabel = $localize`:@@songbookDownload.format:Format`;
  protected readonly pdfLabel = $localize`:@@songbookDownload.format.pdf:PDF`;
  protected readonly zipPngLabel = $localize`:@@songbookDownload.format.zipPng:ZIP of images`;
  protected readonly dataLabel = $localize`:@@songbookDownload.format.data:Achordeon file`;
  protected readonly pageSizeLabel = $localize`:@@songbookDownload.pageSize:Page size`;
  protected readonly orientationLabel = $localize`:@@songbookDownload.orientation:Orientation`;
  protected readonly portraitLabel = $localize`:@@songbookDownload.portrait:Portrait`;
  protected readonly landscapeLabel = $localize`:@@songbookDownload.landscape:Landscape`;
  protected readonly marginLabel = $localize`:@@songbookDownload.margin:Margin (mm)`;
  protected readonly fitNote = $localize`:@@songbookDownload.fitNote:Each song keeps its own shape and is scaled to fit the page.`;
  /** The ZIP names its files in book order, so a viewer or a printer keeps the
   * songs in the sequence you arranged them. */
  protected readonly zipNote = $localize`:@@songbookDownload.zipNote:One image per song, numbered in order, plus a contents page.`;
  /** The book **and its songs** — `ExportService` adds them, because a book of
   * references imports as a book of nothing on a machine that lacks them. */
  protected readonly dataNote = $localize`:@@songbookDownload.dataNote:The songbook and its songs as data, to import here or on another device.`;
  protected readonly shareLinkLabel = $localize`:@@songbookDownload.format.link:Link`;
  protected readonly linkNote = $localize`:@@songbookDownload.linkNote:A link that opens this songbook in Achordeon, copied ready to paste. The songs travel inside the link — nothing is uploaded.`;
  /** Names the *selection*, so nobody reads it as a permanent restriction, and
   * says size rather than song count — the limit is length, and one long song can
   * trip it where three short ones would not. */
  protected readonly linkTooBigText = $localize`:@@songbookDownload.linkTooBig:This selection is too big to share as a link. Download it instead.`;
  protected readonly note = computed(() =>
    this.choice().format === SHARE_LINK_FORMAT
      ? this.linkNote
      : this.isData()
        ? this.dataNote
        : this.choice().format === 'pdf'
          ? this.fitNote
          : this.zipNote,
  );
  protected readonly cancelLabel = $localize`:@@songbookDownload.cancel:Cancel`;
  protected readonly downloadLabel = computed(() =>
    this.choice().format === SHARE_LINK_FORMAT
      ? $localize`:@@songbookDownload.copyLink:Copy link`
      : $localize`:@@songbookDownload.confirm:Download`,
  );
}
