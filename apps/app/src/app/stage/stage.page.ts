// Stage page — Epic 8 ▸ songbook picker
// Spec: docs/achordeon-implementation.md §Epic 8

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { EmptyState } from '../primitives';
import { ActionBar } from '../shared/layout';
import { StagePresenter } from './stage.presenter';

/**
 * The songbook picker: choose which songbook you want to perform.
 *
 * A simple list rather than the full SongExplorer — the stage is a
 * performance context, not a management one, so search, sort, and bulk
 * actions would be noise. Each row is a button: clicking anywhere on the row
 * starts performing that songbook.
 *
 * Empty songbooks are hidden entirely (you cannot perform nothing).
 * A note below the list reports how many are hidden.
 *
 * "All songs" is always listed first.
 */
@Component({
  selector: 'app-stage-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [StagePresenter],
  imports: [ActionBar, EmptyState],
  template: `
    <app-action-bar [title]="title" />

    @if (presenter.isEmpty()) {
      <app-empty-state [text]="emptyText" data-testid="stage-empty" />
    } @else {
      <ul class="list" data-testid="stage-list">
        @for (row of presenter.rows(); track row.id) {
          <li>
            <button
              type="button"
              class="row"
              [class.is-all-songs]="row.isAllSongs"
              [attr.aria-label]="performLabel(row.name)"
              [attr.data-testid]="'stage-row-' + row.id"
              (click)="presenter.perform(row.id)"
              (dblclick)="presenter.perform(row.id)"
            >
              <span class="name">{{ row.name }}</span>
              <span class="count">{{ countLabel(row.entryCount) }}</span>
            </button>
          </li>
        }
      </ul>

      @if (presenter.hiddenCount() > 0) {
        <p class="hidden-note" data-testid="stage-hidden-note">
          {{ hiddenNote(presenter.hiddenCount()) }}
        </p>
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      block-size: 100%;
      overflow-y: auto;
    }

    .list {
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .row {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      inline-size: 100%;
      padding: var(--space-3) var(--space-4);
      border: none;
      border-block-end: 1px solid var(--border);
      background: none;
      color: inherit;
      font: inherit;
      text-align: start;
      cursor: pointer;
    }

    .row:hover {
      background: var(--surface-raised);
    }

    .row:focus-visible {
      outline: 2px solid var(--brand);
      outline-offset: -2px;
    }

    .name {
      font-size: var(--text-md);
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .is-all-songs .name {
      color: var(--brand);
    }

    .count {
      font-size: var(--text-sm);
      color: var(--text-faint);
    }

    .hidden-note {
      margin: var(--space-3) var(--space-4);
      font-size: var(--text-sm);
      color: var(--text-faint);
    }
  `,
})
export class StagePage {
  protected readonly presenter = inject(StagePresenter);

  protected readonly title = $localize`:@@stage.title:Stage`;
  protected readonly emptyText = $localize`:@@stage.empty:No songs yet. Add songs to start performing.`;

  protected performLabel(name: string): string {
    return $localize`:@@stage.performLabel:Perform "${name}:name:"`;
  }

  protected countLabel(count: number): string {
    return $localize`:@@stage.songCount:${count}:count: songs`;
  }

  protected hiddenNote(count: number): string {
    return $localize`:@@stage.hiddenEmpty:${count}:count: empty songbooks are hidden`;
  }

  constructor() {
    void this.presenter.load();
  }
}
