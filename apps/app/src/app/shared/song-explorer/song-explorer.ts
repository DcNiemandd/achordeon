// Song explorer — Epic 5 ▸ subtasks 1–2
// Spec: CONTEXT.md §Song explorer, §Search, §Favorite; PRD-INFRASTRUCTURE.md §3/§4

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  CdkDrag,
  CdkDragHandle,
  CdkDropList,
  type CdkDragDrop,
  type CdkDragEnter,
} from '@angular/cdk/drag-drop';
import {
  CdkVirtualScrollViewport,
  ScrollingModule,
} from '@angular/cdk/scrolling';
import { NgTemplateOutlet } from '@angular/common';
import {
  Autofocus,
  Button,
  EmptyState,
  Field,
  Icon,
  Menu,
  MenuItem,
  Tooltip,
  type IconName,
} from '../../primitives';
import {
  FULL_CAPABILITIES,
  type ExplorerCapabilities,
  type RowMove,
  type RowMoveRequest,
  type ExplorerSort,
  type ExplorerSortDir,
  type RenameChange,
  type RowDrop,
  type SongRow,
  type SortChange,
} from './explorer-model';

/** Row height, in px. `cdk-virtual-scroll-viewport` needs it as a constant, and
 * the CSS below must agree with it — one number in two languages. */
const ROW_HEIGHT = 52;

/** Fetch the next page this many rows before the window's end, so the list has
 * already grown by the time the user reaches the bottom. */
const PREFETCH_ROWS = 10;

/** Search debounce. Each settled edit is a store refetch AND a router
 * navigation, so this is not the parser's ~80ms — it is "stopped typing". */
const SEARCH_DEBOUNCE_MS = 200;

/**
 * How long a **touch** must rest on the handle before it becomes a drag.
 *
 * Zero for the mouse, where press-and-move is unambiguous. On touch the same
 * gesture is also a tap and the start of a scroll, so the delay is what keeps
 * all three usable from one finger: under it the touch is still the list's.
 */
const DRAG_START_DELAY = { touch: 250, mouse: 0 };

/**
 * The rich Song list: search, sort, multi-select, row actions
 * (CONTEXT.md §Song explorer).
 *
 * It reports the selection but does not act on it: **bulk actions belong to the
 * page's action bar**, on the same row as its primary button, so that ticking a
 * checkbox cannot resize the list you are ticking within.
 *
 * **One component, capability set per context.** It has two homes — the Songs
 * module at full power and the Songbooks left panel with the identity/destructive
 * actions off (Epic 6) — so it lives in `app/shared`, not in `songs/`: a feature
 * folder may not import a sibling, and this is the component that proves why that
 * rule is worth having.
 *
 * Like every component (PRD-UI-SHELL.md §3) it is a **controlled component**:
 * rows in, intents out. It injects no store, does no paging, and holds no
 * selection — its only state is which row is mid-rename, which is a fact about
 * this list on this screen and belongs nowhere else.
 *
 * Rows are virtualised (`cdk-virtual-scroll-viewport`, PRD-UI-SHELL.md §2): the
 * window grows without bound as you scroll, so the DOM must not.
 */
