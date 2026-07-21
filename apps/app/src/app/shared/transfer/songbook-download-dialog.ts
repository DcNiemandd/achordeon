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
  linkedSignal,
  output,
} from '@angular/core';
import { Button, Dialog } from '../../primitives';
import type {
  PageNumberPlace,
  PageSizeChoice,
  SongbookPdfChoice,
  SongOrder,
  SongOrderAxis,
  SongOrderDir,
  TitlePageVariant,
} from './transfer-model';
import { DEFAULT_PRINT_OPTIONS } from './print-options-store';

/** The title-page layouts the dialog offers. Only `classic` renders today; the
 * rest are declared so the choice is real and land later — marked below so the
 * user is not misled into thinking a stub already works. */
interface VariantOption {
  readonly value: TitlePageVariant;
  readonly label: string;
  readonly isReady: boolean;
}

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

        <!-- The layout only matters while there is a title page. A stub for now:
             only "Classic" renders, the rest say so and land later. -->
        @if (choice().hasTitlePage) {
          <label class="row">
            <span class="name">{{ variantLabel }}</span>
            <select
              class="control"
              [value]="choice().titlePageVariant"
              data-testid="pdf-title-variant"
              (change)="patch({ titlePageVariant: variant($event) })"
            >
              @for (option of variants; track option.value) {
                <option [value]="option.value" [disabled]="!option.isReady">
                  {{ option.label }}
                </option>
              }
            </select>
          </label>
        }

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
              <option value="bottom-left">{{ bottomLeftLabel }}</option>
              <option value="bottom-right">{{ bottomRightLabel }}</option>
              <option value="top-center">{{ topCenterLabel }}</option>
              <option value="top-left">{{ topLeftLabel }}</option>
              <option value="top-right">{{ topRightLabel }}</option>
            </select>
          </label>
        }
        <!-- Song order — **All songs only**. A real songbook's order IS its
             content; you arranged it, so it prints as arranged. All songs has no
             order of its own, so this is where one is chosen. -->
        @if (showSongOrder()) {
          <div class="group" role="group" [attr.aria-label]="orderLabel">
            <label class="row">
              <span class="name">{{ orderLabel }}</span>
              <select
                class="control"
                [value]="choice().songOrder.axis"
                data-testid="pdf-song-order"
                (change)="patchOrder({ axis: axis($event) })"
              >
                <option value="title">{{ byTitleLabel }}</option>
                <option value="name">{{ byNameLabel }}</option>
                <option value="created">{{ byCreatedLabel }}</option>
                <option value="changed">{{ byChangedLabel }}</option>
              </select>
            </label>

            <label class="row">
              <span class="name">{{ directionLabel }}</span>
              <select
                class="control"
                [value]="choice().songOrder.dir"
                data-testid="pdf-song-dir"
                (change)="patchOrder({ dir: dir($event) })"
              >
                <option value="asc">{{ ascLabel }}</option>
                <option value="desc">{{ descLabel }}</option>
              </select>
            </label>

            <label class="row is-toggle">
              <input
                type="checkbox"
                [checked]="choice().songOrder.favoritesFirst"
                data-testid="pdf-favorites-first"
                (change)="patchOrder({ favoritesFirst: checked($event) })"
              />
              <span class="name">{{ favoritesFirstLabel }}</span>
            </label>
          </div>
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

    /* The song-order controls, set apart from the paper options above with a
       hairline — they answer a different question ("in what order", not "on what
       paper") and only appear for All songs. */
    .group {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin-block-start: var(--space-1);
      padding-block-start: var(--space-2);
      border-block-start: 1px solid var(--border);
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
  /** The options the dialog opens on — the last-used set, so a person's usual
   * paper is not re-chosen every time (persisted by `PrintOptionsStore`). */
  readonly initial = input<SongbookPdfChoice>(DEFAULT_PRINT_OPTIONS);
  /** Show the song-order controls — **only for All songs**, whose order is not
   * fixed. A real songbook prints in its arranged order, so it hides them. */
  readonly showSongOrder = input(false);

  readonly chosen = output<SongbookPdfChoice>();
  readonly closed = output<void>();

  // linkedSignal, not a plain signal seeded once: `initial` may arrive after
  // construction (the store hydrates async-ish), and the dialog should reflect
  // it. Local edits win until `initial` itself changes.
  protected readonly choice = linkedSignal(() => this.initial());

  protected readonly title = computed(
    () => $localize`:@@songbookDownload.title:Download “${this.name()}:name:”`,
  );

  protected patch(change: Partial<SongbookPdfChoice>): void {
    this.choice.update((current) => ({ ...current, ...change }));
  }

  protected patchOrder(change: Partial<SongOrder>): void {
    this.choice.update((current) => ({
      ...current,
      songOrder: { ...current.songOrder, ...change },
    }));
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

  protected variant(event: Event): TitlePageVariant {
    return this.value(event) as TitlePageVariant;
  }

  protected axis(event: Event): SongOrderAxis {
    return this.value(event) as SongOrderAxis;
  }

  protected dir(event: Event): SongOrderDir {
    return this.value(event) as SongOrderDir;
  }

  protected number(event: Event): number {
    const raw = Number((event.target as HTMLInputElement).value);
    // A margin is a length, and a negative one is not a smaller page — it is a
    // song printed off the edge of the paper.
    return Number.isFinite(raw)
      ? Math.max(raw, 0)
      : DEFAULT_PRINT_OPTIONS.marginMm;
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
  protected readonly variantLabel = $localize`:@@songbookDownload.variant:Title page style`;
  protected readonly summaryLabel = $localize`:@@songbookDownload.summary:Summary (contents)`;
  protected readonly pageNumbersLabel = $localize`:@@songbookDownload.pageNumbers:Page numbers`;
  protected readonly orderLabel = $localize`:@@songbookDownload.order:Song order`;
  protected readonly byTitleLabel = $localize`:@@songbookDownload.order.title:Title`;
  protected readonly byNameLabel = $localize`:@@songbookDownload.order.name:Library name`;
  protected readonly byCreatedLabel = $localize`:@@songbookDownload.order.created:Date created`;
  protected readonly byChangedLabel = $localize`:@@songbookDownload.order.changed:Date changed`;
  protected readonly directionLabel = $localize`:@@songbookDownload.direction:Direction`;
  protected readonly ascLabel = $localize`:@@songbookDownload.asc:Ascending`;
  protected readonly descLabel = $localize`:@@songbookDownload.desc:Descending`;
  protected readonly favoritesFirstLabel = $localize`:@@songbookDownload.favoritesFirst:Favorites first`;
  protected readonly positionLabel = $localize`:@@songbookDownload.position:Number position`;
  protected readonly bottomCenterLabel = $localize`:@@songbookDownload.bottomCenter:Bottom, centred`;
  protected readonly bottomLeftLabel = $localize`:@@songbookDownload.bottomLeft:Bottom left`;
  protected readonly bottomRightLabel = $localize`:@@songbookDownload.bottomRight:Bottom right`;
  protected readonly topCenterLabel = $localize`:@@songbookDownload.topCenter:Top, centred`;
  protected readonly topLeftLabel = $localize`:@@songbookDownload.topLeft:Top left`;
  protected readonly topRightLabel = $localize`:@@songbookDownload.topRight:Top right`;

  // Only `classic` renders today; the rest are named so the choice is real and
  // land later. The "(soon)" is on the label so a screen-reader user hears it,
  // and the option is disabled so it cannot be picked meanwhile.
  private readonly soon = $localize`:@@songbookDownload.soon:(soon)`;
  protected readonly variants: readonly VariantOption[] = [
    {
      value: 'classic',
      label: $localize`:@@songbookDownload.variant.classic:Classic`,
      isReady: true,
    },
    {
      value: 'centered',
      label: `${$localize`:@@songbookDownload.variant.centered:Centered`} ${this.soon}`,
      isReady: false,
    },
    {
      value: 'banner',
      label: `${$localize`:@@songbookDownload.variant.banner:Banner`} ${this.soon}`,
      isReady: false,
    },
    {
      value: 'minimal',
      label: `${$localize`:@@songbookDownload.variant.minimal:Minimal`} ${this.soon}`,
      isReady: false,
    },
  ];
  protected readonly fitNote = $localize`:@@songbookDownload.fitNote:Each song keeps its own shape and is scaled to fit the page.`;
  protected readonly cancelLabel = $localize`:@@songbookDownload.cancel:Cancel`;
  protected readonly downloadLabel = $localize`:@@songbookDownload.confirm:Download`;
}
