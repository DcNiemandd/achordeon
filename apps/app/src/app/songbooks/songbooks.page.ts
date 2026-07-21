// Songbooks page — Epic 6 ▸ subtask 1
// Spec: CONTEXT.md §Songbook; PRD-UI-SHELL.md §4
//
// **Split, like the songs list** [corrected: §4's table says single pane]. The two
// screens are the same shape — a list of things on the left, the thing you have
// picked on the right — so they behave the same way: a click selects and
// previews, a double click opens. A songbook's preview is its title page.

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { Button, Dialog, Icon, Tooltip } from '../primitives';
import {
  ActionBar,
  BlankPage,
  SplitPane,
  UiStore,
  Viewport,
} from '../shared/layout';
import {
  SONGBOOK_LIST_CAPABILITIES,
  SongExplorer,
} from '../shared/song-explorer';
import { SongRender } from '../shared/song-render';
import { SongbookDownloadDialog } from '../shared/transfer';
import {
  SongbooksPresenter,
  type PendingSongbookDelete,
} from './songbooks.presenter';

@Component({
  selector: 'app-songbooks-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SongbooksPresenter],
  imports: [
    ActionBar,
    BlankPage,
    SplitPane,
    SongExplorer,
    SongRender,
    SongbookDownloadDialog,
    Button,
    Dialog,
    Icon,
    Tooltip,
  ],
  template: `
    <app-split-pane
      [ratio]="ui.splitRatio('songbooks')"
      [hasTwoPanes]="!viewport.isCompact()"
      (ratioChange)="ui.setSplitRatio('songbooks', $event)"
    >
      <div pane-a class="pane">
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

        <!-- The same list component again, a fourth capability set: no
             checkboxes (nothing acts on several songbooks at once yet), no
             search (a library has hundreds of songs and a handful of books),
             rename and delete on the row. -->
        <app-song-explorer
          class="list"
          rowTestid="songbook-row"
          [rows]="presenter.rows()"
          [capabilities]="capabilities"
          [currentId]="presenter.currentId()"
          [emptyText]="emptyText"
          (activated)="presenter.select($event)"
          (opened)="presenter.open($event)"
          (renamed)="presenter.rename($event.id, $event.name)"
          (duplicated)="presenter.duplicate($event)"
          (downloaded)="presenter.openDownloadRow($event)"
          (exported)="presenter.exportRow($event)"
          (deleted)="presenter.requestDelete($event[0])"
        />

        <!-- The list is never empty — All songs is always in it — so the
             "nothing here yet" line is about the books YOU make, and sits under
             the list rather than replacing it. -->
        @if (hasOnlyVirtual()) {
          <p class="hint" data-testid="songbooks-empty">{{ emptyText }}</p>
        }
      </div>

      <!-- Pane B: the picked songbook's title page, **rendered** — the very
           page its PDF prints (Epic 7). It used to be a stack of styled text
           standing in for a render nobody had written yet.

           Blank with nothing picked, and blank for All songs, which has no
           record and so no title page: the empty paper is the honest picture of
           "nothing to print here", and the row itself already says what it
           holds. -->
      <app-blank-page pane-b [ratio]="presenter.titlePageRatio()">
        @if (presenter.titlePageSvg(); as svg) {
          <div class="title-page" data-testid="title-page">
            <app-song-render [svg]="svg" />
          </div>
        }
      </app-blank-page>
    </app-split-pane>

    @if (presenter.isDownloadOpen()) {
      <app-songbook-download-dialog
        [name]="presenter.downloadName()"
        [initial]="presenter.printOptions()"
        [showSongOrder]="presenter.isDownloadAllSongs()"
        [busy]="presenter.isBusy()"
        [progress]="presenter.downloadProgress()"
        (chosen)="presenter.download($event)"
        (closed)="presenter.cancelDownload()"
      />
    }

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
      display: block;
      block-size: 100%;
    }

    .pane {
      display: flex;
      flex-direction: column;
      block-size: 100%;
    }

    .list {
      flex: 1;
      min-block-size: 0;
    }

    .title-page {
      block-size: 100%;
    }

    .hint {
      margin: 0;
      padding: var(--space-3);
      border-block-start: 1px solid var(--border);
      font-size: var(--text-sm);
      color: var(--text-faint);
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
  protected readonly ui = inject(UiStore);
  protected readonly viewport = inject(Viewport);
  protected readonly presenter = inject(SongbooksPresenter);

  protected readonly capabilities = SONGBOOK_LIST_CAPABILITIES;

  protected readonly title = $localize`:@@songbooks.title:Songbooks`;
  protected readonly addLabel = $localize`:@@songbooks.add:New songbook`;
  protected readonly emptyText = $localize`:@@songbooks.empty:No songbooks yet. Create one to group songs for a set.`;
  protected readonly deleteTitle = $localize`:@@songbooks.delete.title:Delete this songbook?`;
  protected readonly keepsSongsText = $localize`:@@songbooks.delete.keeps:The songs themselves stay in your library.`;
  protected readonly cancelLabel = $localize`:@@songbooks.cancel:Cancel`;
  protected readonly deleteLabel = $localize`:@@songbooks.deleteAction:Delete`;

  protected deleteQuestion(pending: PendingSongbookDelete): string {
    return $localize`:@@songbooks.delete.question:“${pending.name}:name:” and its ${pending.count}:count: entries will be removed.`;
  }

  /** The list is never empty — All songs is always in it — so "no songbooks
   * yet" is about the ones you make. */
  protected readonly hasOnlyVirtual = computed(
    () => this.presenter.rows().length === 1,
  );

  constructor() {
    // Once, on entry. Not an `effect`: nothing here depends on a signal
    // changing — it is the initial fetch, and re-running it on every store
    // write would re-read the whole library to recount one row.
    void this.presenter.load();
  }
}