@Component({
  selector: 'app-song-explorer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // On the document, because a drag over this list may have started in the
  // other one — see `onPointerMove`. The first line of the handler is the guard
  // that makes this free while nothing is being dragged.
  host: { '(document:pointermove)': 'onPointerMove($event)' },
  imports: [
    ScrollingModule,
    NgTemplateOutlet,
    CdkDrag,
    CdkDragHandle,
    CdkDropList,
    Autofocus,
    Button,
    EmptyState,
    Field,
    Icon,
    Menu,
    MenuItem,
    Tooltip,
  ],
  template: `
    <!-- A stored songbook's entry list has nothing to search or sort: its order
         is the content. The two halves are separate capabilities because the
         virtual All songs book wants one and not the other. -->
    @if (capabilities().canSearch || capabilities().canSort) {
      <div class="tools">
        @if (capabilities().canSearch) {
          <div class="search">
            <app-icon name="search" class="search-icon" />
            <input
              #searchInput
              appField
              type="search"
              class="search-field"
              [class.has-value]="hasQuery()"
              [value]="query()"
              [attr.aria-label]="searchLabel"
              [attr.placeholder]="searchLabel"
              data-testid="explorer-search"
              (input)="onSearchInput($event)"
            />
            <!-- Only while there is something to clear. Unlike the row actions this
               button is not a shortcut for anything reachable another way — with an
               empty list and a stale query, it is the way back. -->
            @if (hasQuery()) {
              <button
                appButton
                type="button"
                class="search-clear"
                [isIconOnly]="true"
                [attr.aria-label]="clearSearchLabel"
                [appTooltip]="clearSearchLabel"
                data-testid="explorer-search-clear"
                (click)="clearQuery(searchInput)"
              >
                <app-icon name="close" />
              </button>
            }
          </div>
        }

        @if (capabilities().canSort) {
          <select
            class="sort"
            [value]="sort()"
            [attr.aria-label]="sortLabel"
            data-testid="explorer-sort"
            (change)="onSortPick($event)"
          >
            @for (option of sortOptions; track option.value) {
              <option [value]="option.value">{{ option.label }}</option>
            }
          </select>

          <button
            appButton
            type="button"
            [isIconOnly]="true"
            [attr.aria-label]="dirLabel()"
            [appTooltip]="dirLabel()"
            data-testid="explorer-sort-dir"
            (click)="toggleDir()"
          >
            <app-icon [name]="dir() === 'asc' ? 'sortAsc' : 'sortDesc'" />
          </button>

          <!-- A flag over the sort, not a sort of its own: "my starred songs at
               the top of the list I am already reading". Sorting BY favourite
               left everything else in tiebreak order, which is a list nobody
               asked for. -->
          <button
            appButton
            type="button"
            class="star"
            [isIconOnly]="true"
            [class.is-favorite]="isFavoritesFirst()"
            [attr.aria-pressed]="isFavoritesFirst()"
            [attr.aria-label]="favoritesFirstLabel"
            [appTooltip]="favoritesFirstLabel"
            data-testid="explorer-favorites-first"
            (click)="favoritesFirstChange.emit(!isFavoritesFirst())"
          >
            <app-icon name="favorite" [isFilled]="isFavoritesFirst()" />
          </button>
        }
      </div>
    }

    @if (rows().length === 0) {
      <!-- **An empty list is still a destination.** The viewport is gone with
           its rows, and with it the drop list — so an empty songbook could not
           be dragged into at all, which is precisely the songbook most likely
           to be. The empty state takes the job over: same handlers, and the
           only boundary it can name is 0. -->
      <app-empty-state
        #dropArea
        class="list empty"
        cdkDropList
        [text]="emptyText()"
        [cdkDropListEnterPredicate]="acceptsDrop"
        [class.is-drop-target]="isDragOver()"
        [class.is-foreign-drag]="isForeignDrag()"
        [class.is-remove-target]="isRemoving()"
        data-testid="explorer-empty"
        (cdkDropListEntered)="onEnterEmpty($event)"
        (cdkDropListExited)="onDragLeave()"
        (cdkDropListDropped)="onDropped($event)"
      />
    } @else {
      <cdk-virtual-scroll-viewport
        #dropArea
        class="list"
        cdkDropList
        [itemSize]="ROW_HEIGHT"
        [cdkDropListSortingDisabled]="true"
        [cdkDropListEnterPredicate]="acceptsDrop"
        [class.is-drop-target]="isDragOver()"
        [class.is-foreign-drag]="isForeignDrag()"
        [class.is-remove-target]="isRemoving()"
        data-testid="explorer-list"
        (scrolledIndexChange)="onScrolledIndex($event)"
        (cdkDropListEntered)="onEntered($event)"
        (cdkDropListExited)="onDragLeave()"
        (cdkDropListDropped)="onDropped($event)"
      >
        <div
          *cdkVirtualFor="let row of rows(); trackBy: trackById"
          class="row"
          cdkDrag
          [cdkDragData]="row.id"
          [cdkDragDisabled]="!capabilities().canDrag"
          [cdkDragStartDelay]="DRAG_START_DELAY"
          [class.is-current]="row.id === currentId()"
          [class.is-selected]="selectedIds().has(row.id)"
          [class.is-insert-before]="activeInsertAt() === row.position"
          [class.is-insert-after]="isLastAndInsertAtEnd(row)"
          [attr.data-testid]="rowTestid()"
          [attr.data-song-id]="row.id"
          (cdkDragStarted)="onDragStarted()"
        >
          <!-- **Before the checkbox, and the only draggable part of the row.**
               First in the reading order because it is what the row IS about to
               do, and separate from the tick because dragging and selecting are
               different gestures that must not be reachable from one press. -->
          @if (capabilities().canDrag) {
            <span
              class="grip"
              cdkDragHandle
              aria-hidden="true"
              [attr.data-testid]="'drag-' + row.id"
            >
              <app-icon name="drag" />
            </span>
          }

          @if (capabilities().canSelect) {
            <input
              type="checkbox"
              class="check"
              [checked]="selectedIds().has(row.id)"
              [attr.aria-label]="selectRowLabel(row)"
              [attr.data-testid]="'select-' + row.id"
              (change)="selectToggled.emit(row.id)"
            />
          }

          <!-- The slot number: what repeats and reorders, and what a performer
               is counting down when they read a set list. Only where position
               IS the content — a library sorted by name has no "number 4". -->
          @if (capabilities().hasOrdinals) {
            <span class="ordinal" aria-hidden="true">{{
              row.position + 1
            }}</span>
          }

          @if (capabilities().canFavorite) {
            <button
              appButton
              type="button"
              class="star"
              [isIconOnly]="true"
              [class.is-favorite]="row.isFavorite"
              [attr.aria-pressed]="row.isFavorite"
              [attr.aria-label]="favoriteRowLabel(row)"
              [appTooltip]="row.isFavorite ? UNFAVORITE : FAVORITE"
              [attr.data-testid]="'favorite-' + row.id"
              (click)="favorited.emit(row.id)"
            >
              <app-icon name="favorite" [isFilled]="row.isFavorite" />
            </button>
          }

          @if (row.hint) {
            <!-- Click, not hover: touch has no hover, and this is the one row
                 on the screen that is not what it appears to be. -->
            <button
              appButton
              type="button"
              class="hint"
              [isIconOnly]="true"
              [appTooltip]="row.hint"
              appTooltipTrigger="click"
              [attr.aria-label]="hintLabel(row)"
              [attr.data-testid]="'hint-' + row.id"
            >
              <app-icon name="help" />
            </button>
          }

          @if (renamingId() === row.id) {
            <!-- Renaming happens in place. A dialog for one text field would ask
                 the user to lose sight of the list they are renaming within. -->
            <input
              appField
              class="rename"
              [value]="row.name"
              [attr.aria-label]="renameRowLabel(row)"
              [attr.data-testid]="'rename-input-' + row.id"
              appAutofocus
              (keydown.enter)="commitRename(row, $event)"
              (keydown.escape)="cancelRename()"
              (blur)="commitRename(row, $event)"
            />
          } @else {
            <button
              type="button"
              class="open"
              [attr.data-testid]="'open-' + row.id"
              (click)="activated.emit(row.id)"
              (dblclick)="onOpen(row)"
            >
              <span class="name">{{ row.name }}</span>
              <!-- Title is what prints; Name is what you filed it under. They
                   are different strings and the list shows both, because
                   searching finds you rows by either (CONTEXT.md §Search). -->
              @if (row.title) {
                <span class="title">{{ row.title }}</span>
              }
            </button>
          }

          <div
            class="row-actions"
            [class.is-menu-open]="openMenuRow() === row.id"
          >
            @if (capabilities().canEdit) {
              <button
                appButton
                type="button"
                [isIconOnly]="true"
                [attr.aria-label]="editRowLabel(row)"
                [appTooltip]="EDIT"
                [attr.data-testid]="'edit-' + row.id"
                (click)="opened.emit(row.id)"
              >
                <app-icon name="edit" />
              </button>
            }
            @if (capabilities().canRename && !row.isReadOnly) {
              <button
                appButton
                type="button"
                [isIconOnly]="true"
                [attr.aria-label]="renameRowLabel(row)"
                [appTooltip]="RENAME"
                [attr.data-testid]="'rename-' + row.id"
                (click)="startRename(row)"
              >
                <app-icon name="rename" />
              </button>
            }
            <!-- Reorder is per ROW here, not per selection: you are already
                 pointing at the thing you want moved, and having to tick it
                 first (and untick it after) is a step the pointer just made.
                 The strip above still moves a whole selection as a block.

                 Gone once **several** rows are ticked, because then the two
                 affordances disagree: the strip moves the block, these would
                 move one row out of it. Same act, same screen, two answers —
                 so the block's tool wins while a block exists. -->
            @if (capabilities().canReorder && !hasBlockSelection()) {
              @for (move of ROW_MOVES; track move.where) {
                <button
                  appButton
                  type="button"
                  class="move"
                  [isIconOnly]="true"
                  [attr.aria-label]="moveRowLabel(row, move.where)"
                  [appTooltip]="move.label"
                  [attr.data-testid]="'row-' + move.where + '-' + row.id"
                  (click)="onRowMove($event, row, move.where)"
                >
                  <app-icon [name]="move.icon" />
                </button>
              }
            }

            <!-- Stands down with the move buttons while a block is ticked: the
                 strip above removes the block, and a row button would take one
                 row out of the set you just built. -->
            @if (
              capabilities().canRemove &&
              !row.isReadOnly &&
              !hasBlockSelection()
            ) {
              <!-- The left arrow the transfer column uses, not a bin and no
                   longer an X: this sends the row back across to the library,
                   which is where the column's own remove button points. A bin
                   would mean the song itself (CONTEXT.md §Delete vs Remove),
                   and an X read as "dismiss" rather than "put back". -->
              <button
                appButton
                type="button"
                [isIconOnly]="true"
                [attr.aria-label]="removeRowLabel(row)"
                [appTooltip]="REMOVE"
                [attr.data-testid]="'remove-' + row.id"
                (click)="removed.emit([row.id])"
              >
                <app-icon name="transferOut" />
              </button>
            }
            <!-- The secondary actions — duplicate, the two file exports, delete.
                 Two ways to wear them, chosen per mount (usesRowMenu):

                 - Menu (the Songs module): edit and rename stay in reach and the
                   rest fold behind one dots button, because a library row
                   carries many actions and few are everyday.
                 - Laid out (the songbook list): a songbook row carries a
                   handful, and they read better as buttons than pocketed. -->
            @if (hasRowMenu(row)) {
              @if (capabilities().usesRowMenu) {
                <!-- Inlined, not an ng-template outlet: a MenuItem finds its
                     enclosing Menu by injector, and an embedded view's injector
                     follows where the template was *declared* (here), not where
                     it is rendered (inside the menu). Projected through an outlet
                     the item cannot see the menu, so it never closes it — and the
                     open backdrop then eats the next click. -->
                <app-menu
                  [label]="moreRowLabel(row)"
                  [testid]="'more-' + row.id"
                  (openChange)="onMenuOpen(row.id, $event)"
                >
                  @if (capabilities().canDownload && !row.isReadOnly) {
                    <button
                      appMenuItem
                      [attr.data-testid]="'download-' + row.id"
                      (chosen)="downloaded.emit(row.id)"
                    >
                      <app-icon name="download" />
                      {{ DOWNLOAD }}
                    </button>
                  }
                  @if (capabilities().canExport && !row.isReadOnly) {
                    <button
                      appMenuItem
                      [attr.data-testid]="'export-' + row.id"
                      (chosen)="exported.emit(row.id)"
                    >
                      <app-icon name="export" />
                      {{ EXPORT }}
                    </button>
                  }
                  @if (capabilities().canDuplicate && !row.isReadOnly) {
                    <button
                      appMenuItem
                      [attr.data-testid]="'duplicate-' + row.id"
                      (chosen)="duplicated.emit(row.id)"
                    >
                      <app-icon name="duplicate" />
                      {{ DUPLICATE }}
                    </button>
                  }
                  @if (capabilities().canDelete && !row.isReadOnly) {
                    <button
                      appMenuItem
                      class="is-danger"
                      [attr.data-testid]="'delete-' + row.id"
                      (chosen)="deleted.emit([row.id])"
                    >
                      <app-icon name="delete" />
                      {{ DELETE }}
                    </button>
                  }
                </app-menu>
              } @else {
                <ng-container
                  [ngTemplateOutlet]="directActions"
                  [ngTemplateOutletContext]="{ row }"
                />
              }
            }
          </div>
        </div>
      </cdk-virtual-scroll-viewport>
    }

    <!-- Drop-to-remove hint, over the list, only while a foreign drag is on a
         remove target (the builder's library pane). The list already tints; this
         says out loud what letting go here will do, since a "drop to remove" zone
         is not a thing a user expects until they are told. -->
    @if (isRemoving()) {
      <div class="remove-hint" aria-hidden="true">
        <app-icon name="transferOut" />
        {{ REMOVE_DROP }}
      </div>
    }

    <!-- The secondary row actions as **laid-out icon buttons** — the songbook
         list's way. The menu wears the same four as labelled items (inlined
         above, for the DI reason noted there); this is the version for a mount
         that has room to show them. -->
    <ng-template #directActions let-row="row">
      @if (capabilities().canDownload && !row.isReadOnly) {
        <button
          appButton
          type="button"
          [isIconOnly]="true"
          [attr.aria-label]="downloadRowLabel(row)"
          [appTooltip]="DOWNLOAD"
          [attr.data-testid]="'download-' + row.id"
          (click)="downloaded.emit(row.id)"
        >
          <app-icon name="download" />
        </button>
      }
      @if (capabilities().canExport && !row.isReadOnly) {
        <button
          appButton
          type="button"
          [isIconOnly]="true"
          [attr.aria-label]="exportRowLabel(row)"
          [appTooltip]="EXPORT"
          [attr.data-testid]="'export-' + row.id"
          (click)="exported.emit(row.id)"
        >
          <app-icon name="export" />
        </button>
      }
      @if (capabilities().canDuplicate && !row.isReadOnly) {
        <button
          appButton
          type="button"
          [isIconOnly]="true"
          [attr.aria-label]="duplicateRowLabel(row)"
          [appTooltip]="DUPLICATE"
          [attr.data-testid]="'duplicate-' + row.id"
          (click)="duplicated.emit(row.id)"
        >
          <app-icon name="duplicate" />
        </button>
      }
      @if (capabilities().canDelete && !row.isReadOnly) {
        <button
          appButton
          type="button"
          [isIconOnly]="true"
          [attr.aria-label]="deleteRowLabel(row)"
          [appTooltip]="DELETE"
          [attr.data-testid]="'delete-' + row.id"
          (click)="deleted.emit([row.id])"
        >
          <app-icon name="delete" />
        </button>
      }
    </ng-template>
  `,
  styles: `
    :host {
      position: relative;
      display: flex;
      flex-direction: column;
      min-block-size: 0;
      block-size: 100%;
    }

    /* The drop-to-remove banner, floated over the list (see .is-remove-target).
       Pointer-transparent so it never eats the drop it is describing. */
    .remove-hint {
      position: absolute;
      inset: 0;
      z-index: 2;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2);
      pointer-events: none;
      color: var(--danger, #c0362c);
      font-size: var(--text-sm);
      font-weight: 500;
    }

    .remove-hint app-icon {
      --icon-size: 20px;
    }

    .tools {
      display: flex;
      align-items: center;
      gap: var(--space-1);
      padding: var(--space-2);
      border-block-end: 1px solid var(--border);
    }

    .search {
      position: relative;
      flex: 1;
      min-inline-size: 0;
      display: flex;
      align-items: center;
    }

    .search-icon {
      --icon-size: 14px;
      position: absolute;
      inset-inline-start: var(--space-2);
      color: var(--text-faint);
      pointer-events: none;
    }

    .search-field {
      padding-inline-start: var(--space-5);
    }

    /* Room for the clear button, so a long query does not run underneath it. */
    .search-field.has-value {
      padding-inline-end: var(--space-5);
    }

    .search-clear {
      --icon-size: 14px;
      position: absolute;
      inset-inline-end: 2px;
      block-size: 28px;
      color: var(--text-faint);
    }

    /* The type="search" widget ships its own clear affordance in WebKit. Ours is
       the one that also drops the pending debounce, so the native one has to go —
       two X's a pixel apart, doing subtly different things, is worse than either. */
    .search-field::-webkit-search-cancel-button {
      display: none;
    }

    .sort {
      block-size: 32px;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-md);
      background: var(--surface);
      color: var(--text);
      font: inherit;
      font-size: var(--text-sm);
    }

    .list {
      flex: 1;
      min-block-size: 0;
    }

    .row {
      display: flex;
      align-items: center;
      gap: var(--space-1);
      block-size: 52px;
      padding-inline: var(--space-2);
      border-block-end: 1px solid var(--border);
    }

    .row:hover {
      background: var(--surface-raised);
    }

    .row.is-selected {
      background: var(--brand-subtle);
    }

    /* The current row is what pane B is rendering — a different fact from
       "selected for a bulk action", so a different mark. */
    .row.is-current {
      box-shadow: inset 3px 0 0 var(--brand);
    }

    /* Where an add would land, while its button is hovered or focused — the
       answer to "above what, exactly?". An inset shadow rather than a border,
       so the row keeps its height and the list does not twitch as the pointer
       moves between the buttons. */
    .row.is-insert-before {
      box-shadow: inset 0 3px 0 var(--brand);
    }

    .row.is-insert-after {
      box-shadow: inset 0 -3px 0 var(--brand);
    }

    /* Both marks can be true at once, and the later rule would drop one. */
    .row.is-current.is-insert-before {
      box-shadow:
        inset 3px 0 0 var(--brand),
        inset 0 3px 0 var(--brand);
    }

    .row.is-current.is-insert-after {
      box-shadow:
        inset 3px 0 0 var(--brand),
        inset 0 -3px 0 var(--brand);
    }

    .ordinal {
      flex: none;
      min-inline-size: 2ch;
      text-align: end;
      font-size: var(--text-xs);
      color: var(--text-faint);
      /* Lining figures, so a column of numbers stays a column. */
      font-variant-numeric: tabular-nums;
    }

    .grip {
      --icon-size: 16px;
      flex: none;
      display: flex;
      align-items: center;
      align-self: stretch;
      padding-inline: 2px;
      color: var(--text-faint);
      cursor: grab;
      /* The browser's own touch gestures must not claim the press before the
         long-press does — without this, a drag off the handle scrolls the list. */
      touch-action: none;
    }

    .grip:active {
      cursor: grabbing;
    }

    /* The row travelling with the pointer. It is a clone lifted out of the
       viewport, so it carries none of the list's own layout and needs its own. */
    .row.cdk-drag-preview {
      display: flex;
      align-items: center;
      gap: var(--space-1);
      box-sizing: border-box;
      padding-inline: var(--space-2);
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-md);
      background: var(--surface-overlay);
      box-shadow: var(--shadow-2);
      opacity: 0.95;
    }

    /* Nothing on a preview is clickable, and the actions it drew mid-hover would
       ride along under the pointer. */
    .row.cdk-drag-preview .row-actions {
      display: none;
    }

    /* Where the row came from, while it is away. Sorting is off inside a
       virtualised list, so this stays put and reads as the origin. */
    .row.cdk-drag-placeholder {
      opacity: 0.4;
    }

    /* …but not in a list the row does not belong to. The CDK parks its
       placeholder in whichever container the pointer is over, so a drag from the
       library planted a ghost row at the bottom of the songbook that never
       followed the insertion line — two marks, disagreeing, one of them wrong.
       The line is the promise; this is only ever the origin. */
    .list.is-foreign-drag .row.cdk-drag-placeholder {
      display: none;
    }

    /* The empty state stands in for the viewport as the drop target, so it has
       to occupy the same space — a message the height of one line is a target
       you have to aim at. */
    .list.empty {
      flex: 1;
      min-block-size: 0;
    }

    /* The list currently under the pointer. Deliberately quiet — the insertion
       line is the message; this only says which of the two lists is listening. */
    .list.is-drop-target {
      background: var(--brand-subtle);
    }

    /* A remove target (the builder's library pane, dragged into from the book):
       a different kind of drop, so a different tint and a dashed edge — this is
       "out", not "here". The .remove-hint names it in words. */
    .list.is-remove-target {
      background: color-mix(in srgb, var(--danger, #c0362c) 8%, transparent);
      outline: 2px dashed var(--danger, #c0362c);
      outline-offset: -6px;
    }

    .check {
      accent-color: var(--brand);
      inline-size: 16px;
      block-size: 16px;
      flex: none;
    }

    .star {
      color: var(--text-faint);
    }

    .hint {
      --icon-size: 14px;
      block-size: 24px;
      min-inline-size: 24px;
      flex: none;
      color: var(--text-faint);
    }

    .star.is-favorite {
      color: var(--brand);
    }

    /* The ghost skin tints the background of anything aria-pressed, which is
       right for a toolbar toggle and wrong here: a permanently highlighted cell
       down a list of favourites is noise. The glyph itself carries the state
       (filled vs outline), so the background is free to mean what it means on
       every other row action — "you are hovering me". */
    .star[aria-pressed='true']:not(:hover) {
      background: none;
    }

    .open {
      flex: 1;
      min-inline-size: 0;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
      padding: 0 var(--space-1);
      border: 0;
      background: none;
      text-align: start;
      cursor: pointer;
      block-size: 100%;
    }

    .name,
    .title {
      max-inline-size: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .name {
      font-size: var(--text-sm);
      color: var(--text);
    }

    .title {
      font-size: var(--text-xs);
      color: var(--text-faint);
    }

    .rename {
      flex: 1;
      min-inline-size: 0;
    }

    /* Five icons on a hovered row is a lot, so the moves are tighter than the
       actions beside them and lean on their shared shape to read as one group. */
    .move {
      --icon-size: 15px;
      min-inline-size: 24px;
    }

    .row-actions {
      display: flex;
      align-items: center;
      gap: 2px;
      flex: none;
      /* Revealed on hover/focus on a pointer device — three icons per row is
         noise while you are reading names. Touch has no hover, so there they
         stay put rather than being unreachable. */
      opacity: 0;
    }

    /* The current row is the one you are working on — its actions are the ones
       you are about to want, and hiding them behind a hover means aiming at a row
       you have already picked. It is exactly one row, so this cannot become the
       noise the hover rule exists to prevent. */
    .row:hover .row-actions,
    .row:focus-within .row-actions,
    .row.is-current .row-actions,
    /* …and while this row's dots menu is open. The menu lives in an overlay
       outside the row, so focus-within releases the instant it opens — without
       this the actions (and the dots that opened them) vanish under it. */
    .row-actions.is-menu-open {
      opacity: 1;
    }

    @media (hover: none) {
      .row-actions {
        opacity: 1;
      }
    }
  `,
})
export class SongExplorer {
  readonly rows = input.required<readonly SongRow[]>();
  readonly capabilities = input<ExplorerCapabilities>(FULL_CAPABILITIES);
  readonly query = input('');
  readonly sort = input<ExplorerSort>('name');
  readonly dir = input<ExplorerSortDir>('asc');
  readonly selectedIds = input<ReadonlySet<string>>(new Set());
  /** The row pane B is rendering (`SessionStore.currentSongId`). */
  readonly currentId = input<string | null>(null);
  readonly emptyText = input($localize`:@@explorer.empty:No songs yet.`);
  /** Float starred rows to the top, whatever the sort axis is. */
  readonly isFavoritesFirst = input(false);

