// Songbook entries list — Epic 6 ▸ subtask 3
// Spec: CONTEXT.md §Songbook; songbooks/index.mdx; PRD-UI-SHELL.md §3

import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { EmptyState } from '../primitives';

/** Row height in px — `cdk-virtual-scroll-viewport` needs it as a constant, and
 * the CSS below must agree with it. */
const ROW_HEIGHT = 44;

/**
 * One **slot**, not one song: `index` is its identity, because the same song may
 * fill several slots in one book (CONTEXT.md §Songbook). Nothing here may be
 * keyed by `songId`.
 */
export interface EntryRow {
  readonly index: number;
  readonly songId: string;
  readonly name: string;
  readonly title: string;
}

/**
 * The ordered contents of a songbook: pane B of the builder (§4).
 *
 * A **controlled component** like every other (PRD-UI-SHELL.md §3) — rows in,
 * intents out. It holds no selection and performs no reordering; what a move
 * means to the stored order is `entry-ops`, and who writes it is the presenter.
 *
 * Virtualised for the same reason the explorer is: "All songs" mounts the whole
 * library in here.
 */
@Component({
  selector: 'app-songbook-entries',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ScrollingModule, EmptyState],
  template: `
    @if (rows().length === 0) {
      <app-empty-state [text]="emptyText()" data-testid="entries-empty" />
    } @else {
      <cdk-virtual-scroll-viewport
        class="list"
        [itemSize]="ROW_HEIGHT"
        data-testid="entries-list"
      >
        <div
          *cdkVirtualFor="let row of rows(); trackBy: trackByIndex"
          class="row"
          [class.is-current]="row.songId === currentSongId()"
          [class.is-selected]="selected().has(row.index)"
          data-testid="entry-row"
          [attr.data-entry-index]="row.index"
        >
          <!-- The virtual book has no order of its own to edit, so it has
               nothing to select for (CONTEXT.md §Songbook). -->
          @if (!isReadOnly()) {
            <input
              type="checkbox"
              class="check"
              [checked]="selected().has(row.index)"
              [attr.aria-label]="selectRowLabel(row)"
              [attr.data-testid]="'entry-select-' + row.index"
              (change)="selectToggled.emit(row.index)"
            />
          }

          <!-- The slot number is the thing that repeats and reorders; it is what
               the user is counting down when they read a set list. -->
          <span class="ordinal" aria-hidden="true">{{ row.index + 1 }}</span>

          <button
            type="button"
            class="open"
            [attr.data-testid]="'entry-open-' + row.index"
            (click)="activated.emit(row.songId)"
          >
            <span class="name">{{ row.name }}</span>
            @if (row.title) {
              <span class="title">{{ row.title }}</span>
            }
          </button>
        </div>
      </cdk-virtual-scroll-viewport>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-block-size: 0;
      block-size: 100%;
    }

    .list {
      flex: 1;
      min-block-size: 0;
    }

    .row {
      display: flex;
      align-items: center;
      gap: var(--space-1);
      block-size: 44px;
      padding-inline: var(--space-2);
      border-block-end: 1px solid var(--border);
    }

    .row:hover {
      background: var(--surface-raised);
    }

    .row.is-selected {
      background: var(--brand-subtle);
    }

    /* The song the rest of the app is pointing at — the same mark the explorer
       uses, so the two panes agree about "this one". */
    .row.is-current {
      box-shadow: inset 3px 0 0 var(--brand);
    }

    .check {
      accent-color: var(--brand);
      inline-size: 16px;
      block-size: 16px;
      flex: none;
    }

    .ordinal {
      flex: none;
      min-inline-size: 2ch;
      text-align: end;
      font-size: var(--text-xs);
      color: var(--text-faint);
      font-variant-numeric: tabular-nums;
    }

    .open {
      flex: 1;
      min-inline-size: 0;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 1px;
      padding: 0 var(--space-1);
      border: 0;
      background: none;
      text-align: start;
      cursor: pointer;
      block-size: 100%;
    }

    .name,
    .title {
      max-inline-size: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .name {
      font-size: var(--text-sm);
      color: var(--text);
    }

    .title {
      font-size: var(--text-xs);
      color: var(--text-faint);
    }

    .row-actions {
      display: flex;
      align-items: center;
      gap: 2px;
      flex: none;
      opacity: 0;
    }

    .row:hover .row-actions,
    .row:focus-within .row-actions,
    .row.is-selected .row-actions {
      opacity: 1;
    }

    @media (hover: none) {
      .row-actions {
        opacity: 1;
      }
    }
  `,
})
export class SongbookEntries {
  readonly rows = input.required<readonly EntryRow[]>();
  readonly selected = input<ReadonlySet<number>>(new Set());
  /** The virtual **All songs** book: read-only order, nothing removable. */
  readonly isReadOnly = input(false);
  readonly currentSongId = input<string | null>(null);
  readonly emptyText = input(
    $localize`:@@entries.empty:No songs in this songbook yet.`,
  );

  readonly selectToggled = output<number>();
  /** A row was clicked: make that song current across the app. */
  readonly activated = output<string>();

  protected readonly ROW_HEIGHT = ROW_HEIGHT;

  protected trackByIndex(_i: number, row: EntryRow): number {
    return row.index;
  }

  protected selectRowLabel(row: EntryRow): string {
    return $localize`:@@entries.selectRow:Select slot ${row.index + 1}:slot:, ${row.name}:name:`;
  }
}
