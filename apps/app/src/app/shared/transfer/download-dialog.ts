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
import type { DownloadFormat } from './transfer-model';

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
      <!-- **Each option is its own button, and pressing it downloads.** A radio
           list plus a Download button asks for two clicks to express one
           decision, and puts the answer ("PDF") in one place and the verb
           ("Download") in another. There is nothing to confirm here: the formats
           are alternatives, not settings. -->
      <div class="options">
        @for (option of options(); track option.value) {
          <button
            appButton
            type="button"
            class="option"
            [attr.data-testid]="'download-' + option.value"
            (click)="chosen.emit(option.value)"
          >
            <app-icon name="download" class="mark" />
            <span class="label">
              <span class="name">{{ option.label }}</span>
              <span class="hint">{{ option.hint }}</span>
            </span>
          </button>
        }
      </div>

      <!-- Cancel stays where every dialog keeps it: nothing has happened yet,
           and leaving is not one of the formats. -->
      <button
        dialog-actions
        appButton
        type="button"
        variant="secondary"
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
      gap: var(--space-2);
    }

    /* Full width and left-aligned: these are choices in a list, not a row of
       equal actions, and the hint under each has to be readable as prose. */
    .option {
      display: flex;
      align-items: flex-start;
      gap: var(--space-2);
      inline-size: 100%;
      padding: var(--space-2);
      text-align: start;
    }

    .mark {
      --icon-size: 18px;
      flex: none;
      margin-block-start: 2px;
      color: var(--brand);
    }

    .label {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .hint {
      color: var(--text-muted);
      font-size: var(--text-xs);
      font-weight: 400;
      white-space: normal;
    }
  `,
})
export class DownloadDialog {
  /** How many songs are about to be downloaded — which is what decides whether
   * "one PDF" means a page or a book. */
  readonly count = input.required<number>();

  readonly chosen = output<DownloadFormat>();
  readonly closed = output<void>();

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
}