  /**
   * Where an add would land, drawn as a line between rows. `null` while nothing
   * is being previewed; `rows().length` means "after the last row".
   */
  readonly insertAt = input<number | null>(null);

  /**
   * The `data-testid` each row carries. Two mounts of this list can appear on
   * one screen (the library and a songbook's entries), and a suite that selects
   * `song-row` must be able to say which one it means.
   */
  readonly rowTestid = input('song-row');

  readonly queryChange = output<string>();
  readonly sortChange = output<SortChange>();
  readonly favoritesFirstChange = output<boolean>();
  /** The window is within a page of its end — grow it (PRD-INFRA §3). */
  readonly loadMore = output<void>();
  /** A row was clicked: make it the current song. Does not open the editor. */
  readonly activated = output<string>();
  /** Open this song in the editor. */
  readonly opened = output<string>();
  readonly selectToggled = output<string>();
  readonly favorited = output<string>();
  /**
   * A request to delete, never the deed — one id from a row, many from the bulk
   * bar. Deleting a song can destroy songbook entries, so what happens next
   * (warn, confirm, cascade) is the presenter's call, not a list's.
   */
  readonly deleted = output<string[]>();
  readonly renamed = output<RenameChange>();
  readonly duplicated = output<string>();
  /**
   * Take these rows out of THIS list, leaving the songs alone — a songbook slot,
   * never a library row. A different act from `deleted`, which destroys.
   */
  readonly removed = output<string[]>();
  /** Download / export this one row (Epic 7). A picture for a player, a file
   * for a computer — the page decides which service answers. */
  readonly downloaded = output<string>();
  readonly exported = output<string>();
  /** Move **one row**, named by id — never the selection (see the template). */
  readonly moved = output<RowMoveRequest>();
  /** A row was dropped **onto this list** — from it or from the other one. */
  readonly dropped = output<RowDrop>();
  /** A row from **another** list was dropped on this remove-target list — take
   * it out of wherever it came from. Carries the dragged row's id. */
  readonly droppedOut = output<string>();

