// Songbook PDF dialog — Epic 7 ▸ subtask 6
// Spec: PRD-INFRASTRUCTURE.md §8 (title page / summary / page-number toggles +
// position, page size, songs keep their aspect ratio scaled to fit)
//
// A songbook is always a PDF, so this dialog asks about the *paper* rather than
// the format. Controlled, like every other panel in `app/shared`: values in,
// one choice out.

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { Button, Dialog } from '../../primitives';
import type {
  PageNumberPlace,
  PageSizeChoice,
  SongbookPdfChoice,
} from './transfer-model';

const DEFAULTS: SongbookPdfChoice = {
  pageSize: 'A4',
  isLandscape: false,
  marginMm: 10,
  hasTitlePage: true,
  hasSummary: false,
  hasPageNumbers: true,
  pageNumberPosition: 'bottom-center',
};

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

        <label class="row is-toggle">
          <input
            type="checkbox"
            [checked]="choice().hasTitlePage"
            data-testid="pdf-title-page"
            (change)="patch({ hasTitlePage: checked($event) })"
          />
          <span class="name">{{ titlePageLabel }}</span>
        </label>

        <label class="row is-toggle">
          <input
            type="checkbox"
            [checked]="choice().hasSummary"
            data-testid="pdf-summary"
            (change)="patch({ hasSummary: checked($event) })"
          />
          <span class="name">{{ summaryLabel }}</span>
        </label>

        <label class="row is-toggle">
          <input
            type="checkbox"
            [checked]="choice().hasPageNumbers"
            data-testid="pdf-page-numbers"
            (change)="patch({ hasPageNumbers: checked($event) })"
          />
          <span class="name">{{ pageNumbersLabel }}</span>
        </label>

        <!-- The position only exists while the numbers do: an enabled control
             for something that is switched off is a question with no answer. -->
        @if (choice().hasPageNumbers) {
          <label class="row">
            <span class="name">{{ positionLabel }}</span>
            <select
              class="control"
              [value]="choice().pageNumberPosition"
              data-testid="pdf-number-position"
              (change)="patch({ pageNumberPosition: place($event) })"
            >
              <option value="bottom-center">{{ bottomCenterLabel }}</option>
              <option value="bottom-right">{{ bottomRightLabel }}</option>
              <option value="top-center">{{ topCenterLabel }}</option>
              <option value="top-right">{{ topRightLabel }}</option>
            </select>
          </label>
        }
      </div>

      <p class="note">{{ fitNote }}</p>

      <button
        dialog-actions
        appButton
        type="button"
        variant="secondary"
        data-testid="songbook-download-cancel"
        (click)="closed.emit()"
      >
        {{ cancelLabel }}
      </button>
      <button
        dialog-actions
        appButton
        type="button"
        variant="primary"
        data-testid="songbook-download-confirm"
        (click)="chosen.emit(choice())"
      >
        {{ downloadLabel }}
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

    .note {
      margin: var(--space-3) 0 0;
      color: var(--text-muted);
      font-size: var(--text-xs);
    }
  `,
})
export class SongbookDownloadDialog {
  readonly name = input.required<string>();

  readonly chosen = output<SongbookPdfChoice>();
  readonly closed = output<void>();

  protected readonly choice = signal<SongbookPdfChoice>(DEFAULTS);

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

  protected size(event: Event): PageSizeChoice {
    return this.value(event) as PageSizeChoice;
  }

  protected place(event: Event): PageNumberPlace {
    return this.value(event) as PageNumberPlace;
  }

  protected number(event: Event): number {
    const raw = Number((event.target as HTMLInputElement).value);
    // A margin is a length, and a negative one is not a smaller page — it is a
    // song printed off the edge of the paper.
    return Number.isFinite(raw) ? Math.max(raw, 0) : DEFAULTS.marginMm;
  }

  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  protected readonly pageSizeLabel = $localize`:@@songbookDownload.pageSize:Page size`;
  protected readonly orientationLabel = $localize`:@@songbookDownload.orientation:Orientation`;
  protected readonly portraitLabel = $localize`:@@songbookDownload.portrait:Portrait`;
  protected readonly landscapeLabel = $localize`:@@songbookDownload.landscape:Landscape`;
  protected readonly marginLabel = $localize`:@@songbookDownload.margin:Margin (mm)`;
  protected readonly titlePageLabel = $localize`:@@songbookDownload.titlePage:Title page`;
  protected readonly summaryLabel = $localize`:@@songbookDownload.summary:Summary (contents)`;
  protected readonly pageNumbersLabel = $localize`:@@songbookDownload.pageNumbers:Page numbers`;
  protected readonly positionLabel = $localize`:@@songbookDownload.position:Number position`;
  protected readonly bottomCenterLabel = $localize`:@@songbookDownload.bottomCenter:Bottom, centred`;
  protected readonly bottomRightLabel = $localize`:@@songbookDownload.bottomRight:Bottom right`;
  protected readonly topCenterLabel = $localize`:@@songbookDownload.topCenter:Top, centred`;
  protected readonly topRightLabel = $localize`:@@songbookDownload.topRight:Top right`;
  protected readonly fitNote = $localize`:@@songbookDownload.fitNote:Each song keeps its own shape and is scaled to fit the page.`;
  protected readonly cancelLabel = $localize`:@@songbookDownload.cancel:Cancel`;
  protected readonly downloadLabel = $localize`:@@songbookDownload.confirm:Download`;
}
