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
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { Button, Dialog, Field, Icon, Tooltip } from '../primitives';
import {
  ActionBar,
  BlankPage,
  SplitPane,
  UiStore,
  Viewport,
} from '../shared/layout';
import { registerShortcuts } from '../shared/keyboard';
import { SettingsPanel } from '../shared/settings-panel';
import {
  SONGBOOK_LIST_CAPABILITIES,
  SongExplorer,
} from '../shared/song-explorer';
import { SongbookPreview } from '../shared/songbook-preview';
import { SongbookPrintFields } from '../shared/songbook-print-fields';
import { SongOrderFields } from '../shared/song-order-fields';
import { ImportPanel, SongbookDownloadDialog } from '../shared/transfer';
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
    SongbookPreview,
    SongbookPrintFields,
    SongOrderFields,
    SongbookDownloadDialog,
    ImportPanel,
    SettingsPanel,
    Button,
    Dialog,
    Field,
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

          <!-- Import a file here too: it can bring songbooks (and the songs they
               hold), so the Songbooks module offers the same door the Songs
               module does. Pushed to the far end, away from "New songbook". -->
          <button
            appButton
            type="button"
            class="import"
            [isIconOnly]="true"
            [disabled]="presenter.isBusy()"
            [attr.aria-label]="importLabel"
            [appTooltip]="importLabel"
            data-testid="songbooks-import"
            (click)="importPanel.pick()"
          >
            <app-icon name="import" />
          </button>
        </app-action-bar>

        <!-- The same list component again, a fourth capability set: no
             checkboxes (nothing acts on several songbooks at once yet), no
             search (a library has hundreds of songs and a handful of books),
             and edit, rename, duplicate and a ⋯ on the row. -->
        <app-song-explorer
          class="list"
          rowTestid="songbook-row"
          [rows]="presenter.rows()"
          [capabilities]="capabilities"
          [currentId]="presenter.currentId()"
          [emptyText]="emptyText"
          (loadMore)="presenter.loadMore()"
          (activated)="presenter.select($event)"
          (opened)="openSongbook($event)"
          (performed)="presenter.perform($event)"
          (renamed)="presenter.rename($event.id, $event.name)"
          (duplicated)="presenter.duplicate($event)"
          (downloaded)="presenter.openDownloadRow($event)"
          (configured)="presenter.openSettings($event)"
          (deleted)="presenter.requestDelete($event[0])"
        />

        <!-- The list is never empty — All songs is always in it — so the
             "nothing here yet" line is about the books YOU make, and sits under
             the list rather than replacing it. -->
        @if (hasOnlyVirtual()) {
          <p class="hint" data-testid="songbooks-empty">{{ emptyText }}</p>
        }

        <!-- The picked book's settings, opened from its row's ⋯ — the same
             fields and the same panel the builder mounts, on a book you have not
             opened. Its structure mirrors the builder's dialog
             (songbook-detail.page); the presenter it binds to is this list's.

             Centred on pane A with NO backdrop, exactly as the song editor's
             render settings are (PRD-UI-SHELL.md §4), and for the same reason:
             pane B is the book's print preview, so every one of these fields —
             the title-page style above all — is something you set while watching
             what it does. A scrim over that would dim the only thing worth
             looking at, and the preview stays scrollable while the dialog is
             open. -->
        @if (presenter.isSettingsOpen()) {
          <app-dialog
            mode="container"
            [title]="settingsLabel"
            data-testid="songbook-settings-dialog"
            (closed)="presenter.closeSettings()"
          >
            <!-- Title-page fields and the render cascade are a record's business; the
                 virtual All songs has none, so its dialog is the print section alone. -->
            @if (!presenter.isSettingsAllSongs()) {
              <section class="fields">
                <div class="fields-head">
                  <h3 class="fields-title">{{ titlePageHeading }}</h3>
                  <button
                    appButton
                    type="button"
                    class="fields-hint"
                    [isIconOnly]="true"
                    [appTooltip]="titlePageHelp"
                    appTooltipTrigger="help"
                    [attr.aria-label]="titlePageHelp"
                    data-testid="songbook-titlePage-hint"
                  >
                    <app-icon name="help" />
                  </button>
                </div>

                @for (field of titleFieldDefs; track field.key) {
                  <label class="field">
                    <span class="field-label">{{ field.label }}</span>
                    <input
                      appField
                      type="text"
                      [value]="presenter.titleFields()[field.key]"
                      [attr.data-testid]="'songbook-' + field.key"
                      (change)="setField(field.key, $event)"
                    />
                  </label>
                }
              </section>
            }

            <!-- The book's print structure — set here, drawn by the download and the
                 preview. For All songs this is (with the order below) the whole dialog. -->
            <section class="fields">
              <h3 class="fields-title">{{ printHeading }}</h3>
              <app-songbook-print-fields
                [print]="presenter.songbookPrint()"
                (changed)="presenter.setPrint($event)"
              />
            </section>

            <!-- The order All songs is arranged in — its alone, because a real book's
                 order is its content. It rode in the download dialog before. -->
            @if (presenter.isSettingsAllSongs()) {
              <section class="fields">
                <h3 class="fields-title">{{ orderHeading }}</h3>
                <app-song-order-fields
                  [order]="presenter.allSongsOrder()"
                  (changed)="presenter.setAllSongsOrder($event)"
                />
              </section>
            }

            @if (!presenter.isSettingsAllSongs()) {
              <app-settings-panel
                scope="songbook"
                [values]="presenter.songbookSettings()"
                [inherited]="presenter.inheritedSettings()"
                (changed)="presenter.patchSettings($event)"
              />
            }
          </app-dialog>
        }
      </div>

      <!-- Pane B: the picked songbook's whole **print preview** — every page its
           PDF would hold, scrolled through and zoomable by column count
           (app-songbook-preview). It used to be only the title page.

           The neared event is the pane saying which sheets are close enough to
           be worth drawing; the presenter draws those and no others.

           Blank with nothing picked: the empty paper is the honest picture of
           "nothing to print here", and the row already says what it holds. -->
      @if (presenter.currentId()) {
        <app-songbook-preview
          pane-b
          [bookId]="presenter.currentId()"
          [preview]="presenter.preview()"
          [isDark]="presenter.isSongDark()"
          (darkToggled)="presenter.toggleSongDark()"
          (neared)="presenter.needSheets($event)"
        />
      } @else {
        <app-blank-page pane-b [isDark]="presenter.isSongDark()" />
      }
    </app-split-pane>

    @if (presenter.isDownloadOpen()) {
      <app-songbook-download-dialog
        [name]="presenter.downloadName()"
        [initial]="presenter.downloadInitial()"
        [busy]="presenter.isBusy()"
        [progress]="presenter.downloadProgress()"
        [isShareLinkReady]="presenter.isShareLinkReady()"
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

    <!-- Just the file input; the Import button above opens its picker. The
         preview and error dialogs belong to the shell, because a drop or a link
         can arrive with no page to own them (plan §7). -->
    <app-import-panel
      #importPanel
      inputTestid="songbooks-import-input"
      (picked)="presenter.readImport($event)"
    />
  `,
  styles: `
    :host {
      display: block;
      block-size: 100%;
    }

    /* Import sits at the far end of the action row, away from the primary. */
    .import {
      margin-inline-start: auto;
    }

    /* Positioned, because the settings dialog centres on it: container mode
       places the panel against the nearest positioned ancestor, and without this
       it would find the screen instead and read as a modal that forgot its
       scrim. Coupled to the dialog above — move one, check the other. */
    .pane {
      position: relative;
      display: flex;
      flex-direction: column;
      block-size: 100%;
    }

    .list {
      flex: 1;
      min-block-size: 0;
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

    /* The settings dialog's title-page fields — mirrors the builder's dialog. */
    .fields {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      padding: 0 var(--space-3) var(--space-3);
      border-block-end: 1px solid var(--border);
    }

    /* A section that follows another stands off the rule above it. Only that
       one: the first section is spaced from the dialog's title by the panel's
       own gap, and padding here would double it. */
    .fields + .fields {
      padding-block-start: var(--space-3);
    }

    /* The heading and its (?) hint, on one line. */
    .fields-head {
      display: flex;
      align-items: center;
      gap: var(--space-1);
    }

    .fields-title {
      margin: 0;
      font-size: var(--text-xs);
      font-weight: 500;
      color: var(--text-faint);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .fields-hint {
      --icon-size: 14px;
      block-size: 24px;
      min-inline-size: 24px;
      flex: none;
      color: var(--text-faint);
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .field-label {
      font-size: var(--text-sm);
    }
  `,
})
export class SongbooksPage {
  protected readonly ui = inject(UiStore);
  protected readonly viewport = inject(Viewport);
  protected readonly presenter = inject(SongbooksPresenter);

  private readonly list = viewChild(SongExplorer);

  protected readonly capabilities = SONGBOOK_LIST_CAPABILITIES;

  protected readonly title = $localize`:@@songbooks.title:Songbooks`;
  protected readonly addLabel = $localize`:@@songbooks.add:New songbook`;
  protected readonly importLabel = $localize`:@@songbooks.import:Import from a file`;
  protected readonly emptyText = $localize`:@@songbooks.empty:No songbooks yet. Create one to group songs for a set.`;
  protected readonly deleteTitle = $localize`:@@songbooks.delete.title:Delete this songbook?`;
  protected readonly keepsSongsText = $localize`:@@songbooks.delete.keeps:The songs themselves stay in your library.`;
  protected readonly cancelLabel = $localize`:@@songbooks.cancel:Cancel`;
  protected readonly deleteLabel = $localize`:@@songbooks.deleteAction:Delete`;

  // The settings dialog's strings — the SAME message ids the builder's dialog
  // uses (songbook-detail.page), so the two never drift and the translation is
  // authored once.
  protected readonly settingsLabel = $localize`:@@songbooks.settings:Songbook settings`;
  protected readonly titlePageHeading = $localize`:@@songbooks.titlePage:Title page`;
  protected readonly titlePageHelp = $localize`:@@songbooks.titlePage.help:Printed on the songbook's title page. Separate from any song's own title.`;
  protected readonly printHeading = $localize`:@@songbooks.print:Print`;
  protected readonly orderHeading = $localize`:@@songbookDownload.order:Song order`;

  /** The book's own metadata — authored here, never parsed (ADR-0001). */
  protected readonly titleFieldDefs = [
    {
      key: 'title' as const,
      label: $localize`:@@songbooks.field.title:Title`,
    },
    {
      key: 'subtitle' as const,
      label: $localize`:@@songbooks.field.subtitle:Subtitle`,
    },
    {
      key: 'author' as const,
      label: $localize`:@@songbooks.field.author:Author`,
    },
  ];

  protected setField(key: 'title' | 'subtitle' | 'author', event: Event): void {
    void this.presenter.setTitleField(
      key,
      (event.target as HTMLInputElement).value,
    );
  }

  protected deleteQuestion(pending: PendingSongbookDelete): string {
    return $localize`:@@songbooks.delete.question:“${pending.name}:name:” and its ${pending.count}:count: entries will be removed.`;
  }

  /** The list is never empty — All songs is always in it — so "no songbooks
   * yet" is about the ones you make. */
  protected readonly hasOnlyVirtual = computed(
    () => this.presenter.rows().length === 1,
  );

  /**
   * Step from the list into the builder. The page's job in this is the one thing
   * the presenter cannot do: **measure the list's scroll**, so a return from the
   * builder lands on the songbook that was opened (see `ListScrollMemory`).
   */
  protected openSongbook(id: string): void {
    this.presenter.open(id, this.list()?.getScrollOffset() ?? 0);
  }

  constructor() {
    // The list knows how to open, rename and delete a row; making one is the
    // page's, so the key for it is too.
    registerShortcuts({
      name: this.title,
      actions: computed(() => [
        {
          id: 'songbooks.create',
          label: this.addLabel,
          keys: ['KeyN'],
          run: () => void this.presenter.create(),
        },
      ]),
    });

    // Once, on entry. Not an `effect`: nothing here depends on a signal
    // changing — it is the initial fetch, and re-running it on every store
    // write would re-read the whole library to recount one row.
    void this.presenter.load();

    // Lay the remembered scroll back on after a return from the builder. The
    // offset means nothing until the list has rows to scroll through, so this
    // waits for the window to arrive, defers past the current change-detection
    // and then clears the pending mark (which stops the effect re-firing).
    effect(() => {
      const offset = this.presenter.pendingScroll();
      if (offset === null || this.presenter.rows().length === 0) {
        return;
      }
      setTimeout(() => {
        this.list()?.scrollToOffset(offset);
        this.presenter.clearPendingScroll();
      });
    });
  }
}