  protected readonly ROW_HEIGHT = ROW_HEIGHT;
  protected readonly DRAG_START_DELAY = DRAG_START_DELAY;

  private readonly viewport = viewChild(CdkVirtualScrollViewport);
  /** Whatever is carrying `cdkDropList` — the viewport, or the empty state that
   * stands in for it. The geometry a drop is measured against. */
  private readonly dropArea = viewChild('dropArea', { read: ElementRef });

  /** A drag is over this list right now — see `onPointerMove`. */
  protected readonly isDragOver = signal(false);

  /**
   * The drag over this list started in the **other** one.
   *
   * The CDK moves its placeholder — the row-shaped gap that marks where the
   * dragged item came from — into whatever container the pointer enters. In a
   * list that does not sort, that gap lands at the end and just sits there,
   * miles from the insertion line, reading as a second and contradictory answer
   * to "where will this go". So it is hidden here, and stays visible where it
   * means something: the row's real position, in the list it left.
   */
  protected readonly isForeignDrag = signal(false);

  /**
   * The boundary the pointer is currently naming, while a drag is over this
   * list. Null otherwise, which is what hands the insertion line back to the
   * Add buttons' preview.
   */
  private readonly dragAt = signal<number | null>(null);

  /**
   * **One insertion line, two things that can aim it** — Epic 14's rule.
   *
   * The Add buttons preview a landing position on hover (`insertAt`); a drag
   * names one with the pointer. They are the same mark and the same promise, so
   * they are the same signal, and a drag simply outranks a hover — the pointer
   * is busy doing the thing the hover was only describing.
   */
  protected readonly activeInsertAt = computed(
    () => this.dragAt() ?? this.insertAt(),
  );

