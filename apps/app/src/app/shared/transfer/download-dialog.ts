// Download dialog — Epic 7 ▸ subtasks 4–5
// Spec: PRD-INFRASTRUCTURE.md §8 (single = PNG or PDF; several = ZIP of images,
// ZIP of PDFs, or one multi-page PDF)
//
// Controlled: how many songs in, a format out. It holds no state at all — each
// format is a button that downloads — injects nothing, and knows no store.

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { Button, Dialog, Icon } from '../../primitives';
import type { DownloadFormat, DownloadProgress } from './transfer-model';

interface FormatOption {
  readonly value: DownloadFormat;
  readonly label: string;
  readonly hint: string;
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
    .options {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    /* Two columns: the text takes the room (flex: 1), the button sits at the
       end. Top-aligned, so a two-line hint does not shove the button down. */
    .option {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3);
    }

    .text {
      flex: 1;
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

    .go {
      flex: none;
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

  readonly chosen = output<DownloadFormat>();
  readonly closed = output<void>();

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
            hint: $localize`:@@download.png.hint:A picture to share. It carries the song inside it, so importing it back rebuilds the song.`,
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

  protected readonly cancelLabel = $localize`:@@download.cancel:Cancel`;
  protected readonly downloadLabel = $localize`:@@download.go:Download`;

  /** The button repeats "Download" for every row, so its accessible name says
   * which format — the visible word alone would read "Download" five times. */
  protected downloadOptionLabel(option: FormatOption): string {
    return $localize`:@@download.optionLabel:Download as ${option.label}:format:`;
  }
}
