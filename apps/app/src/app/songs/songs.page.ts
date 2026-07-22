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
  SelectionStatus,
  SongExplorer,
  toExplorerSort,
  toExplorerSortDir,
  type ExplorerSort,
} from '../shared/song-explorer';
import { DownloadDialog, ImportPanel } from '../shared/transfer';
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
    SelectionStatus,
    SongRender,
    DownloadDialog,
    ImportPanel,
    Button,
    Dialog,
    Icon,
    Tooltip,
  ],
  template: `
    <app-split-pane
      [ratio]="ui.splitRatio('songs')"
      [hasTwoPanes]="!viewport.isCompact()"
      (ratioChange)="ui.setSplitRatio('songs', $event)"
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

          <!-- Bulk actions ride the same row as "New song" and are ALWAYS
               mounted, disabled until a selection exists. They used to be a bar
               that appeared between the toolbar and the list, which meant ticking
               the first checkbox shoved every row down by 34px — the list moved
               under the pointer that was still aiming at it. A fixed row of
               disabled icons costs a little clarity and buys back a stable list,
               which is the better trade while you are picking rows. -->
          <div class="bulk" data-testid="explorer-bulk">
            <!-- The same control the songbook builder mounts, in the same place
                 (the end of the action row): both lists carry a selection, so
                 both say so identically. -->
            <app-selection-status
              [count]="presenter.selectedIds().size"
              (cleared)="presenter.clearSelection()"
            />

            <button
              appButton
              type="button"
              [isIconOnly]="true"
              [disabled]="!hasSelection()"
              [attr.aria-label]="bulkFavoriteLabel()"
              [appTooltip]="bulkFavoriteLabel()"
              data-testid="explorer-bulk-favorite"
              (click)="presenter.favoriteMany([...presenter.selectedIds()])"
            >
              <app-icon
                name="favorite"
                [isFilled]="presenter.isSelectionAllFavorite()"
              />
            </button>

            <!-- Download and Export sit with the bulk actions because they act
                 on the same subject: the ticked rows, or the song you are
                 looking at. They are enabled where the delete is not, because
                 there is always something to download once a song is focused. -->
            <button
              appButton
              type="button"
              [isIconOnly]="true"
              [disabled]="!hasTransferTarget() || presenter.isBusy()"
              [attr.aria-label]="downloadLabel()"
              [appTooltip]="downloadLabel()"
              data-testid="songs-download"
              (click)="presenter.openDownload()"
            >
              <app-icon name="download" />
            </button>

            <button
              appButton
              type="button"
              [isIconOnly]="true"
              [disabled]="!hasTransferTarget() || presenter.isBusy()"
              [attr.aria-label]="exportLabel()"
              [appTooltip]="exportLabel()"
              data-testid="songs-export"
              (click)="presenter.exportSelection()"
            >
              <app-icon name="export" />
            </button>

            <!-- Import takes no selection, so it is the one transfer control
                 that is never disabled. It opens the shared import panel's file
                 picker; the panel owns the file input and the dialogs. -->
            <button
              appButton
              type="button"
              [isIconOnly]="true"
              [disabled]="presenter.isBusy()"
              [attr.aria-label]="importLabel"
              [appTooltip]="importLabel"
              data-testid="songs-import"
              (click)="importPanel.pick()"
            >
              <app-icon name="import" />
            </button>

            <button
              appButton
              type="button"
              [isIconOnly]="true"
              [disabled]="!hasSelection()"
              [attr.aria-label]="bulkDeleteLabel"
              [appTooltip]="bulkDeleteLabel"
              data-testid="explorer-bulk-delete"
              (click)="presenter.requestDelete([...presenter.selectedIds()])"
            >
              <app-icon name="delete" />
            </button>
          </div>
        </app-action-bar>

        <app-song-explorer
          class="explorer"
          [rows]="presenter.rows()"
          [isCompact]="viewport.isStacked()"
          [query]="query()"
          [sort]="sortKey()"
          [dir]="presenter.effectiveDir(sortKey(), sortDir())"
          [isFavoritesFirst]="isFavoritesFirst()"
          [selectedIds]="presenter.selectedIds()"
          [currentId]="presenter.currentId()"
          [emptyText]="emptyText()"
          (queryChange)="presenter.setQuery($event)"
          (sortChange)="presenter.setSort($event)"
          (favoritesFirstChange)="presenter.setFavoritesFirst($event)"
          (loadMore)="presenter.loadMore()"
          (activated)="presenter.activate($event)"
          (opened)="presenter.open($event)"
          (selectToggled)="presenter.toggleSelect($event)"
          (favorited)="presenter.toggleFavorite($event)"
          (renamed)="presenter.rename($event.id, $event.name)"
          (duplicated)="presenter.duplicate($event)"
          (downloaded)="presenter.openDownloadRow($event)"
          (exported)="presenter.exportRow($event)"
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

    @if (presenter.isDownloadOpen()) {
      <app-download-dialog
        [count]="presenter.downloadIds().length"
        [busy]="presenter.isBusy()"
        [progress]="presenter.downloadProgress()"
        (chosen)="presenter.download($event)"
        (closed)="presenter.cancelDownload()"
      />
    }

    <!-- The file input and the import/error dialogs, shared with Songbooks. The
         Import button above opens its picker. -->
    <app-import-panel
      #importPanel
      inputTestid="songs-import-input"
      [preview]="presenter.importPreview()"
      [error]="presenter.importError()"
      (picked)="presenter.readImport($event)"
      (confirmed)="presenter.confirmImport($event)"
      (dismissed)="presenter.cancelImport()"
    />

    @if (presenter.pendingDelete(); as pending) {
      <app-dialog
        [title]="deleteTitle(pending)"
        data-testid="delete-dialog"
        (closed)="presenter.cancelDelete()"
      >
        <!-- The names as a LIST, not a sentence. A comma-joined paragraph of
             twelve titles is a wall you have to parse to answer a question
             about; a list is countable at a glance, which is the only thing
             that makes "yes" a considered answer. -->
        <p class="warn">{{ deleteQuestion(pending) }}</p>
        <ul class="names" data-testid="delete-names">
          @for (name of pending.names; track $index) {
            <li>{{ name }}</li>
          }
        </ul>

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

    /* Pushed to the far end of the action row, away from "New song": these act on
       what you already have, that one makes something new. */
    .bulk {
      display: flex;
      align-items: center;
      gap: 2px;
      margin-inline-start: auto;
    }

    /* Ahead of the icon buttons, so the count reads before the actions it
       describes. It renders nothing at all when the selection is empty. */
    .bulk app-selection-status {
      margin-inline-end: var(--space-1);
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

    .names {
      margin: 0 0 var(--space-3);
      padding-inline-start: var(--space-4);
      max-block-size: 40vh;
      overflow: auto;
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
  readonly fav = input<string | undefined>();

  /** The params as the rest of the page may believe them: narrowed, defaulted. */
  protected readonly query = computed(() => this.q() ?? '');
  protected readonly sortKey = computed<ExplorerSort>(
    () => toExplorerSort(this.sort()) ?? 'name',
  );
  protected readonly sortDir = computed(() => toExplorerSortDir(this.dir()));
  protected readonly isFavoritesFirst = computed(() => this.fav() === '1');

  protected readonly hasSelection = computed(
    () => this.presenter.selectedIds().size > 0,
  );

  /** Download and Export answer the selection, or — with none — the song in
   * pane B. So they are live whenever there is anything to look at. */
  protected readonly hasTransferTarget = computed(() =>
    this.presenter.hasBarTransfer(),
  );

  /** The label says what will be acted on, because "Download" beside a list of
   * ticked rows and a rendered song is otherwise ambiguous. */
  protected readonly downloadLabel = computed(() =>
    this.hasSelection()
      ? $localize`:@@songs.downloadSelected:Download the selected songs`
      : $localize`:@@songs.downloadOne:Download this song`,
  );

  protected readonly exportLabel = computed(() =>
    this.hasSelection()
      ? $localize`:@@songs.exportSelected:Export the selected songs to a file`
      : $localize`:@@songs.exportOne:Export this song to a file`,
  );

  protected readonly importLabel = $localize`:@@songs.import:Import songs from a file`;

  protected readonly title = $localize`:@@songs.title:Songs`;
  protected readonly addLabel = $localize`:@@songs.add:New song`;
  /** Names the act, not the object — the button does one of two things. */
  protected readonly bulkFavoriteLabel = computed(() =>
    this.presenter.isSelectionAllFavorite()
      ? $localize`:@@songs.bulkUnfavorite:Remove the selected songs from favorites`
      : $localize`:@@songs.bulkFavorite:Favorite the selected songs`,
  );
  protected readonly bulkDeleteLabel = $localize`:@@songs.bulkDelete:Delete the selected songs`;
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

  /** The sentence above the list — which is why it names no songs itself. */
  protected deleteQuestion(pending: PendingDelete): string {
    return pending.ids.length === 1
      ? $localize`:@@songs.delete.one:This will be removed from your library:`
      : $localize`:@@songs.delete.many:These ${pending.ids.length}:count: songs will be removed from your library:`;
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
        isFavoritesFirst: this.isFavoritesFirst(),
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