  /**
   * Whether this list will take the drop.
   *
   * A bound arrow, not a method: the CDK stores the predicate once, so a
   * prototype method would be called with the wrong `this`. A list takes a drop
   * to insert (`canDrop`) or to remove (`canDropRemove`, the builder's library
   * pane, which pulls a slot back out of the book).
   */
  protected readonly acceptsDrop = (): boolean =>
    this.capabilities().canDrop || this.capabilities().canDropRemove;

  /** A foreign drag is hovering a list that removes on drop — the "out" tint,
   * and no insertion line, because there is no position, only away. */
  protected readonly isRemoving = computed(
    () =>
      this.isDragOver() &&
      this.isForeignDrag() &&
      this.capabilities().canDropRemove,
  );

  /** Which row's ⋯ menu is open, so its actions stay visible while it is (the
   * overlay is outside the row, so `:focus-within` can't hold them). */
  protected readonly openMenuRow = signal<string | null>(null);

  protected onMenuOpen(id: string, isOpen: boolean): void {
    this.openMenuRow.set(isOpen ? id : null);
  }

  /** The four row moves, in list order: to the top, one up, one down, to the
   * bottom — the same glyphs the strip above uses, because it is the same act. */
  protected readonly ROW_MOVES: readonly {
    where: RowMove;
    icon: IconName;
    label: string;
  }[] = [
    {
      where: 'start',
      icon: 'moveStart',
      label: $localize`:@@explorer.moveStart:Move to the start`,
    },
    {
      where: 'up',
      icon: 'moveUp',
      label: $localize`:@@explorer.moveUp:Move up one`,
    },
    {
      where: 'down',
      icon: 'moveDown',
      label: $localize`:@@explorer.moveDown:Move down one`,
    },
    {
      where: 'end',
      icon: 'moveEnd',
      label: $localize`:@@explorer.moveEnd:Move to the end`,
    },
  ];

