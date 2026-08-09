// Download dialog — Epic 7 ▸ subtasks 4–5
// Spec: PRD-INFRASTRUCTURE.md §8 (single = PNG or PDF; several = ZIP of images,
// ZIP of PDFs, or one multi-page PDF)
//
// Controlled: how many songs in, a format out. It holds no state at all — each
// format is a button that downloads — injects nothing, and knows no store.
//
// **This is where Export lives now.** It used to be a second icon in the bar,
// beside this dialog's own button, which asked the user to know the difference
// between "download" and "export" *before* being shown it. So the two merged:
// one button, one dialog, and the Achordeon file is the last row in the list —
// the far end of a run that goes from most-for-a-player to most-for-a-machine.
// Every row still ends in a file on disk, which is what makes "Download" an
// honest title for all of them; the acts underneath stay two (see
// `DownloadChoice`).

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { Button, Dialog, Icon } from '../../primitives';
import {
  DATA_FORMAT,
  SHARE_LINK_FORMAT,
  type DownloadChoice,
  type DownloadFormat,
  type DownloadProgress,
} from './transfer-model';

/** A row: what the file is, and what it is for. */
interface Option {
  readonly label: string;
  readonly hint: string;
}

interface FormatOption extends Option {
  readonly value: DownloadFormat;
}

@Component({
  selector: 'app-download-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Dialog, Icon],
  template: `
    <app-dialog
      [title]="title()"
      data-testid="download-dialog"
      (closed)="closed.emit()"
    >
      <!-- Once a format is picked the dialog stays open and turns into the
           progress: a spinner and, for several songs, an "n of N" count that
           advances as each song is rendered (the loop yields so it can). The
           formats are gone — the choice is made and unmaking it is not on
           offer mid-render. -->
      @if (busy()) {
        <div class="generating" data-testid="download-generating">
          <span class="spinner" aria-hidden="true"></span>
          <span>{{ generatingLabel() }}</span>
        </div>
      } @else {
        <!-- Each format is a row: **its description on the left, its Download
             button on the right.** The formats are alternatives, not settings,
             so there is nothing to confirm — the button that downloads sits
             beside the text that explains it, and the choice is one click. -->
        <div class="options">
          @for (option of options(); track option.value) {
            <div class="option">
              <div class="text">
                <span class="name">{{ option.label }}</span>
                <span class="hint">{{ option.hint }}</span>
              </div>
              <button
                appButton
                type="button"
                variant="primary"
                class="go"
                [attr.aria-label]="downloadOptionLabel(option)"
                [attr.data-testid]="'download-' + option.value"
                (click)="chosen.emit(option.value)"
              >
                <app-icon name="download" />
                {{ downloadLabel }}
              </button>
            </div>
          }

          <!-- The Achordeon file, behind a hairline rather than a heading: the
               dialog is three rows tall and a section title for one of them
               costs more room than it explains. The rule says "what follows is
               a different kind of thing", and the hint says which kind. -->
          <div class="option is-data">
            <div class="text">
              <span class="name">{{ dataOption().label }}</span>
              <span class="hint">{{ dataOption().hint }}</span>
            </div>
            <button
              appButton
              type="button"
              variant="primary"
              class="go"
              [attr.aria-label]="downloadOptionLabel(dataOption())"
              data-testid="download-json"
              (click)="chosen.emit(DATA_FORMAT)"
            >
              <app-icon name="download" />
              {{ downloadLabel }}
            </button>
          </div>

          <!-- The same songs with nowhere to put the file: a link, on the
               clipboard. Not an export — nothing lands on disk — but it answers
               the same question, so it is asked here. -->
          <div class="option">
            <div class="text">
              <span class="name">{{ shareLinkLabel }}</span>
              <span class="hint">{{ shareLinkHint() }}</span>
            </div>
            <button
              appButton
              type="button"
              variant="primary"
              class="go"
              [disabled]="!isShareable()"
              [attr.aria-label]="shareLinkAriaLabel()"
              data-testid="download-share-link"
              (click)="copyLink()"
            >
              <app-icon name="transferOut" />
              <!-- "Copied" is shorter than "Copy link", and this button is the
                   one that makes the column as wide as it is — so the longer
                   word stays in the layout, hidden, and the column keeps still
                   while the label flips. -->
              <span class="swap">
                <span class="ghost" aria-hidden="true">{{ copyLabel }}</span>
                <span>{{ isCopied() ? copiedLabel : copyLabel }}</span>
              </span>
            </button>
          </div>
        </div>
      }

      <!-- Cancel stays where every dialog keeps it — disabled while rendering,
           because there is nothing to cancel back to: the file is on its way. -->
      <button
        dialog-actions
        appButton
        type="button"
        variant="secondary"
        [disabled]="busy()"
        data-testid="download-cancel"
        (click)="closed.emit()"
      >
        {{ cancelLabel }}
      </button>
    </app-dialog>
  `,
  styles: `
    /* Two columns for the whole list, not per row: the text takes the room, the
       buttons share one column and are therefore all as wide as the widest of
       them. Each row opts into the parent's columns with subgrid — a row that
       measured itself would give "Copy link" a wider button than "Download",
       which reads as five different controls rather than one column of them. */
    .options {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: var(--space-3);
    }

    .option {
      display: grid;
      grid-column: 1 / -1;
      grid-template-columns: subgrid;
      /* Top-aligned, so a two-line hint does not shove the button down. */
      align-items: start;
    }

    /* The data file, set apart from the renders above it — the same hairline
       the songbook dialog draws above its song-order group, and for the same
       reason: what follows answers a different question. */
    .option.is-data {
      margin-block-start: var(--space-1);
      padding-block-start: var(--space-3);
      border-block-start: 1px solid var(--border);
    }

    .text {
      min-inline-size: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .name {
      font-weight: 500;
    }

    .hint {
      color: var(--text-muted);
      font-size: var(--text-xs);
      white-space: normal;
    }

    /* Stretched to the shared column — the button is what the column is for. */
    .go {
      inline-size: 100%;
    }

    /* Both labels in one cell, so the button's width is the longer one's. */
    .swap {
      display: grid;
    }

    .swap > * {
      grid-area: 1 / 1;
      justify-self: center;
    }

    .swap > .ghost {
      visibility: hidden;
    }

    /* The progress that replaces the format list once one is picked. */
    .generating {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-2) 0;
      font-size: var(--text-sm);
      color: var(--text);
    }

    .spinner {
      inline-size: 18px;
      block-size: 18px;
      flex: none;
      border-radius: 50%;
      border: 2px solid var(--border-strong);
      border-block-start-color: var(--brand);
      animation: download-spin 0.7s linear infinite;
    }

    @keyframes download-spin {
      to {
        transform: rotate(360deg);
      }
    }

    /* The count moves by real work, not by animation, so it stays put for a
       reader who has asked motion off — only the spinner's spin is decorative. */
    @media (prefers-reduced-motion: reduce) {
      .spinner {
        animation: none;
      }
    }
  `,
})
export class DownloadDialog {
  /** How many songs are about to be downloaded — which is what decides whether
   * "one PDF" means a page or a book. */
  readonly count = input.required<number>();

