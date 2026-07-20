// Songbook detail page — Epic 6 ▸ subtask 2
// Spec: PRD-UI-SHELL.md §4 (pane A: song explorer, pane B: songbook entries)
//
// This is the songbook builder. Epic 5's in-use delete warning links straight
// here — CONTEXT.md §Delete vs Remove promises "a link that opens the Songbook
// and auto-selects the Song" — so the song is already current when this mounts.

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Button, Icon, Tooltip } from '../primitives';
import { ActionBar, SplitPane, UiStore } from '../shared/layout';
import {
  REDUCED_CAPABILITIES,
  SongExplorer,
  toExplorerSort,
  toExplorerSortDir,
  type ExplorerSort,
} from '../shared/song-explorer';
import { SongbookEntries } from './songbook-entries';
import { SongbookDetailPresenter } from './songbook-detail.presenter';

/**
 * The library on the left, the songbook on the right (§4).
 *
 * Pane A is the **same** `<app-song-explorer>` the Songs module mounts, at
 * reduced capability: search, sort, select and favorite stay; edit, rename,
 * duplicate and delete go. You are picking songs here, not administering them —
 * renaming a song from inside a songbook edits the *library*, which is a
 * different job in a different module (CONTEXT.md §Song explorer).
 */
@Component({
  selector: 'app-songbook-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SongbookDetailPresenter],
  imports: [
    RouterLink,
    ActionBar,
    SplitPane,
    SongExplorer,
    SongbookEntries,
    Button,
    Icon,
    Tooltip,
  ],
  template: `
    <app-split-pane
      [ratio]="ui.splitRatio()"
      [activePane]="activePane()"
      (ratioChange)="ui.setSplitRatio($event)"
    >
      <div pane-a class="pane">
        <app-action-bar [title]="presenter.name()">
          <a
            appButton
            bar-end
            routerLink="/songbooks"
            [attr.aria-label]="backLabel"
            [appTooltip]="backLabel"
            data-testid="songbook-back"
          >
            <app-icon name="close" />
          </a>

          <!-- The add buttons live above pane A because they act on **pane A's
               selection**; where the songs land is the argument, not the
               subject. Always mounted and disabled until there is a selection,
               so ticking a checkbox never resizes the list you are ticking in
               (the lesson Epic 5's bulk bar records). The virtual book takes no
               additions at all (CONTEXT.md §Songbook). -->
          @if (!presenter.isVirtual()) {
            <div class="add" data-testid="songbook-add">
              @if (presenter.selectedIds().size > 0) {
                <span class="add-count" data-testid="songbook-add-count">
                  {{ selectionLabel() }}
                </span>
              }

              @for (option of addOptions; track option.where) {
                <button
                  appButton
                  type="button"
                  variant="secondary"
                  [disabled]="!hasSelection()"
                  [attr.aria-label]="option.label"
                  [appTooltip]="option.label"
                  [attr.data-testid]="'add-' + option.where"
                  (click)="presenter.addSelected(option.where)"
                >
                  {{ option.short }}
                </button>
              }

              <button
                appButton
                type="button"
                [isIconOnly]="true"
                [disabled]="!hasSelection()"
                [attr.aria-label]="clearSelectionLabel"
                [appTooltip]="clearSelectionLabel"
                data-testid="songbook-add-clear"
                (click)="presenter.clearSelection()"
              >
                <app-icon name="close" />
              </button>
            </div>
          }
        </app-action-bar>

        <app-song-explorer
          class="explorer"
          [rows]="presenter.rows()"
          [capabilities]="capabilities"
          [query]="query()"
          [sort]="sortKey()"
          [dir]="presenter.effectiveDir(sortKey(), sortDir())"
          [selectedIds]="presenter.selectedIds()"
          [currentId]="presenter.currentId()"
          [emptyText]="emptyText()"
          (queryChange)="presenter.setQuery($event)"
          (sortChange)="presenter.setSort($event)"
          (loadMore)="presenter.loadMore()"
          (activated)="presenter.activate($event)"
          (selectToggled)="presenter.toggleSelect($event)"
          (favorited)="presenter.toggleFavorite($event)"
        />
      </div>

      <div pane-b class="pane">
        <app-songbook-entries
          class="entries"
          data-testid="songbook-detail"
          [rows]="presenter.entries()"
          [selected]="presenter.selectedSlots()"
          [isReadOnly]="presenter.isVirtual()"
          [currentSongId]="presenter.currentId()"
          [emptyText]="entriesEmptyText()"
          (selectToggled)="presenter.toggleSelectSlot($event)"
          (activated)="presenter.activate($event)"
        />
      </div>
    </app-split-pane>
  `,
  styles: `
    :host {
      display: block;
      block-size: 100%;
    }

    .pane {
      display: flex;
      flex-direction: column;
      block-size: 100%;
      min-block-size: 0;
    }

    .explorer,
    .entries {
      flex: 1;
      min-block-size: 0;
    }

    /* Pushed to the far end of the action row, away from the back link: these
       act on what you have already picked. */
    .add {
      display: flex;
      align-items: center;
      gap: 2px;
      margin-inline-start: auto;
    }

    .add-count {
      margin-inline-end: var(--space-1);
      font-size: var(--text-sm);
      color: var(--brand);
      white-space: nowrap;
    }
  `,
})
export class SongbookDetailPage {
  protected readonly ui = inject(UiStore);
  protected readonly presenter = inject(SongbookDetailPresenter);