  /**
   * What the **tooltips** say: the act, and nothing else.
   *
   * The `aria-label`s still name the row ("Rename Wonderwall"), and that is not
   * a contradiction — a pointer user reads the tooltip beside the row it belongs
   * to, while a screen-reader user meets the button out of that context and gets
   * nothing from "Rename" heard fifty times. WCAG 2.5.3 asks that the visible
   * label be contained in the accessible name, which it is.
   */
  protected readonly FAVORITE = $localize`:@@explorer.favorite:Add to favorites`;
  protected readonly UNFAVORITE = $localize`:@@explorer.unfavorite:Remove from favorites`;
  protected readonly EDIT = $localize`:@@explorer.edit:Edit`;
  protected readonly RENAME = $localize`:@@explorer.rename:Rename`;
  protected readonly DUPLICATE = $localize`:@@explorer.duplicate:Duplicate`;
  protected readonly REMOVE = $localize`:@@explorer.remove:Remove from songbook`;
  protected readonly DELETE = $localize`:@@explorer.delete:Delete`;
  protected readonly DOWNLOAD = $localize`:@@explorer.download:Download`;
  protected readonly EXPORT = $localize`:@@explorer.export:Export`;
  protected readonly MORE = $localize`:@@explorer.more:More actions`;
  protected readonly REMOVE_DROP = $localize`:@@explorer.removeDrop:Drop to remove from the songbook`;

  /** The only state this component owns: which row is mid-rename. */
  protected readonly renamingId = signal<string | null>(null);