  /** Rendering is in flight — show the progress instead of the formats. */
  readonly busy = input(false);
  /** How far it has got, or null until the first song is rendered (during the
   * layout pass the total is not yet known, so the spinner stands alone). */
  readonly progress = input<DownloadProgress | null>(null);

  /**
   * Whether the selection fits in a link.
   *
   * `null` while it is still being measured — the length is only knowable once
   * the payload is actually built, so the dialog waits for the real number rather
   * than counting songs. The row is offered either way; it is the button that
   * waits.
   */
  readonly isShareLinkReady = input<boolean | null>(null);

  readonly chosen = output<DownloadChoice>();
  readonly closed = output<void>();

  /** Exposed for the template's one non-`@for` row. */
  protected readonly DATA_FORMAT = DATA_FORMAT;

  /** Enabled once the link is built and short enough to survive being pasted. */
  protected readonly isShareable = computed(
    () => this.isShareLinkReady() === true,
  );

  /**
   * Briefly true after a copy, so the button can say "Copied" — the same
   * two-second flip the Audience link uses, and the only feedback a clipboard
   * write ever gets.
   */
  protected readonly isCopied = signal(false);
  private copiedResetTimer: ReturnType<typeof setTimeout> | null = null;

  protected copyLink(): void {
    this.chosen.emit(SHARE_LINK_FORMAT);
    this.isCopied.set(true);
    if (this.copiedResetTimer !== null) clearTimeout(this.copiedResetTimer);
    this.copiedResetTimer = setTimeout(() => this.isCopied.set(false), 2000);
  }

