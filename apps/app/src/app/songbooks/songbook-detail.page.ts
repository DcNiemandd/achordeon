// Songbook detail page — Epic 6 ▸ subtasks 2–6
// Spec: PRD-UI-SHELL.md §4 (pane A: song explorer, pane B: songbook entries)
//
// This is the songbook builder. Epic 5's in-use delete warning links straight
// here — CONTEXT.md §Delete vs Remove promises "a link that opens the Songbook
// and auto-selects the Song" — so the song is already current when this mounts.

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { CdkDropListGroup } from '@angular/cdk/drag-drop';
import { Router, RouterLink } from '@angular/router';
import { Button, Dialog, Field, Icon, Tooltip } from '../primitives';
import {
  ActionBar,
  BlankPage,
  DocumentTitle,
  SplitPane,
  UiStore,
  Viewport,
} from '../shared/layout';
import { SongRender } from '../shared/song-render';
import { SettingsPanel } from '../shared/settings-panel';
import { SongbookPrintFields } from '../shared/songbook-print-fields';
import {
  ENTRY_CAPABILITIES,
  REDUCED_CAPABILITIES,
  SelectionStatus,
  SongExplorer,
  toExplorerSort,
  toExplorerSortDir,
  type ExplorerCapabilities,
  type ExplorerSort,
  type RowDrop,
} from '../shared/song-explorer';
import { SongbookDownloadDialog } from '../shared/transfer';
import type { InsertPosition } from './entry-ops';
import { SongbookDetailPresenter } from './songbook-detail.presenter';

/**
 * The library on the left, the songbook on the right (§4).
 *
 * Pane A is the **same** `<app-song-explorer>` the Songs module mounts, at
 * reduced capability: search, sort, select and favorite stay; edit, rename,
 * duplicate and delete go. You are picking songs here, not administering them —
 * renaming a song from inside a songbook edits the *library*, which is a
 * different job in a different module (CONTEXT.md §Song explorer).
 *
 * Only a stored songbook opens here. The virtual All songs used to as well, as a
 * single pane listing the library under a songbook's heading — but it is not
 * openable any more, and the order it performs in is asked for in the Stage
 * picker, so there is nothing left for that screen to have done.
 */
