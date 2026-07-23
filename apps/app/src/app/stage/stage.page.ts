// Stage page — Epic 8 ▸ songbook picker
// Spec: docs/achordeon-implementation.md §Epic 8

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Button, EmptyState, Icon, Tooltip } from '../primitives';
import { ActionBar } from '../shared/layout';
import { StagePresenter } from './stage.presenter';

/**
 * The songbook picker: choose which songbook you want to perform.
 *
 * A simple list rather than the full SongExplorer — the stage is a
 * performance context, not a management one, so search, sort, and bulk
 * actions would be noise. Each row has one action: Perform.
 *
 * Empty songbooks are shown but their Perform button is disabled: you cannot
 * perform nothing. The hint says why.
 */
@Component({
  selector: 'app-stage-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [StagePresenter],
  imports: [ActionBar, EmptyState, Button, Icon, RouterLink, Tooltip],
  template: `
    <app-action-bar [title]="title" />

    @if (presenter.isEmpty()) {
      <app-empty-state [text]="emptyText" data-testid="stage-empty" />
    } @else {
      <ul class="list" data-testid="stage-list">
        @for (row of presenter.rows(); track row.id) {
          <li class="row" [attr.data-testid]="'stage-row-' + row.id">
            <div class="info">
              <span class="name">{{ row.name }}</span>
              <span class="count">{{ countLabel(row.entryCount) }}</span>
            </div>
            <button
              appButton
              type="button"
              variant="primary"
              [disabled]="row.entryCount === 0"
              [attr.aria-label]="performLabel(row.name)"
              [appTooltip]="row.entryCount === 0 ? emptyBookTooltip : ''"
              [attr.data-testid]="'stage-perform-' + row.id"
              (click)="presenter.perform(row.id)"
            >
              <app-icon name="stage" />
              {{ performShort }}
            </button>
          </li>
        }
      </ul>
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
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-4);
      border-block-end: 1px solid var(--border);
    }

    .row:hover {
      background: var(--surface-raised);
    }

    .info {
      flex: 1;
      min-inline-size: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .name {
      font-size: var(--text-md);
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .count {
      font-size: var(--text-sm);
      color: var(--text-faint);
    }
  `,
})
export class StagePage {
  protected readonly presenter = inject(StagePresenter);

  protected readonly title = $localize`:@@stage.title:Stage`;
  protected readonly emptyText = $localize`:@@stage.empty:No songbooks yet. Create a songbook to perform.`;
  protected readonly performShort = $localize`:@@stage.perform:Perform`;
  protected readonly emptyBookTooltip = $localize`:@@stage.emptyBook:Add songs to this songbook before performing.`;

  protected performLabel(name: string): string {
    return $localize`:@@stage.performLabel:Perform "${name}:name:"`;
  }

  protected countLabel(count: number): string {
    return $localize`:@@stage.songCount:${count}:count: songs`;
  }

  constructor() {
    void this.presenter.load();
  }
}