  /**
   * What is in the search box *right now*, as opposed to what the URL has caught
   * up to.
   *
   * The two differ for the length of the debounce, and the clear button has to
   * obey the field rather than the URL — otherwise it takes 200ms to appear after
   * the first keystroke and lingers 200ms after the last one is deleted. A
   * `linkedSignal` because the URL is still the source of truth (§7): any
   * navigation that changes `query` resets this to it.
   */
  private readonly typedQuery = linkedSignal(() => this.query());

  protected readonly hasQuery = computed(() => this.typedQuery().length > 0);

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly searchLabel = $localize`:@@explorer.search:Search songs`;
  protected readonly sortLabel = $localize`:@@explorer.sort:Sort by`;
  protected readonly clearSearchLabel = $localize`:@@explorer.clearSearch:Clear search`;

  protected readonly sortOptions: readonly {
    value: ExplorerSort;
    label: string;
  }[] = [
    { value: 'name', label: $localize`:@@explorer.sort.name:Name` },
    { value: 'created', label: $localize`:@@explorer.sort.created:Created` },
    { value: 'changed', label: $localize`:@@explorer.sort.changed:Changed` },
  ];

  protected readonly favoritesFirstLabel = $localize`:@@explorer.favoritesFirst:Show favorites first`;

  protected readonly dirLabel = computed(() =>
    this.dir() === 'asc'
      ? $localize`:@@explorer.dir.asc:Ascending`
      : $localize`:@@explorer.dir.desc:Descending`,
  );

  protected trackById(_index: number, row: SongRow): string {
    return row.id;
  }

  /** More than one row ticked — see the row-move buttons in the template. */
  protected readonly hasBlockSelection = computed(
    () => this.selectedIds().size > 1,
  );

  /**
   * Move one row, and **let go of the button afterwards** when it was clicked
   * [trap].
   *
   * The row actions are revealed by `:hover` *and* `:focus-within`, so a clicked
   * button kept its row's actions on screen after the pointer left — and after a
   * move the row under that index holds a different song, so the strip of
   * buttons was left hanging over a row nobody was pointing at.
   *
   * Only for pointer clicks: `detail` is 0 when a button is activated from the
   * keyboard, where blurring would throw the user's place away. There, focus
   * staying put is the whole point.
   */
  protected onRowMove(event: MouseEvent, row: SongRow, where: RowMove): void {
    this.moved.emit({ id: row.id, where });
    if (event.detail > 0) {
      (event.currentTarget as HTMLElement | null)?.blur();
    }
  }

  /** "After the end" has no row of its own, so the last row wears the line. */
  protected isLastAndInsertAtEnd(row: SongRow): boolean {
    const at = this.activeInsertAt();
    return at !== null && at === this.rows().length && row.position === at - 1;
  }

  /**
   * Where the pointer is, in **boundaries between rows**.
   *
   * Tracked on the document rather than from the dragged row's own
   * `cdkDragMoved`, because the two are not the same component: a drag that
   * starts in the library is reported by the library's list, and the only thing
   * that can turn a pointer position into an index is the list it is over.
   *
   * Rows are a fixed height (the virtual viewport requires it), so this is
   * arithmetic rather than measurement — and it works for a row that has never
   * been rendered, which is the whole reason a virtualised list cannot lean on
   * the CDK's own DOM-order sorting.
   */
  protected onPointerMove(event: PointerEvent): void {
    if (!this.isDragOver()) {
      return;
    }
    // A remove target names no boundary — the drop takes the row out, it does
    // not slot it in. So no insertion line, and nothing to track.
    if (this.capabilities().canDropRemove) {
      return;
    }
    const area = this.dropArea();
    if (!area) {
      return;
    }
    const box = (area.nativeElement as HTMLElement).getBoundingClientRect();
    // Off the list entirely — including over the *other* pane, which the CDK
    // leaves in this container's charge because it refuses the drop. Forgetting
    // the boundary is what makes letting go out there mean nothing, rather than
    // a reorder at whatever number the pointer last passed over.
    if (
      event.clientX < box.left ||
      event.clientX > box.right ||
      event.clientY < box.top ||
      event.clientY > box.bottom
    ) {
      this.dragAt.set(null);
      return;
    }
    const viewport = this.viewport();
    const y = event.clientY - box.top + (viewport?.measureScrollOffset() ?? 0);
    const at = Math.round(y / ROW_HEIGHT);
    this.dragAt.set(Math.min(Math.max(at, 0), this.rows().length));
  }

  /** A drag crossed into this list. */
  protected onEntered(event: CdkDragEnter<unknown>): void {
    this.isDragOver.set(true);
    this.isForeignDrag.set(event.item.dropContainer !== event.container);
  }

  /** An empty list has one boundary, and no pointer position can change it. */
  protected onEnterEmpty(event: CdkDragEnter<unknown>): void {
    this.onEntered(event);
    this.dragAt.set(0);
  }

  /**
   * A row of **this** list started moving.
   *
   * The CDK announces `entered` only when a drag crosses into a container, so a
   * reorder within one list would never be announced at all — the item was
   * already there. This is that missing edge.
   */
  protected onDragStarted(): void {
    if (this.capabilities().canDrop) {
      this.isDragOver.set(true);
    }
  }

  /** The drag went elsewhere, or ended. Either way this list is no longer
   * promising anything, so the line goes back to the Add buttons. */
  protected onDragLeave(): void {
    this.isDragOver.set(false);
    this.isForeignDrag.set(false);
    this.dragAt.set(null);
  }

  /**
   * Report the drop and **let the presenter act** — a drop is a request, exactly
   * as a row's move button is. It resolves to the same commands the buttons
   * call, so a drag and a press can never disagree about what happened.
   *
   * Dropped with no tracked boundary (a press that never moved) is not a move,
   * and silently landing it at 0 would reorder the list for a mis-click.
   */
  protected onDropped(event: CdkDragDrop<unknown>): void {
    const at = this.dragAt();
    const isSameList = event.previousContainer === event.container;
    const id = event.item.data as string;
    this.onDragLeave();

    // A remove target: a row dragged in from the other list leaves the book. A
    // row of this list dropped back on itself is a no-op — the library has no
    // order to rearrange.
    if (this.capabilities().canDropRemove) {
      if (!isSameList) {
        this.droppedOut.emit(id);
      }
      return;
    }

    if (at === null) {
      return;
    }
    this.dropped.emit({ id, isSameList, at });
  }

