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
import { Button, Dialog, Icon, Tooltip } from '../primitives';
import {
  ActionBar,
  BlankPage,
  SplitPane,
  UiStore,
  Viewport,
} from '../shared/layout';
import { SongRender } from '../shared/song-render';
import {
  SongExplorer,
  toExplorerSort,
  toExplorerSortDir,
  type ExplorerSort,
} from '../shared/song-explorer';
import {
  SongsPresenter,
  type PendingDelete,
  type SongUse,
} from './songs.presenter';

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
    SongRender,
    Button,
    Dialog,
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
          (deleted)="presenter.requestDelete($event)"
        />
      </div>

      <!-- Pane B: the render of the focused song. With no song — an empty
           library — the page stays blank: the shape of what goes there, not an
           illustration and not a call to action (PRD-UI-SHELL.md §4). -->
      <app-blank-page pane-b [ratio]="presenter.aspectRatio()">
        @if (presenter.currentSong()) {
          <app-song-render [svg]="presenter.svg()" />
        }
      </app-blank-page>
    </app-split-pane>

    @if (presenter.pendingDelete(); as pending) {
      <app-dialog
        [title]="deleteTitle(pending)"
        data-testid="delete-dialog"
        (closed)="presenter.cancelDelete()"
      >
        <p class="warn">{{ deleteQuestion(pending) }}</p>

        <!-- The in-use warning: not a count, but the songbooks themselves, each
             a way to go and look before you answer (CONTEXT.md §Delete vs
             Remove). -->
        @if (pending.uses.length > 0) {
          <p class="warn in-use" data-testid="delete-in-use">
            <app-icon name="warning" class="warn-icon" />
            {{ inUseText }}
          </p>
          <ul class="uses">
            @for (use of pending.uses; track use.bookId + use.songId) {
              <li>
                <button
                  appButton
                  type="button"
                  variant="ghost"
                  [attr.data-testid]="'in-use-' + use.bookId"
                  (click)="presenter.openSongbook(use)"
                >
                  {{ useLabel(use, pending) }}
                </button>
              </li>
            }
          </ul>
        }

        <button
          dialog-actions
          appButton
          type="button"
          variant="secondary"
          data-testid="delete-cancel"
          (click)="presenter.cancelDelete()"
        >
          {{ cancelLabel }}
        </button>
        <button
          dialog-actions
          appButton
          type="button"
          variant="primary"
          data-testid="delete-confirm"
          (click)="presenter.confirmDelete()"
        >
          {{ deleteLabel }}
        </button>
      </app-dialog>
    }
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

    .warn {
      margin: 0 0 var(--space-2);
    }

    .in-use {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      color: var(--text-muted);
    }

    .warn-icon {
      --icon-size: 16px;
      flex: none;
      color: var(--brand);
    }

    .uses {
      margin: 0;
      padding: 0;
      list-style: none;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
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
  protected readonly cancelLabel = $localize`:@@songs.cancel:Cancel`;
  protected readonly deleteLabel = $localize`:@@songs.delete:Delete`;
  protected readonly inUseText = $localize`:@@songs.delete.inUse:It is still used here. Deleting removes it from these songbooks:`;

  /** A song deleted is a song gone from the library and out of every songbook —
   * so the question says both, and never a bare "are you sure?". */
  protected deleteTitle(pending: PendingDelete): string {
    return pending.ids.length === 1
      ? $localize`:@@songs.delete.title:Delete this song?`
      : $localize`:@@songs.delete.titleMany:Delete ${pending.ids.length}:count: songs?`;
  }

  protected deleteQuestion(pending: PendingDelete): string {
    return pending.ids.length === 1
      ? $localize`:@@songs.delete.one:“${pending.names[0]}:name:” will be removed from your library.`
      : $localize`:@@songs.delete.many:${pending.names.join(', ')}:names: will be removed from your library.`;
  }

  /** A bulk delete's warning spans songs, so a bare songbook name would not say
   * which song put it on the list. */
  protected useLabel(use: SongUse, pending: PendingDelete): string {
    return pending.ids.length === 1
      ? use.bookName
      : $localize`:@@songs.delete.useMany:${use.bookName}:book: (${use.songName}:song:)`;
  }

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
