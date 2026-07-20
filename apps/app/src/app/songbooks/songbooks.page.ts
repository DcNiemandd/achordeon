// Songbooks page — Epic 6 ▸ subtask 1
// Spec: CONTEXT.md §Songbook; PRD-UI-SHELL.md §4 (`/songbooks` is single-pane)

import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import {
  Autofocus,
  Button,
  Dialog,
  EmptyState,
  Field,
  Icon,
  Tooltip,
} from '../primitives';
import { ActionBar } from '../shared/layout';
import {
  SongbooksPresenter,
  type PendingSongbookDelete,
  type SongbookRow,
} from './songbooks.presenter';

/**
 * The songbook list: **All songs**, then the books you made.
 *
 * Single pane (§4) — a songbook has nothing to preview until you are inside it,
 * and the builder is `/songbooks/:id`. The list is short by nature (a library has
 * hundreds of songs and a handful of books), so it is not virtualised and offers
 * no search: both would be chrome around six rows.
 */
@Component({
  selector: 'app-songbooks-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SongbooksPresenter],
  imports: [
    ActionBar,
    Autofocus,
    Button,
    Dialog,
    EmptyState,
    Field,
    Icon,
    Tooltip,
  ],
  template: `
    <app-action-bar [title]="title">
      <button
        appButton
        variant="primary"
        [attr.aria-label]="addLabel"
        [appTooltip]="addLabel"
        data-testid="songbooks-add"
        (click)="presenter.create()"
      >
        <app-icon name="add" />
        {{ addLabel }}
      </button>
    </app-action-bar>

    <div class="list" data-testid="songbook-list">
      @for (row of presenter.rows(); track row.id) {
        <div
          class="row"
          [class.is-virtual]="row.isVirtual"
          data-testid="songbook-row"
          [attr.data-songbook-id]="row.id"
        >
          @if (renamingId() === row.id) {
            <input
              appField
              class="rename"
              [value]="row.name"
              [attr.aria-label]="renameRowLabel(row)"
              [attr.data-testid]="'songbook-rename-input-' + row.id"
              appAutofocus
              (keydown.enter)="commitRename(row, $event)"
              (keydown.escape)="cancelRename()"
              (blur)="commitRename(row, $event)"
            />
          } @else {
            <button
              type="button"
              class="open"
              [attr.data-testid]="'songbook-open-' + row.id"
              (click)="presenter.open(row.id)"
            >
              <span class="name">{{ row.name }}</span>
              <span class="count">{{ countLabel(row) }}</span>
            </button>
          }

          <!-- The virtual row has no record behind it: nothing to rename and
               nothing to delete (CONTEXT.md §Songbook). -->
          @if (!row.isVirtual) {
            <div class="row-actions">
              <button
                appButton
                type="button"
                [isIconOnly]="true"
                [attr.aria-label]="renameRowLabel(row)"
                [appTooltip]="renameRowLabel(row)"
                [attr.data-testid]="'songbook-rename-' + row.id"
                (click)="startRename(row)"
              >
                <app-icon name="rename" />
              </button>
              <button
                appButton
                type="button"
                [isIconOnly]="true"
                [attr.aria-label]="deleteRowLabel(row)"
                [appTooltip]="deleteRowLabel(row)"
                [attr.data-testid]="'songbook-delete-' + row.id"
                (click)="presenter.requestDelete(row.id)"
              >
                <app-icon name="delete" />
              </button>
            </div>
          }
        </div>
      }

      <!-- "No books yet" is about the books you made: All songs is always there,
           so the list is never actually empty. -->
      @if (presenter.rows().length === 1) {
        <app-empty-state [text]="emptyText" data-testid="songbooks-empty" />
      }
    </div>

    @if (presenter.pendingDelete(); as pending) {
      <app-dialog
        [title]="deleteTitle"
        data-testid="songbook-delete-dialog"
        (closed)="presenter.cancelDelete()"
      >
        <p class="warn">{{ deleteQuestion(pending) }}</p>
        <!-- Said out loud, because "delete" next to a list of songs reads like a
             threat to the songs (CONTEXT.md §Delete vs Remove). -->
        <p class="warn keeps">{{ keepsSongsText }}</p>

        <button
          dialog-actions
          appButton
          type="button"
          variant="secondary"
          data-testid="songbook-delete-cancel"
          (click)="presenter.cancelDelete()"
        >
          {{ cancelLabel }}
        </button>
        <button
          dialog-actions
          appButton
          type="button"
          variant="primary"
          data-testid="songbook-delete-confirm"
          (click)="presenter.confirmDelete()"
        >
          {{ deleteLabel }}
        </button>
      </app-dialog>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      block-size: 100%;
    }

    .list {
      flex: 1;
      min-block-size: 0;
      overflow: auto;
    }

    .row {
      display: flex;
      align-items: center;
      gap: var(--space-1);
      block-size: 52px;
      padding-inline: var(--space-3);
      border-block-end: 1px solid var(--border);
    }

    .row:hover {
      background: var(--surface-raised);
    }

    /* The library itself, not one of your books — marked, not separated: it is
       still a songbook everywhere else in the app. */
    .row.is-virtual .name {
      color: var(--text-muted);
      font-style: italic;
    }

    .open {
      flex: 1;
      min-inline-size: 0;
      display: flex;
      align-items: baseline;
      gap: var(--space-2);
      padding: 0;
      border: 0;
      background: none;
      text-align: start;
      cursor: pointer;
      block-size: 100%;
    }

    .name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: var(--text-sm);
      color: var(--text);
    }

    .count {
      flex: none;
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
    .row:focus-within .row-actions {
      opacity: 1;
    }

    @media (hover: none) {
      .row-actions {
        opacity: 1;
      }
    }

    .rename {
      flex: 1;
      min-inline-size: 0;
    }

    .warn {
      margin: 0 0 var(--space-2);
    }

    .keeps {
      color: var(--text-muted);
    }
  `,
})
export class SongbooksPage {
  protected readonly presenter = inject(SongbooksPresenter);