  // Every row action names its row. "Rename" repeated down a list of 50 rows
  // tells a screen-reader user which button they are on and nothing about which
  // song it would rename (PRD-UI-SHELL.md §5.2).
  protected hintLabel(row: SongRow): string {
    return $localize`:@@explorer.about:About ${row.name}:name:`;
  }

  protected selectRowLabel(row: SongRow): string {
    return $localize`:@@explorer.selectRow:Select ${row.name}:name:`;
  }

  protected favoriteRowLabel(row: SongRow): string {
    return row.isFavorite
      ? $localize`:@@explorer.unfavoriteRow:Remove ${row.name}:name: from favorites`
      : $localize`:@@explorer.favoriteRow:Add ${row.name}:name: to favorites`;
  }

  protected editRowLabel(row: SongRow): string {
    return $localize`:@@explorer.editRow:Edit ${row.name}:name:`;
  }

  protected renameRowLabel(row: SongRow): string {
    return $localize`:@@explorer.renameRow:Rename ${row.name}:name:`;
  }

  protected duplicateRowLabel(row: SongRow): string {
    return $localize`:@@explorer.duplicateRow:Duplicate ${row.name}:name:`;
  }

  protected deleteRowLabel(row: SongRow): string {
    return $localize`:@@explorer.deleteRow:Delete ${row.name}:name:`;
  }

  protected downloadRowLabel(row: SongRow): string {
    return $localize`:@@explorer.downloadRow:Download ${row.name}:name:`;
  }

  protected exportRowLabel(row: SongRow): string {
    return $localize`:@@explorer.exportRow:Export ${row.name}:name:`;
  }

  protected moreRowLabel(row: SongRow): string {
    return $localize`:@@explorer.moreRow:More actions for ${row.name}:name:`;
  }

  /** Does this row have anything to put behind the `⋯`? The menu is not built
   * otherwise — an empty popover is worse than no button. A read-only row keeps
   * download/export (it has something to hand out) but loses duplicate/delete. */
  protected hasRowMenu(row: SongRow): boolean {
    if (row.isReadOnly) return false; // the virtual All songs row: nothing to offer
    const caps = this.capabilities();
    return (
      caps.canDownload || caps.canExport || caps.canDuplicate || caps.canDelete
    );
  }

  /** The accessible name: the act **and** the row it would act on. */
  protected moveRowLabel(row: SongRow, where: RowMove): string {
    return where === 'start'
      ? $localize`:@@explorer.moveRowStart:Move ${row.name}:name: to the start`
      : where === 'up'
        ? $localize`:@@explorer.moveRowUp:Move ${row.name}:name: up one`
        : where === 'down'
          ? $localize`:@@explorer.moveRowDown:Move ${row.name}:name: down one`
          : $localize`:@@explorer.moveRowEnd:Move ${row.name}:name: to the end`;
  }

  /** Names where it is removed FROM — the load-bearing half of the sentence. */
  protected removeRowLabel(row: SongRow): string {
    return $localize`:@@explorer.removeRow:Remove ${row.name}:name: from this songbook`;
  }

  protected onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.typedQuery.set(value);
    if (this.searchTimer !== null) {
      clearTimeout(this.searchTimer);
    }
    this.searchTimer = setTimeout(
      () => this.queryChange.emit(value),
      SEARCH_DEBOUNCE_MS,
    );
  }

  /**
   * Emptying the box is an explicit act, so it skips the debounce: the user asked
   * for the whole library back, not for it in 200ms. The pending timer is dropped
   * with it, or the keystrokes it was still holding would re-apply the query that
   * was just cleared.
   */
  protected clearQuery(field: HTMLInputElement): void {
    if (this.searchTimer !== null) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
    field.value = '';
    this.typedQuery.set('');
    this.queryChange.emit('');
    field.focus();
  }

  /** A new axis comes with its own natural direction — see `SortChange.dir`. */
  protected onSortPick(event: Event): void {
    const key = (event.target as HTMLSelectElement).value as ExplorerSort;
    this.sortChange.emit({ key });
  }

  protected toggleDir(): void {
    this.sortChange.emit({
      key: this.sort(),
      dir: this.dir() === 'asc' ? 'desc' : 'asc',
    });
  }

  /**
   * `scrolledIndexChange` reports the first rendered index; the viewport renders
   * about a screenful past it. Growing the window a screenful early is what makes
   * the list feel endless rather than paged. `loadMore` is a no-op while loading
   * or exhausted, so firing it often is safe — the store owns that guard.
   */
  protected onScrolledIndex(index: number): void {
    if (index + PREFETCH_ROWS >= this.rows().length) {
      this.loadMore.emit();
    }
  }

  protected onOpen(row: SongRow): void {
    if (this.capabilities().canEdit) {
      this.opened.emit(row.id);
    }
  }

  protected startRename(row: SongRow): void {
    this.renamingId.set(row.id);
  }

  protected cancelRename(): void {
    this.renamingId.set(null);
  }

  /**
   * Enter and blur both commit — a rename you typed and clicked away from was
   * still a rename you typed. Esc is the way out, and it fires first because it
   * clears the mode before the blur it causes can read the field.
   */
  protected commitRename(row: SongRow, event: Event): void {
    if (this.renamingId() !== row.id) {
      return;
    }
    const name = (event.target as HTMLInputElement).value.trim();
    this.renamingId.set(null);
    if (name && name !== row.name) {
      this.renamed.emit({ id: row.id, name });
    }
  }
}