@Component({
  selector: 'app-songbook-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SongbookDetailPresenter],
  host: { '(document:keydown.escape)': 'onEscape($event)' },
  imports: [
    NgTemplateOutlet,
    CdkDropListGroup,
    RouterLink,
    ActionBar,
    BlankPage,
    SplitPane,
    SongExplorer,
    SongRender,
    SelectionStatus,
    SettingsPanel,
    SongbookPrintFields,
    SongbookDownloadDialog,
    Button,
    Dialog,
    Field,
    Icon,
    Tooltip,
  ],
  template: `
    <!-- **Never a tab switcher**: the two panes are a pair, not alternatives —
         you move rows from one to the other, and a tab that hides the
         destination is a transfer list you cannot transfer across. So they sit
         side by side until there is genuinely no room, and then stack. -->
    <!-- **The group has to enclose the ng-template below, not just the panes**
         [trap]. It is what connects the two lists so a row can cross between
         them, and the CDK finds it by injector — which for a template follows
         where the template is *declared*, not where it is rendered. Sitting on
         the split pane, it was invisible to the entry list every time, since
         that list is declared outside it. Which list actually *takes* a drop
         stays a capability (see canDrop), not a wiring question. -->
    <div class="screen" cdkDropListGroup>
      <app-split-pane
        narrow="stack"
        [ratio]="ui.splitRatio('songbooks')"
        (ratioChange)="ui.setSplitRatio('songbooks', $event)"
      >
        <div pane-a class="pane">
          <!-- Just the library now, and the strip that crosses songs into the
               book. The book's own header — its name and its actions — has moved
               across to pane B, where the songbook it edits actually is; on a
               phone the two panes stack, and this strip is the band between them. -->
          <div class="body" [class.is-stacked]="isStacked()">
            <div class="library">
              <!-- Top of the library, over the list it counts (the Songs module's
                   position): how many rows are picked, and Clear. Always in the
                   DOM — it holds its own row so the list never jumps when a
                   selection appears or clears; SelectionStatus simply draws
                   nothing while the count is zero. -->
              <div class="library-head">
                <app-selection-status
                  [count]="presenter.selectedIds().size"
                  (cleared)="presenter.clearSelection()"
                />
              </div>

              <app-song-explorer
                #libraryList
                class="explorer"
                [rows]="presenter.rows()"
                [capabilities]="capabilities"
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
                (selectToggled)="presenter.toggleSelect($event)"
                (favorited)="presenter.toggleFavorite($event)"
                (previewed)="presenter.openPreviewBySong($event)"
                (droppedOut)="presenter.removeSlots([$event])"
              />
            </div>

            <!-- The crossing itself, belonging to neither list: + adds the picked
                 songs below the picked slot (or at the end), − takes the picked
                 slots out. A column against the divider on desktop; on a phone the
                 horizontal band between the stacked lists, where the reorder tools
                 join it. -->
            <div
              class="transfer"
              role="toolbar"
              [attr.aria-orientation]="isStacked() ? 'horizontal' : 'vertical'"
              [attr.aria-label]="addGroupLabel"
              data-testid="songbook-add"
            >
              <!-- Hover or focus previews the landing position: the entry list
                   draws a line where the songs would go, below the selected slot
                   or at the end. -->
              <button
                appButton
                type="button"
                variant="secondary"
                class="cross"
                [isIconOnly]="true"
                [disabled]="!hasSelection()"
                [attr.aria-label]="addAriaLabel()"
                [appTooltip]="addLabel"
                data-testid="add"
                (pointerenter)="addLandingAt.set('below')"
                (pointerleave)="addLandingAt.set(null)"
                (focus)="addLandingAt.set('below')"
                (blur)="addLandingAt.set(null)"
                (click)="presenter.addSelected('below')"
              >
                <app-icon name="plus" />
              </button>

              <!-- Pointing the other way, and answering pane B's selection: it
                   takes the ticked slots out of the book. -->
              <button
                appButton
                type="button"
                variant="secondary"
                class="cross"
                [isIconOnly]="true"
                [disabled]="!hasSlotSelection()"
                [attr.aria-label]="removeSlotsLabel"
                [appTooltip]="removeSlotsShort"
                data-testid="entry-remove-selected"
                (click)="presenter.removeSlots([...presenter.selectedSlots()])"
              >
                <app-icon name="minus" />
              </button>

              <!-- On a phone the reorder tools ride here, in the band between the
                   stacked lists; on desktop they sit on the book's header row. One
                   template, mounted in whichever place the width calls for. -->
              @if (isStacked()) {
                <ng-container [ngTemplateOutlet]="reorderTools"></ng-container>
              }
            </div>
          </div>
        </div>

        <div pane-b class="pane">
          <!-- The book's own header, moved here from pane A: its name is the
               rename field (only a stored book opens now, so it is simply on), and
               its actions sit under it. The bulk-reorder tools share that action
               row on desktop — under the title, left of the actions — and drop to
               the transfer band when the panes stack. -->
          <app-action-bar
            [title]="presenter.name()"
            [isTitleEditable]="true"
            [titleLabel]="nameLabel"
            (titleChange)="presenter.rename($event)"
          >
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

            @if (!isStacked()) {
              <ng-container [ngTemplateOutlet]="reorderTools"></ng-container>
            }

            <!-- How many slots are ticked, and Clear — the book's OWN selection,
                 kept on the header whichever pane the reorder buttons are in. -->
            <app-selection-status
              class="slot-selection"
              [count]="presenter.selectedSlots().size"
              (cleared)="presenter.clearSlotSelection()"
            />

            <!-- Perform this songbook on the Stage. A link, not a button:
                 navigating to a route is exactly what a link does. Disabled
                 (pointer-events off) when empty, and pushed to the far end of the
                 row so the actions ride right of the reorder tools. -->
            <a
              appButton
              class="push"
              [isIconOnly]="true"
              [routerLink]="
                presenter.canPerform() ? ['/stage', presenter.id()] : null
              "
              [class.is-disabled]="!presenter.canPerform()"
              [attr.aria-disabled]="!presenter.canPerform()"
              [attr.aria-label]="performLabel"
              [appTooltip]="
                presenter.canPerform() ? performLabel : cannotPerformLabel
              "
              data-testid="songbook-detail-perform"
            >
              <app-icon name="stage" />
            </a>

            <!-- Download, on the book you are already in — the same act the
                 songbook list offers, and the same dialog whose format row is
                 where the Achordeon file lives now. -->
            <button
              appButton
              type="button"
              [isIconOnly]="true"
              [disabled]="presenter.isBusy()"
              [attr.aria-label]="downloadLabel"
              [appTooltip]="downloadLabel"
              data-testid="songbook-detail-download"
              (click)="presenter.openDownload()"
            >
              <app-icon name="download" />
            </button>

            <button
              appButton
              type="button"
              [isIconOnly]="true"
              [class.is-active]="presenter.isSettingsOpen()"
              [attr.aria-pressed]="presenter.isSettingsOpen()"
              [attr.aria-label]="settingsLabel"
              [appTooltip]="settingsLabel"
              data-testid="songbook-settings"
              (click)="presenter.toggleSettings()"
            >
              <app-icon name="settings" />
            </button>
          </app-action-bar>

          @if (presenter.isDownloadOpen()) {
            <app-songbook-download-dialog
              [name]="presenter.name()"
              [initial]="presenter.downloadInitial()"
              [busy]="presenter.isBusy()"
              [progress]="presenter.downloadProgress()"
              (chosen)="presenter.download($event)"
              (closed)="presenter.cancelDownload()"
            />
          }

          <!-- The songbook's own scope of the cascade, plus the title-page fields
             that only a songbook has. A modal, unlike the editor's: there is no
             live render behind it to keep watching (§4). -->
          @if (presenter.isSettingsOpen()) {
            <app-dialog
              [title]="settingsLabel"
              data-testid="songbook-settings-dialog"
              (closed)="presenter.closeSettings()"
            >
              <section class="fields">
                <!-- The help is a (?) hint beside the heading, not a paragraph
                     under it: the fields say what they are, and the one thing
                     worth adding — that this is the book's OWN title, not a
                     song's — is a tip for whoever wonders, not a line everyone
                     re-reads. -->
                <div class="fields-head">
                  <h3 class="fields-title">{{ titlePageHeading }}</h3>
                  <button
                    appButton
                    type="button"
                    class="hint"
                    [isIconOnly]="true"
                    [appTooltip]="titlePageHelp"
                    appTooltipTrigger="help"
                    [attr.aria-label]="titlePageHelp"
                    data-testid="songbook-titlePage-hint"
                  >
                    <app-icon name="help" />
                  </button>
                </div>

                @for (field of titleFields; track field.key) {
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

              <!-- The book's print structure — the SAME control the download
                   dialog mounts, on the same SongbookPrint on the record. -->
              <section class="fields">
                <h3 class="fields-title">{{ printHeading }}</h3>
                <app-songbook-print-fields
                  [print]="presenter.songbookPrint()"
                  (changed)="presenter.setPrint($event)"
                />
              </section>

              <!-- The SAME panel the Settings page and the song editor mount, at
                 songbook scope: chord colour and size re-theme every song
                 performed in this book (CONTEXT.md §Render settings). -->
              <app-settings-panel
                scope="songbook"
                [values]="presenter.songbookSettings()"
                [inherited]="presenter.inheritedSettings()"
                (changed)="presenter.patchSettings($event)"
              />
            </app-dialog>
          }

          <!-- Find-and-jump over the book's own order: a slim row that never
               filters the list (that would hide slots the user can see) — it
               moves a read-only cursor to the matching slot and scrolls it into
               view. Typing jumps to the first match; ↓/Enter and ↑ step with a
               wrap; Esc clears. The counter and the greyed prev/next answer
               "where am I / is there anything". -->
          <div class="entry-search" role="search">
            <div class="entry-search-box">
              <app-icon name="search" class="entry-search-icon" />
              <input
                #searchInput
                appField
                type="search"
                class="entry-search-input"
                [class.has-value]="!!presenter.searchTerm()"
                data-testid="entry-search"
                [value]="presenter.searchTerm()"
                [attr.placeholder]="entrySearchLabel"
                [attr.aria-label]="entrySearchLabel"
                (input)="onSearchInput($event)"
                (keydown)="onSearchKeydown($event)"
              />
              @if (presenter.searchTerm()) {
                <button
                  appButton
                  type="button"
                  class="entry-search-clear"
                  [isIconOnly]="true"
                  [attr.aria-label]="clearSearchLabel"
                  [appTooltip]="clearSearchLabel"
                  data-testid="entry-search-clear"
                  (click)="clearSearch(searchInput)"
                >
                  <app-icon name="close" />
                </button>
              }
            </div>
            <!-- Always a number pair, never words: "-/-" idle, "-/0" for a query
                 with no hit, "1/5" on a match. A dash where there is nothing to
                 count keeps the two slots present so the width never jumps. -->
            <span class="entry-search-count" data-testid="entry-search-count">
              {{ presenter.matchPosition().current || '-' }}/{{
                presenter.searchTerm() ? presenter.matchPosition().total : '-'
              }}
            </span>
            <button
              appButton
              type="button"
              variant="secondary"
              [isIconOnly]="true"
              [disabled]="presenter.matchPosition().total === 0"
              [attr.aria-label]="entrySearchPrevLabel"
              [appTooltip]="entrySearchPrevLabel"
              data-testid="entry-search-prev"
              (click)="presenter.prevMatch()"
            >
              <app-icon name="moveUp" />
            </button>
            <button
              appButton
              type="button"
              variant="secondary"
              [isIconOnly]="true"
              [disabled]="presenter.matchPosition().total === 0"
              [attr.aria-label]="entrySearchNextLabel"
              [appTooltip]="entrySearchNextLabel"
              data-testid="entry-search-next"
              (click)="presenter.nextMatch()"
            >
              <app-icon name="moveDown" />
            </button>
          </div>

          <app-song-explorer
            #entryList
            class="entries"
            data-testid="songbook-detail"
            rowTestid="entry-row"
            [rows]="presenter.entries()"
            [capabilities]="entryCapabilities()"
            [selectedIds]="presenter.selectedSlots()"
            [currentId]="presenter.currentSlot()"
            [insertAt]="previewIndex()"
            [emptyText]="entriesEmptyText"
            (selectToggled)="presenter.toggleSelectSlot($event)"
            (activated)="presenter.activateSlot($event)"
            (removed)="presenter.removeSlots($event)"
            (moved)="presenter.moveSlot($event.id, $event.where)"
            (previewed)="presenter.openPreviewBySlot($event)"
            (dropped)="onDropped($event)"
          />
        </div>
      </app-split-pane>

      <!-- The bulk-reorder tools, in one place and mounted in whichever home the
           width calls for — the book's header row on desktop, the transfer band on
           a phone. With nothing ticked the buttons are dead and the group carries
           the reason as a tooltip (a line no longer takes a whole row); with a
           selection the group tooltip goes quiet and each button names its move. -->
      <ng-template #reorderTools>
        <div
          class="reorder"
          role="toolbar"
          [attr.aria-label]="reorderGroupLabel"
          [appTooltip]="hasSlotSelection() ? '' : slotSelectionLabel"
          data-testid="entry-tools"
        >
          @for (option of moveOptions; track option.where) {
            <button
              appButton
              type="button"
              variant="secondary"
              [isIconOnly]="true"
              [disabled]="!hasSlotSelection()"
              [attr.aria-label]="option.label"
              [appTooltip]="option.label"
              [attr.data-testid]="'move-' + option.where"
              (click)="presenter.moveSelected(option.where)"
            >
              <app-icon [name]="option.icon" />
            </button>
          }
        </div>
      </ng-template>

      <!-- Look at a song without leaving the builder. A modal (scrim, centred on
           the window): unlike the editor's settings there is no live render
           behind it to keep watching — the render IS what this is showing. Its
           open song rides in the URL (?preview=), so an Edit press and a Close in
           the editor bring it straight back. The two acts the dialog offers:
           **Edit** steps through to the song's own editor, **Close** takes the
           dialog down; the header X is the same Close by another route. -->
      @if (presenter.previewSong()) {
        <app-dialog
          size="large"
          [title]="presenter.previewName()"
          data-testid="song-preview-dialog"
          (closed)="presenter.closePreview()"
        >
          <div class="song-preview">
            <app-blank-page [ratio]="presenter.previewAspect()">
              <app-song-render [svg]="presenter.previewSvg()" />
            </app-blank-page>
          </div>

          <!-- Each button carries the dialog-actions attribute itself, so they are
               direct flex children of the dialog's footer and line up on one row.
               Wrapped in a div they were inline items in a non-flex box, aligned by
               baseline — and the icon on Edit dragged it out of line with Close. -->
          <button
            dialog-actions
            appButton
            type="button"
            variant="secondary"
            data-testid="song-preview-close"
            (click)="presenter.closePreview()"
          >
            {{ previewCloseLabel }}
          </button>
          <!-- The way in: it carries the book's whole view along (ticks, scroll,
               the dialog itself) so closing the editor lands back here unchanged
               — see the presenter's editPreview. The page hands it the two lists'
               scroll offsets, the one thing only it can measure. -->
          <button
            dialog-actions
            appButton
            type="button"
            variant="primary"
            data-testid="song-preview-edit"
            (click)="editFromPreview()"
          >
            <app-icon name="edit" />
            {{ previewEditLabel }}
          </button>
        </app-dialog>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      block-size: 100%;
    }

    /* The drag group's element, which must not become a layout of its own. */
    .screen {
      block-size: 100%;
    }

    .pane {
      display: flex;
      flex-direction: column;
      block-size: 100%;
      min-block-size: 0;
    }

    /* The library beside the transfer strip. When the panes stack (a phone) this
       turns on its side: the library above, the transfer strip the horizontal
       band beneath it, hard against the seam. */
    .body {
      flex: 1;
      min-block-size: 0;
      display: flex;
      min-inline-size: 0;
    }

    .body.is-stacked {
      flex-direction: column;
    }

    /* The library column: its own selection strip, then the list. */
    .library {
      flex: 1;
      min-inline-size: 0;
      min-block-size: 0;
      display: flex;
      flex-direction: column;
    }

    /* Over the list it counts (the Songs module's position). Only in the DOM
       while something is picked, so it never sits as an empty rule. */
    .library-head {
      flex: none;
      display: flex;
      align-items: center;
      /* 32px for the Clear button + its own 1px border-block-end, so the empty
         head is exactly as tall as the one holding the button — no 1px jump when
         a selection appears or clears (border-box eats the border otherwise). */
      min-block-size: 33px;
      padding-inline: var(--space-3);
      border-block-end: 1px solid var(--border);
    }

    .explorer {
      flex: 1;
      min-block-size: 0;
      min-inline-size: 0;
    }

    .entries {
      flex: 1;
      min-block-size: 0;
    }

    /* The always-visible find-and-jump row, hard above the entry list. Slim so it
       reads as an accessory to the list, not a second header. */
    .entry-search {
      flex: none;
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-1) var(--space-2);
      border-block-end: 1px solid var(--border);
    }

    /* Icon and clear button live inside the field, sitting over it — the same
       look as the explorer's search (they read as one control). */
    .entry-search-box {
      position: relative;
      flex: 1;
      min-inline-size: 0;
      display: flex;
      align-items: center;
    }

    .entry-search-icon {
      --icon-size: 14px;
      position: absolute;
      inset-inline-start: var(--space-2);
      color: var(--text-faint);
      pointer-events: none;
    }

    .entry-search-input {
      inline-size: 100%;
      min-inline-size: 0;
      padding-inline-start: var(--space-5);
    }

    /* Room for the clear button, so a long query does not run under it. */
    .entry-search-input.has-value {
      padding-inline-end: var(--space-5);
    }

    .entry-search-clear {
      --icon-size: 14px;
      position: absolute;
      inset-inline-end: 2px;
      block-size: 28px;
      color: var(--text-faint);
    }

    /* The type="search" widget's native WebKit clear button — ours replaces it. */
    .entry-search-input::-webkit-search-cancel-button {
      display: none;
    }

    /* The "n / m" / no-match state. Tabular figures so the count does not jiggle
       as the cursor steps, and it holds a stable width beside the buttons. */
    .entry-search-count {
      flex: none;
      /* Reserve the width of the widest pair ("100/100") so the prev/next buttons
         never shift as the count grows; tabular figures keep it from jiggling
         digit-to-digit, and it sits centred in that fixed slot. */
      min-inline-size: 7ch;
      text-align: center;
      font-size: var(--text-sm);
      color: var(--text-faint);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    /* Between the two lists, hard against the divider — the buttons belong to
       neither list, they are the crossing. A column dropped a good way down the
       pane so it reads as a deliberate mid-height handle rather than another item
       at the top of the search box. */
    .transfer {
      flex: none;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      /* The same 2px the reorder group uses, so + / − sit as tightly together as
         the move buttons do — one gap across every button in the strip. */
      gap: 2px;
      padding: var(--space-2);
      padding-block-start: 25dvh;
      border-inline-start: 1px solid var(--border);
      background: var(--surface-raised);
    }

    /* Stacked: the strip is the horizontal band under the library, so it lays its
       buttons in a centred row against the top border rather than a column down a
       side one, and the reorder tools sit in it too — set well apart from the
       add/remove pair. */
    .body.is-stacked .transfer {
      flex-direction: row;
      align-items: center;
      justify-content: center;
      padding: var(--space-2);
      border-inline-start: none;
      border-block-start: 1px solid var(--border);
    }

    .cross app-icon {
      --icon-size: 17px;
    }

    /* The bulk-reorder group: a tight row of icon buttons, on the header (desktop)
       or in the transfer band (phone). In the band it follows the − with a gap. */
    .reorder {
      display: flex;
      align-items: center;
      gap: 2px;
    }

    .body.is-stacked .reorder {
      margin-inline-start: var(--space-6);
    }

    /* The book's actions ride at the far end of the header row, right of the
       reorder tools and the slot count. */
    .push {
      margin-inline-start: auto;
    }

    .fields {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      padding: 0 var(--space-3) var(--space-3);
      border-block-end: 1px solid var(--border);
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

    .hint {
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

    /* The framed render inside the preview dialog. It fills the panel's body —
       the dialog itself is now shaped like an A4 sheet (see the size-large panel),
       so this just takes all the room between the title bar and the buttons and
       lets BlankPage fit the page into it. */
    .song-preview {
      block-size: 100%;
    }
  `,
})
export class SongbookDetailPage {
  protected readonly ui = inject(UiStore);
  protected readonly presenter = inject(SongbookDetailPresenter);
  private readonly router = inject(Router);
  private readonly viewport = inject(Viewport);

