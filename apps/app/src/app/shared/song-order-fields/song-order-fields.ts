// All songs order — the shared control
// Spec: CONTEXT.md §Songbook (All songs has no stored order, so it is described)
//
// The order the virtual **All songs** book is arranged in: an axis, a direction,
// and whether favourites float. A real songbook's order IS its content — you
// arranged the slots — so only All songs asks this, and it asks it in All songs'
// settings dialog, beside its print structure, rather than in the download dialog
// (which is about format and paper). Device-local, like the rest of All songs'
// config, because there is no record to keep it on.
//
// A controlled component: order in, one order out. Labels reuse the existing
// `songbookDownload.order.*` ids — this is those controls, lifted out — so the
// translation is authored once.

import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import type { SongOrder, SongOrderAxis, SongOrderDir } from '../transfer';

@Component({
  selector: 'app-song-order-fields',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="row">
      <span class="name">{{ orderByLabel }}</span>
      <select
        class="control"
        [value]="order().axis"
        data-testid="pdf-song-order"
        (change)="patch({ axis: axis($event) })"
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
        [value]="order().dir"
        data-testid="pdf-song-dir"
        (change)="patch({ dir: dir($event) })"
      >
        <option value="asc">{{ ascLabel }}</option>
        <option value="desc">{{ descLabel }}</option>
      </select>
    </label>

    <label class="row is-toggle">
      <input
        type="checkbox"
        [checked]="order().favoritesFirst"
        data-testid="pdf-favorites-first"
        (change)="patch({ favoritesFirst: checked($event) })"
      />
      <span class="name">{{ favoritesFirstLabel }}</span>
    </label>
  `,
  styles: `
    :host {
      display: contents;
    }

    /* Label left, control right — and the control takes its half rather than
       being sized to its own longest option, which left the pickers in one
       dialog at four different widths with a ragged left edge down the column.
       They fill what they are given, so a wider dialog widens them all. */
    .row {
      display: grid;
      grid-template-columns: 1fr minmax(0, 1fr);
      align-items: center;
      gap: var(--space-2);
    }

    .row.is-toggle {
      grid-template-columns: auto 1fr;
      justify-items: start;
    }

    .control {
      inline-size: 100%;
      min-inline-size: 0;
      padding: var(--space-1) var(--space-2);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--surface);
      color: var(--text);
      font: inherit;
    }
  `,
})
export class SongOrderFields {
  readonly order = input.required<SongOrder>();
  readonly changed = output<SongOrder>();

  protected patch(change: Partial<SongOrder>): void {
    this.changed.emit({ ...this.order(), ...change });
  }

  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  private value(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  protected axis(event: Event): SongOrderAxis {
    return this.value(event) as SongOrderAxis;
  }

  protected dir(event: Event): SongOrderDir {
    return this.value(event) as SongOrderDir;
  }

  protected readonly orderByLabel = $localize`:@@songbooks.orderBy:Order by`;
  protected readonly byTitleLabel = $localize`:@@songbookDownload.order.title:Title`;
  protected readonly byNameLabel = $localize`:@@songbookDownload.order.name:Library name`;
  protected readonly byCreatedLabel = $localize`:@@songbookDownload.order.created:Date created`;
  protected readonly byChangedLabel = $localize`:@@songbookDownload.order.changed:Date changed`;
  protected readonly directionLabel = $localize`:@@songbookDownload.direction:Direction`;
  protected readonly ascLabel = $localize`:@@songbookDownload.asc:Ascending`;
  protected readonly descLabel = $localize`:@@songbookDownload.desc:Descending`;
  protected readonly favoritesFirstLabel = $localize`:@@songbookDownload.favoritesFirst:Favorites first`;
}
