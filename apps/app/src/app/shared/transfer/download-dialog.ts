// Download dialog — Epic 7 ▸ subtasks 4–5
// Spec: PRD-INFRASTRUCTURE.md §8 (single = PNG or PDF; several = ZIP of images,
// ZIP of PDFs, or one multi-page PDF)
//
// Controlled: how many songs in, a format out. It holds no state but the radio
// the user is pointing at, injects nothing, and knows no store.

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { Button, Dialog } from '../../primitives';
import type { DownloadFormat } from './transfer-model';

interface FormatOption {
  readonly value: DownloadFormat;
  readonly label: string;
  readonly hint: string;
}

@Component({
  selector: 'app-download-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Dialog],
  template: `
    <app-dialog
      [title]="title()"
      data-testid="download-dialog"
      (closed)="closed.emit()"
    >
      <!-- Radios, not a dropdown: there are at most three, each needs a line of
           explanation, and the difference between a ZIP of PDFs and one PDF is
           the whole decision being made here. -->
      <fieldset class="options">
        <legend class="sr-only">{{ title() }}</legend>
        @for (option of options(); track option.value) {
          <label class="option">
            <input
              type="radio"
              name="download-format"
              [value]="option.value"
              [checked]="format() === option.value"
              [attr.data-testid]="'download-' + option.value"
              (change)="format.set(option.value)"
            />
            <span class="label">
              <span class="name">{{ option.label }}</span>
              <span class="hint">{{ option.hint }}</span>
            </span>
          </label>
        }
      </fieldset>

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
      <button
        dialog-actions
        appButton
        type="button"
        variant="primary"
        data-testid="download-confirm"
        (click)="chosen.emit(format())"
      >
        {{ downloadLabel }}
      </button>
    </app-dialog>
  `,
  styles: `
    .options {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin: 0;
      padding: 0;
      border: 0;
    }

    .option {
      display: flex;
      align-items: flex-start;
      gap: var(--space-2);
      cursor: pointer;
    }

    .label {
      display: flex;
      flex-direction: column;
    }

    .hint {
      color: var(--text-muted);
      font-size: var(--text-xs);
    }

    .sr-only {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
  `,
})
export class DownloadDialog {
  /** How many songs are about to be downloaded — which is what decides whether
   * "one PDF" means a page or a book. */
  readonly count = input.required<number>();

  readonly chosen = output<DownloadFormat>();
  readonly closed = output<void>();

  protected readonly format = signal<DownloadFormat>('pdf');

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
  protected readonly downloadLabel = $localize`:@@download.confirm:Download`;
}
