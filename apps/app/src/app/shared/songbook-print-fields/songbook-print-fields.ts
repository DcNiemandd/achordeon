// Book-bound print fields — the shared control
// Spec: PRD-INFRASTRUCTURE.md §8; CONTEXT.md §Songbook
//
// The book's own print STRUCTURE — title page (and its layout), a contents page
// (and which side its numbers sit), page numbers (and where) — as one controlled
// panel. It is mounted twice: in the songbook settings dialog, where you shape the
// book, and in the download dialog, where you print it. One control, so the two
// can never drift; the settings you set in one are the settings the other shows,
// because both read and write the same `SongbookPrint` on the record.
//
// The download dialog hides the paper-only questions for a ZIP (it has no page
// numbers, no single title sheet) — so visibility is the caller's to say, through
// the `show*` inputs. The settings dialog shows everything.
//
// Labels reuse the `songbookDownload.*` message ids on purpose: this IS those
// controls, lifted out, so the translation is authored once and nothing new lands
// in the catalog.

import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import type {
  PageNumberPlace,
  SongbookPrint,
  SummaryNumberPlace,
  TitlePageVariant,
} from '@achordeon/shared/domain';

/**
 * A title-page layout the control offers.
 *
 * Every one of them draws (`layoutTitlePageCore`), so there is no "(soon)" and
 * no disabled row left: the list used to carry three stubs, and a choice that
 * cannot be chosen is worse than one that is not offered. They are ordered by
 * how far each departs from the shipped page rather than alphabetically — the
 * quiet ones first, the ones that put a shape on the paper last, so the eye
 * scanning down the list is walking a scale.
 */
interface VariantOption {
  readonly value: TitlePageVariant;
  readonly label: string;
}

