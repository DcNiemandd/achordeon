// Songs page — Epic 5 ▸ subtasks 1–2
// Spec: PRD-UI-SHELL.md §4 (what pane B shows), §7 (state placement)

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
} from '@angular/core';
import { Button, Icon, Tooltip } from '../primitives';
import {
  ActionBar,
  BlankPage,
  SplitPane,
  UiStore,
  Viewport,
} from '../shared/layout';
import {
  SongExplorer,
  toExplorerSort,
  toExplorerSortDir,
  type ExplorerSort,
} from '../shared/song-explorer';
import { SongsPresenter } from './songs.presenter';

/**
 * The song explorer and the render of whatever it has focused.
 *
 * **Split on desktop only** — `songs/index.mdx` promises "rendered output always
 * visible on the right side", and that is a desktop promise. Below the breakpoint
 * this is the explorer at full width with no pane switcher, because until a song
 * is open there is no second pane to switch to (PRD-UI-SHELL.md §4).
 *
 * Search and sort arrive as **signal inputs from the URL** (§7): the URL is the
 * one source of truth, so a reload or a shared link lands on the same list, and
 * the store's window is never told about a query the address bar disagrees with.
 */
@Component({
  selector: 'app-songs-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SongsPresenter],
  imports: [
    ActionBar,
    BlankPage,
    SplitPane,
    SongExplorer,
    Button,
    Icon,
    Tooltip,
  ],
  template: `
    <app-split-pane
      [ratio]="ui.splitRatio()"
      [hasTwoPanes]="!viewport.isCompact()"
      (ratioChange)="ui.setSplitRatio($event)"
    >
      <div pane-a class="pane">
        <app-action-bar [title]="title">
          <button
            appButton
            variant="primary"
            [attr.aria-label]="addLabel"
            [appTooltip]="addLabel"
            data-testid="songs-add"
            (click)="presenter.create()"
          >
            <app-icon name="add" />
            {{ addLabel }}
          </button>
        </app-action-bar>

        <app-song-explorer
          class="explorer"
          [rows]="presenter.rows()"
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
          (opened)="presenter.open($event)"
          (selectToggled)="presenter.toggleSelect($event)"
          (selectionCleared)="presenter.clearSelection()"
          (favorited)="presenter.toggleFavorite($event)"
          (favoritedMany)="presenter.favoriteMany($event)"
          (renamed)="presenter.rename($event.id, $event.name)"
          (duplicated)="presenter.duplicate($event)"
        />
      </div>

      <!-- Pane B: the render of the focused song. The SVG mounts here in
           subtask 6; until then the page chrome is what the shape looks like. -->
      <app-blank-page pane-b />
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
    }

    .explorer {
      flex: 1;
      min-block-size: 0;
    }
  `,
})
export class SongsPage {
  protected readonly ui = inject(UiStore);
  protected readonly viewport = inject(Viewport);
  protected readonly presenter = inject(SongsPresenter);

  /**
   * `?q=` / `?sort=` / `?dir=`, delivered by `withComponentInputBinding()`.
   *
   * **Typed `| undefined`, and defaulted below — an `input()` default is a lie
   * here** [trap]. Router input binding *sets* every declared input on each
   * navigation, so a param that is absent from the URL arrives as an explicit
   * `undefined` that overwrites the default. Believing `input('name')` meant "name
   * when absent" is what shipped `sort: undefined` into the store, where
   * `pageRecords` fell through to its last sort branch and ordered the library by
   * random uuid — a list whose order changed on every mutation.
   *
   * They arrive as raw strings, because that is what a URL holds.
   */
  readonly q = input<string | undefined>();
  readonly sort = input<string | undefined>();
  readonly dir = input<string | undefined>();

  /** The params as the rest of the page may believe them: narrowed, defaulted. */
  protected readonly query = computed(() => this.q() ?? '');
  protected readonly sortKey = computed<ExplorerSort>(
    () => toExplorerSort(this.sort()) ?? 'name',
  );
  protected readonly sortDir = computed(() => toExplorerSortDir(this.dir()));

  protected readonly title = $localize`:@@songs.title:Songs`;
  protected readonly addLabel = $localize`:@@songs.add:New song`;

  /** "Nothing here" and "nothing matched" are different facts, and only one of
   * them is the user's fault. */
  protected readonly emptyText = computed(() =>
    this.query()
      ? $localize`:@@songs.noMatches:No songs match your search.`
      : $localize`:@@songs.empty:No songs yet. Create one to get started.`,
  );

  constructor() {
    effect(() => {
      void this.presenter.syncQuery({
        query: this.query(),
        sort: this.sortKey(),
        dir: this.sortDir(),
      });
    });

    // Auto-select the most recently updated song, once the library is loaded.
    effect(() => {
      if (this.presenter.isLoaded()) {
        void this.presenter.autoSelect();
      }
    });
  }
}