  /** The only state this page owns: which row is mid-rename. */
  protected readonly renamingId = signal<string | null>(null);

  protected readonly title = $localize`:@@songbooks.title:Songbooks`;
  protected readonly addLabel = $localize`:@@songbooks.add:New songbook`;
  protected readonly emptyText = $localize`:@@songbooks.empty:No songbooks yet. Create one to group songs for a set.`;
  protected readonly deleteTitle = $localize`:@@songbooks.delete.title:Delete this songbook?`;
  protected readonly keepsSongsText = $localize`:@@songbooks.delete.keeps:The songs themselves stay in your library.`;
  protected readonly cancelLabel = $localize`:@@songbooks.cancel:Cancel`;
  protected readonly deleteLabel = $localize`:@@songbooks.deleteAction:Delete`;

  protected countLabel(row: SongbookRow): string {
    return $localize`:@@songbooks.count:${row.count}:count: songs`;
  }

  protected renameRowLabel(row: SongbookRow): string {
    return $localize`:@@songbooks.renameRow:Rename ${row.name}:name:`;
  }

  protected deleteRowLabel(row: SongbookRow): string {
    return $localize`:@@songbooks.deleteRow:Delete ${row.name}:name:`;
  }

  protected deleteQuestion(pending: PendingSongbookDelete): string {
    return $localize`:@@songbooks.delete.question:“${pending.name}:name:” and its ${pending.count}:count: entries will be removed.`;
  }

  protected startRename(row: SongbookRow): void {
    this.renamingId.set(row.id);
  }

  protected cancelRename(): void {
    this.renamingId.set(null);
  }

  /** Enter and blur commit, Esc backs out — the same contract as renaming a song,
   * because it is the same act. */
  protected commitRename(row: SongbookRow, event: Event): void {
    if (this.renamingId() !== row.id) {
      return;
    }
    const name = (event.target as HTMLInputElement).value.trim();
    this.renamingId.set(null);
    if (name && name !== row.name) {
      void this.presenter.rename(row.id, name);
    }
  }

  constructor() {
    // Once, on entry. Not an `effect`: nothing about this list depends on a
    // signal changing — it is the initial fetch, and re-running it on every
    // store write would re-read the whole library to recount one row.
    void this.presenter.load();
  }
}