  /** `/songbooks/:id`, delivered by `withComponentInputBinding()`. */
  readonly id = input.required<string>();

  /**
   * `?q=` / `?sort=` / `?dir=` / `?pane=`, from the URL. Raw strings in and
   * narrowed here: router input binding sets every declared input on each
   * navigation, so an absent param arrives as an explicit `undefined` that would
   * overwrite an `input()` default (see the songs page for the trap).
   */
  readonly q = input<string | undefined>();
  readonly sort = input<string | undefined>();
  readonly dir = input<string | undefined>();
  readonly pane = input<string | undefined>();

  protected readonly query = computed(() => this.q() ?? '');
  protected readonly sortKey = computed<ExplorerSort>(
    () => toExplorerSort(this.sort()) ?? 'name',
  );
  protected readonly sortDir = computed(() => toExplorerSortDir(this.dir()));
  protected readonly activePane = computed<'a' | 'b'>(() =>
    this.pane() === 'render' ? 'b' : 'a',
  );

  /** The Songbooks panel's capability set: identity/destructive actions off. */
  protected readonly capabilities = REDUCED_CAPABILITIES;

  protected readonly backLabel = $localize`:@@songbooks.back:Back to songbooks`;

  protected readonly emptyText = computed(() =>
    this.query()
      ? $localize`:@@songs.noMatches:No songs match your search.`
      : $localize`:@@songs.empty:No songs yet. Create one to get started.`,
  );

  protected readonly hasSelection = computed(
    () => this.presenter.selectedIds().size > 0,
  );

  protected readonly selectionLabel = computed(
    () =>
      $localize`:@@explorer.selected:${this.presenter.selectedIds().size}:count: selected`,
  );

  protected readonly clearSelectionLabel = $localize`:@@songbooks.clearSelection:Clear the selection`;

  /**
   * Four places to put them, named as the answer rather than the act: the verb
   * ("Add") is the same for all four and is already carried by the group.
   * `above`/`below` are relative to the slots ticked on the right, and fall back
   * to the end when nothing is (see `insertionIndex`).
   */
  protected readonly addOptions = [
    {
      where: 'start' as const,
      short: $localize`:@@songbooks.addStart.short:Start`,
      label: $localize`:@@songbooks.addStart:Add the selected songs to the start`,
    },
    {
      where: 'above' as const,
      short: $localize`:@@songbooks.addAbove.short:Above`,
      label: $localize`:@@songbooks.addAbove:Add the selected songs above the selected slot`,
    },
    {
      where: 'below' as const,
      short: $localize`:@@songbooks.addBelow.short:Below`,
      label: $localize`:@@songbooks.addBelow:Add the selected songs below the selected slot`,
    },
    {
      where: 'end' as const,
      short: $localize`:@@songbooks.addEnd.short:End`,
      label: $localize`:@@songbooks.addEnd:Add the selected songs to the end`,
    },
  ];

  /** "All songs" is never empty for a reason the user can act on; a book you
   * made is. Different facts, different sentences. */
  protected readonly entriesEmptyText = computed(() =>
    this.presenter.isVirtual()
      ? $localize`:@@songs.empty:No songs yet. Create one to get started.`
      : $localize`:@@entries.empty:No songs in this songbook yet.`,
  );

  constructor() {
    effect(() => {
      void this.presenter.load(this.id());
    });

    effect(() => {
      void this.presenter.syncQuery({
        query: this.query(),
        sort: this.sortKey(),
        dir: this.sortDir(),
      });
    });
  }
}