  /**
   * Are the two panes stacked (a phone), rather than side by side?
   *
   * The one fact the layout forks on: the bulk-reorder tools sit on the book's
   * header row when there is room to, and drop into the transfer band between the
   * stacked lists when there is not. `narrow="stack"` on the split pane and this
   * ask the same viewport question, so the two never disagree about which it is.
   */
  protected readonly isStacked = this.viewport.isStacked;

  /**
   * Escape leaves the songbook for the list of them — **the editor's gesture,
   * because this is the editor's shape**: a thing you opened from a list, worked
   * in, and step back out of.
   *
   * Guarded the same way, and for the same reasons. The settings dialog closes
   * first and stops there, so one key never throws you out of the screen
   * entirely. A press that came from a text field is left to the field, where
   * Escape already means "undo this edit" — the songbook's name in the heading,
   * the title-page fields, the search box. The guard reads the event's
   * **target** rather than `document.activeElement`, because a field that blurs
   * itself on Escape would otherwise look like a bare press.
   */
  protected onEscape(event: Event): void {
    // The preview dialog traps focus and stops its own Escape, so this rarely
    // fires with it open — but if it does, the dialog is the smaller thing to
    // close first, exactly as the settings dialog is.
    if (this.presenter.previewSong()) {
      event.preventDefault();
      this.presenter.closePreview();
      return;
    }
    if (this.presenter.isSettingsOpen()) {
      this.presenter.closeSettings();
      return;
    }
    const target = event.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    ) {
      return;
    }
    event.preventDefault();
    void this.router.navigate(['/songbooks']);
  }

  /** `/songbooks/:id`, delivered by `withComponentInputBinding()`. */
  readonly id = input.required<string>();

  /**
   * `?q=` / `?sort=` / `?dir=` / `?fav=`, from the URL. No `?pane=`: this
   * screen never hides a pane behind a switcher, so there is none to name. Raw strings in and
   * narrowed here: router input binding sets every declared input on each
   * navigation, so an absent param arrives as an explicit `undefined` that would
   * overwrite an `input()` default (see the songs page for the trap).
   */
  readonly q = input<string | undefined>();
  readonly sort = input<string | undefined>();
  readonly dir = input<string | undefined>();
  readonly fav = input<string | undefined>();
  /**
   * `?preview=<songId>` — which song's render the dialog is showing, or nothing.
   * It is in the URL and not a private signal on purpose: the dialog must reopen
   * after a round trip to the editor, and the address bar is what carries state
   * across that (§7). An unknown id simply renders nothing and the fetch clears
   * the dialog, so it is not narrowed here the way the sort axis is.
   *
   * The name is the param's, unaliased (aliasing an input is banned): the
   * Add-button landing hint that was once also called `preview` is now
   * `addLandingAt`, so this can carry the route param's own name.
   */
  readonly preview = input<string | undefined>();

  /** The two lists, so their scroll offset can be captured before an Edit and
   * laid back on after the return. Both are always in the DOM (the split pane
   * hides a pane, it does not unmount it), so the refs are always resolvable. */
  private readonly libraryList = viewChild<SongExplorer>('libraryList');
  private readonly entryList = viewChild<SongExplorer>('entryList');

  protected readonly query = computed(() => this.q() ?? '');
  protected readonly sortKey = computed<ExplorerSort>(
    () => toExplorerSort(this.sort()) ?? 'name',
  );
  protected readonly sortDir = computed(() => toExplorerSortDir(this.dir()));
  protected readonly isFavoritesFirst = computed(() => this.fav() === '1');
  /** The Songbooks panel's capability set: identity/destructive actions off. */
  protected readonly capabilities = REDUCED_CAPABILITIES;

  /**
   * A stored book's slots: numbered and arrangeable — but the inline per-row move
   * buttons stand down once the row is too narrow to carry them (below
   * `--bp-row-reorder`, ~1000px), leaving the drag handle and the bulk-reorder
   * strip to change the order. `canReorder` is the flag those buttons hang on, so
   * the width toggles exactly them and nothing else.
   */
  protected readonly entryCapabilities = computed<ExplorerCapabilities>(() => ({
    ...ENTRY_CAPABILITIES,
    canReorder: !this.viewport.isRowReorderHidden(),
  }));

  protected readonly performLabel = $localize`:@@songbooks.perform:Perform this songbook`;
  protected readonly cannotPerformLabel = $localize`:@@songbooks.cannotPerform:Add songs before performing`;
  protected readonly backLabel = $localize`:@@songbooks.back:Back to songbooks`;
  protected readonly previewCloseLabel = $localize`:@@songbooks.previewClose:Close`;
  protected readonly previewEditLabel = $localize`:@@songbooks.previewEdit:Edit song`;
  protected readonly nameLabel = $localize`:@@songbooks.name:Songbook name`;
  protected readonly settingsLabel = $localize`:@@songbooks.settings:Songbook settings`;
  /** No longer "as a PDF": the dialog behind it offers a PDF, a ZIP of images
   * and the Achordeon file, and a tooltip that names one of the three would be
   * wrong twice out of three times. */
  protected readonly downloadLabel = $localize`:@@songbooks.download:Download this songbook`;
  protected readonly titlePageHeading = $localize`:@@songbooks.titlePage:Title page`;
  protected readonly titlePageHelp = $localize`:@@songbooks.titlePage.help:Printed on the songbook's title page. Separate from any song's own title.`;
  protected readonly printHeading = $localize`:@@songbooks.print:Print`;

  /** The songbook's own metadata — authored here, never parsed (ADR-0001). */
  protected readonly titleFields = [
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

  protected readonly emptyText = computed(() =>
    this.query()
      ? $localize`:@@songs.noMatches:No songs match your search.`
      : $localize`:@@songs.empty:No songs yet. Create one to get started.`,
  );

  protected readonly hasSelection = computed(
    () => this.presenter.selectedIds().size > 0,
  );

  protected readonly addGroupLabel = $localize`:@@songbooks.addGroup:Add to the songbook`;

  /**
   * Which Add button the pointer or focus is on, so the entry list can show
   * where its songs would land. Null when nothing is hovered.
   *
   * Named `addLandingAt`, not `preview`: that name now belongs to the route
   * param that opens the song-render dialog (a different preview entirely — which
   * song to *look at*, not where one would *land*).
   */
  protected readonly addLandingAt = signal<InsertPosition | null>(null);

  protected readonly previewIndex = computed(() => {
    const where = this.addLandingAt();
    return where === null ? null : this.presenter.insertAt(where);
  });

  /**
   * One Add button, not four. It puts the picked songs **below the picked slot,
   * or at the end** when none is picked — the one landing you reach for, and the
   * one the reorder buttons then let you nudge from. `'below'` is the position it
   * always asks for; `insertionIndex` is what turns that into "below selected or
   * at the end" (see `entry-ops`).
   *
   * The tooltip is only the act: a pointer user sees the landing line drawn in
   * the entry list beside them, so a position in words would be noise.
   */
  protected readonly addLabel = $localize`:@@songbooks.addBelowShort:Add below selected`;

  /**
   * The accessible name — the act **and where it lands**.
   *
   * A screen-reader user has no line to look at, so the resolved slot number
   * stays here (per WCAG 2.5.3 the visible tooltip text is contained in it). A
   * null landing means nothing is picked and the button does nothing, so there is
   * nothing beyond the act to honestly promise.
   */
  protected addAriaLabel(): string {
    const at = this.presenter.insertAt('below');
    return at === null
      ? this.addLabel
      : $localize`:@@songbooks.addAt:${this.addLabel}:action: — lands at ${at + 1}:position:`;
  }

  /**
   * A drop on the entry list, sent to whichever command it means.
   *
   * The list reports where it landed and which side it came from; the id-space
   * follows from that — a song from the library, a slot key from itself — and
   * nothing else here knows both. The commands are the buttons' own, so a drag
   * cannot grow behaviour a press does not have.
   */
  protected onDropped(drop: RowDrop): void {
    void (drop.isSameList
      ? this.presenter.dropReorder(drop.id, drop.at)
      : this.presenter.dropIntoEntries(drop.id, drop.at));
  }

  protected readonly hasSlotSelection = computed(
    () => this.presenter.selectedSlots().size > 0,
  );

  /** The reorder group's tooltip while nothing is ticked — it explains the greyed
   * buttons (a slot is the anchor they and Add both need) without spending a row
   * on a line. Goes quiet the moment a slot is picked, handing each button back
   * its own name. */
  protected readonly slotSelectionLabel = $localize`:@@entries.pick:Pick slots to reorder, or to aim Add above/below`;

  protected readonly reorderGroupLabel = $localize`:@@entries.reorder:Reorder`;
  /** "From this songbook" is the load-bearing half of the sentence. */
  protected readonly removeSlotsLabel = $localize`:@@entries.removeSelected:Remove the selected songs from this songbook`;
  /** The tooltip: the act. "From this songbook" stays in the accessible name,
   * where there is no column of arrows beside it to make the direction obvious. */
  protected readonly removeSlotsShort = $localize`:@@entries.removeSelectedShort:Remove selected`;

  /** One chevron is one step, two is all the way — the distinction the labels
   * spell out and the glyphs already carry. */
  protected readonly moveOptions = [
    {
      where: 'start' as const,
      icon: 'moveStart' as const,
      label: $localize`:@@entries.moveStart:Move to the start`,
    },
    {
      where: 'up' as const,
      icon: 'moveUp' as const,
      label: $localize`:@@entries.moveUp:Move up one`,
    },
    {
      where: 'down' as const,
      icon: 'moveDown' as const,
      label: $localize`:@@entries.moveDown:Move down one`,
    },
    {
      where: 'end' as const,
      icon: 'moveEnd' as const,
      label: $localize`:@@entries.moveEnd:Move to the end`,
    },
  ];

  /** A book you made is empty because you have not filled it yet. */
  protected readonly entriesEmptyText = $localize`:@@entries.empty:No songs in this songbook yet.`;

  // The find-and-jump row's labels. The placeholder doubles as the input's
  // accessible name — the field is its own label here.
  protected readonly entrySearchLabel = $localize`:@@entries.search:Find in this songbook`;
  protected readonly entrySearchPrevLabel = $localize`:@@entries.searchPrev:Previous match`;
  protected readonly entrySearchNextLabel = $localize`:@@entries.searchNext:Next match`;
  protected readonly clearSearchLabel = $localize`:@@explorer.clearSearch:Clear search`;

  protected onSearchInput(event: Event): void {
    this.presenter.setSearch((event.target as HTMLInputElement).value);
  }

  /** Clear via the in-field X: empty the term, blank the input, keep focus so a
   * new query can start straight away — the same gesture as the explorer's. */
  protected clearSearch(field: HTMLInputElement): void {
    this.presenter.clearSearch();
    field.value = '';
    field.focus();
  }

  /**
   * The field's keys: ↓/Enter step to the next match, ↑ to the previous, both
   * with `preventDefault` so the caret does not also move; Esc clears the term
   * and the input (the global `onEscape` ignores input targets, so it will not
   * navigate away). Everything else is left to the input.
   */
  protected onSearchKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
      case 'Enter':
        event.preventDefault();
        this.presenter.nextMatch();
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.presenter.prevMatch();
        break;
      case 'Escape':
        event.preventDefault();
        this.presenter.clearSearch();
        (event.target as HTMLInputElement).value = '';
        break;
    }
  }

  /**
   * Step from the preview into the editor. The page's job in this is the one
   * thing the presenter cannot do: **measure the two lists' scroll**, so they
   * can be put back exactly on the return. Everything else — capturing the ticks,
   * remembering the URL — is the presenter's (see `editPreview`).
   */
  protected editFromPreview(): void {
    this.presenter.editPreview({
      libraryOffset: this.libraryList()?.getScrollOffset() ?? 0,
      entryOffset: this.entryList()?.getScrollOffset() ?? 0,
    });
  }

  constructor() {
    effect(() => {
      void this.presenter.load(this.id());
    });

    effect(() => {
      void this.presenter.syncQuery({
        query: this.query(),
        sort: this.sortKey(),
        dir: this.sortDir(),
        isFavoritesFirst: this.isFavoritesFirst(),
      });
    });

    // The URL owns which song is previewed; feed the param to the presenter,
    // which fetches and renders it. `untracked` so the effect tracks only the
    // param — the fetch reads the dialog's own signal on the way, and tracking
    // that would loop the effect against its own result.
    effect(() => {
      const songId = this.preview() ?? null;
      untracked(() => void this.presenter.syncPreview(songId));
    });

    // Lay the remembered scroll back on after a return from the editor. The
    // offset means nothing until the lists have drawn their windows, so this
    // defers past the current change-detection, places both, and clears the
    // pending mark (which stops the effect re-firing).
    effect(() => {
      const scroll = this.presenter.pendingScroll();
      if (!scroll) {
        return;
      }
      setTimeout(() => {
        this.libraryList()?.scrollToOffset(scroll.library);
        this.entryList()?.scrollToOffset(scroll.entry);
        this.presenter.clearPendingScroll();
      });
    });

    // The entry search's cursor: scroll the matched slot into view each time it
    // moves. The presenter owns which slot (focusedIndex); the page owns the
    // list, so the scroll is the page's to make.
    effect(() => {
      const i = this.presenter.focusedIndex();
      if (i !== null) {
        this.entryList()?.scrollRowIntoView(i);
      }
    });

    // The tab names the songbook, not the module — it is a document like a song.
    inject(DestroyRef).onDestroy(
      inject(DocumentTitle).claim(() => this.presenter.name()),
    );
  }
}