@Component({
  selector: 'app-songbook-print-fields',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (showTitlePage()) {
      <label class="row is-toggle">
        <input
          type="checkbox"
          [checked]="print().hasTitlePage"
          data-testid="pdf-title-page"
          (change)="patch({ hasTitlePage: checked($event) })"
        />
        <span class="name">{{ titlePageLabel }}</span>
      </label>

      @if (print().hasTitlePage) {
        <label class="row">
          <span class="name">{{ variantLabel }}</span>
          <!-- The selection is on the OPTIONS, not on the select, and that is
               the fix for a real bug rather than a style preference: this is the
               one picker here whose options come from a repeater, and a value
               binding on the select is applied in the same update pass that
               later creates those options. It therefore ran against an empty
               select, which resets the value to the empty string — so the
               control always opened on the first entry however the book was set.
               It went unseen while every option but the first was disabled. -->
          <select
            class="control"
            data-testid="pdf-title-variant"
            (change)="patch({ titlePageVariant: variant($event) })"
          >
            @for (option of variants; track option.value) {
              <option
                [value]="option.value"
                [selected]="option.value === print().titlePageVariant"
              >
                {{ option.label }}
              </option>
            }
          </select>
        </label>
      }
    }

    @if (showPageNumbers()) {
      <label class="row is-toggle">
        <input
          type="checkbox"
          [checked]="print().hasPageNumbers"
          data-testid="pdf-page-numbers"
          (change)="patch({ hasPageNumbers: checked($event) })"
        />
        <span class="name">{{ pageNumbersLabel }}</span>
      </label>

      @if (print().hasPageNumbers) {
        <label class="row">
          <span class="name">{{ positionLabel }}</span>
          <select
            class="control"
            [value]="print().pageNumberPosition"
            data-testid="pdf-number-position"
            (change)="patch({ pageNumberPosition: place($event) })"
          >
            <option value="bottom-center">{{ bottomCenterLabel }}</option>
            <option value="bottom-left">{{ bottomLeftLabel }}</option>
            <option value="bottom-right">{{ bottomRightLabel }}</option>
            <option value="top-center">{{ topCenterLabel }}</option>
            <option value="top-left">{{ topLeftLabel }}</option>
            <option value="top-right">{{ topRightLabel }}</option>
            <option value="before-title">{{ beforeSongTitleLabel }}</option>
          </select>
        </label>
      }
    }

    @if (showSummary()) {
      <label class="row is-toggle">
        <input
          type="checkbox"
          [checked]="print().hasSummary"
          data-testid="pdf-summary"
          (change)="patch({ hasSummary: checked($event) })"
        />
        <span class="name">{{ summaryLabel }}</span>
      </label>

      @if (print().hasSummary && showSummaryNumber()) {
        <label class="row">
          <span class="name">{{ summaryNumberLabel }}</span>
          <select
            class="control"
            [value]="print().summaryNumberPlace"
            data-testid="pdf-summary-number"
            (change)="patch({ summaryNumberPlace: summaryPlace($event) })"
          >
            <option value="after">{{ afterTitleLabel }}</option>
            <option value="before">{{ beforeTitleLabel }}</option>
          </select>
        </label>
      }
    }
  `,
  styles: `
    :host {
      display: contents;
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
  `,
})
export class SongbookPrintFields {
  readonly print = input.required<SongbookPrint>();

  /** What to offer — the download dialog hides the paper-only questions for a
   * ZIP; the settings dialog shows the lot. */
  readonly showTitlePage = input(true);
  readonly showPageNumbers = input(true);
  readonly showSummary = input(true);
  readonly showSummaryNumber = input(true);

  readonly changed = output<SongbookPrint>();

  protected patch(change: Partial<SongbookPrint>): void {
    this.changed.emit({ ...this.print(), ...change });
  }

  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  private value(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  protected variant(event: Event): TitlePageVariant {
    return this.value(event) as TitlePageVariant;
  }

  protected place(event: Event): PageNumberPlace {
    return this.value(event) as PageNumberPlace;
  }

  protected summaryPlace(event: Event): SummaryNumberPlace {
    return this.value(event) as SummaryNumberPlace;
  }

  // Reused ids — this is the download dialog's own control, lifted out.
  protected readonly titlePageLabel = $localize`:@@songbookDownload.titlePage:Title page`;
  protected readonly variantLabel = $localize`:@@songbookDownload.variant:Title page style`;
  protected readonly summaryLabel = $localize`:@@songbookDownload.summary:Summary (contents)`;
  protected readonly summaryNumberLabel = $localize`:@@songbookDownload.summaryNumber:Contents numbering`;
  protected readonly afterTitleLabel = $localize`:@@songbookDownload.afterTitle:After the title`;
  protected readonly beforeTitleLabel = $localize`:@@songbookDownload.beforeTitle:Before the title`;
  protected readonly pageNumbersLabel = $localize`:@@songbookDownload.pageNumbers:Page numbers`;
  protected readonly positionLabel = $localize`:@@songbookDownload.position:Number position`;
  protected readonly bottomCenterLabel = $localize`:@@songbookDownload.bottomCenter:Bottom, centred`;
  protected readonly bottomLeftLabel = $localize`:@@songbookDownload.bottomLeft:Bottom left`;
  protected readonly bottomRightLabel = $localize`:@@songbookDownload.bottomRight:Bottom right`;
  protected readonly topCenterLabel = $localize`:@@songbookDownload.topCenter:Top, centred`;
  protected readonly topLeftLabel = $localize`:@@songbookDownload.topLeft:Top left`;
  protected readonly topRightLabel = $localize`:@@songbookDownload.topRight:Top right`;
  protected readonly beforeSongTitleLabel = $localize`:@@songbookDownload.beforeSongTitle:Before the song title`;

  protected readonly variants: readonly VariantOption[] = [
    {
      value: 'classic',
      label: $localize`:@@songbookDownload.variant.classic:Classic`,
    },
    {
      value: 'centered',
      label: $localize`:@@songbookDownload.variant.centered:Centered`,
    },
    {
      value: 'plate',
      label: $localize`:@@songbookDownload.variant.plate:Plate`,
    },
    {
      value: 'minimal',
      label: $localize`:@@songbookDownload.variant.minimal:Minimal`,
    },
    {
      value: 'poster',
      label: $localize`:@@songbookDownload.variant.poster:Poster`,
    },
    {
      value: 'stacked',
      label: $localize`:@@songbookDownload.variant.stacked:Stacked`,
    },
    {
      value: 'spine',
      label: $localize`:@@songbookDownload.variant.spine:Spine`,
    },
    {
      value: 'baseline',
      label: $localize`:@@songbookDownload.variant.baseline:Baseline`,
    },
    {
      value: 'corner',
      label: $localize`:@@songbookDownload.variant.corner:Corner`,
    },
    {
      value: 'column',
      label: $localize`:@@songbookDownload.variant.column:Column`,
    },
    {
      value: 'rule',
      label: $localize`:@@songbookDownload.variant.rule:Rule`,
    },
    {
      value: 'framed',
      label: $localize`:@@songbookDownload.variant.framed:Framed`,
    },
    {
      value: 'banner',
      label: $localize`:@@songbookDownload.variant.banner:Banner`,
    },
    {
      value: 'ticket',
      label: $localize`:@@songbookDownload.variant.ticket:Ticket`,
    },
    {
      value: 'marquee',
      label: $localize`:@@songbookDownload.variant.marquee:Marquee`,
    },
    {
      value: 'gate',
      label: $localize`:@@songbookDownload.variant.gate:Gate`,
    },
    {
      value: 'bookplate',
      label: $localize`:@@songbookDownload.variant.bookplate:Bookplate`,
    },
    {
      value: 'tag',
      label: $localize`:@@songbookDownload.variant.tag:Tag`,
    },
    {
      value: 'half',
      label: $localize`:@@songbookDownload.variant.half:Half`,
    },
    {
      value: 'bookmark',
      label: $localize`:@@songbookDownload.variant.bookmark:Bookmark`,
    },
    {
      value: 'footer',
      label: $localize`:@@songbookDownload.variant.footer:Footer`,
    },
  ];
}