  /**
   * **Disabled, never hidden, when the selection will not fit.** A greyed row
   * that explains itself teaches the limit; a row that vanishes reads as a
   * missing feature. It names the *selection*, so nobody reads it as a permanent
   * restriction, and it says size rather than song count — the limit is length,
   * and one long song can trip it where three short ones would not.
   */
  protected readonly shareLinkHint = computed(() => {
    if (this.isShareLinkReady() === false)
      return $localize`:@@download.link.tooBig:This selection is too big to share as a link. Download it instead.`;
    return this.count() === 1
      ? $localize`:@@download.link.hint:A link that opens this song in Achordeon, copied ready to paste. The song travels inside the link — nothing is uploaded.`
      : $localize`:@@download.link.hintMany:A link that opens these songs in Achordeon, copied ready to paste. They travel inside the link — nothing is uploaded.`;
  });

  protected readonly shareLinkAriaLabel = computed(
    () => `${this.copyLabel}: ${this.shareLinkLabel}`,
  );

  /** The spinner's caption: a bare "Generating…" until there is a count, then
   * "Generating n of N…" as each song lands. */
  protected readonly generatingLabel = computed(() => {
    const progress = this.progress();
    return progress
      ? $localize`:@@download.generating:Generating ${progress.done}:done: of ${progress.total}:total:…`
      : $localize`:@@download.generatingStart:Generating…`;
  });

  protected readonly title = computed(() =>
    this.count() === 1
      ? $localize`:@@download.title:Download this song`
      : $localize`:@@download.titleMany:Download ${this.count()}:count: songs`,
  );

  /**
   * One song and several songs are different questions, so they get different
   * answers rather than one list with two of its entries greyed out.
   */
  protected readonly options = computed<FormatOption[]>(() =>
    this.count() === 1
      ? [
          {
            value: 'pdf',
            label: $localize`:@@download.pdf:PDF`,
            hint: $localize`:@@download.pdf.hint:A page you can print. The text stays text, so it can be searched and selected.`,
          },
          {
            value: 'png',
            label: $localize`:@@download.png:Image (PNG)`,
            hint: $localize`:@@download.png.hint:A picture to share. The song rides along inside it, so this one image imports back.`,
          },
        ]
      : [
          {
            value: 'pdf',
            label: $localize`:@@download.onePdf:One PDF`,
            hint: $localize`:@@download.onePdf.hint:Every song, one after another, in a single document.`,
          },
          {
            value: 'zip-pdf',
            label: $localize`:@@download.zipPdf:ZIP of PDFs`,
            hint: $localize`:@@download.zipPdf.hint:One document per song, packed together.`,
          },
          {
            value: 'zip-png',
            label: $localize`:@@download.zipPng:ZIP of images`,
            hint: $localize`:@@download.zipPng.hint:One picture per song, packed together.`,
          },
        ],
  );

  /**
   * The Achordeon file — the row the old Export button became.
   *
   * It says what the file *is* ("the song itself") against what the rows above
   * it are (a page, a picture), because that is the distinction the merge has to
   * carry now that one dialog offers both. The PNG round-trips too, so the hint
   * cannot lean on "importable" alone to tell them apart: an image is a picture
   * that happens to carry its song, and this is the song with no picture at all
   * — which is why it is also the only one that keeps several songs exact.
   */
  protected readonly dataOption = computed<Option>(() => ({
    label: $localize`:@@download.data:Achordeon file`,
    hint:
      this.count() === 1
        ? $localize`:@@download.data.hint:The song itself — words, chords and settings. Import it here or on another device to get the song back, not a picture of it.`
        : $localize`:@@download.data.hintMany:The songs themselves — words, chords and settings, in one file. Import it here or on another device to get them all back.`,
  }));

  protected readonly cancelLabel = $localize`:@@download.cancel:Cancel`;
  protected readonly downloadLabel = $localize`:@@download.go:Download`;
  protected readonly shareLinkLabel = $localize`:@@download.link:Link`;
  protected readonly copyLabel = $localize`:@@download.link.copy:Copy link`;
  protected readonly copiedLabel = $localize`:@@download.link.copied:Copied`;

  /** The button repeats "Download" for every row, so its accessible name says
   * which format — the visible word alone would read "Download" five times. */
  protected downloadOptionLabel(option: Option): string {
    return $localize`:@@download.optionLabel:Download as ${option.label}:format:`;
  }
}
