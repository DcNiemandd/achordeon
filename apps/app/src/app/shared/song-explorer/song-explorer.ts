// Song explorer — Epic 5 ▸ subtasks 1–2
// Spec: CONTEXT.md §Song explorer, §Search, §Favorite; PRD-INFRASTRUCTURE.md §3/§4

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { ScrollingModule } from '@angular/cdk/scrolling';
import {
  Autofocus,
  Button,
  EmptyState,
  Field,
  Icon,
  Tooltip,
} from '../../primitives';
import {
  FULL_CAPABILITIES,
  type ExplorerCapabilities,
  type ExplorerSort,
  type ExplorerSortDir,
  type RenameChange,
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
  imports: [
    ScrollingModule,
    Autofocus,
    Button,
    EmptyState,
    Field,
    Icon,
    Tooltip,
  ],
  template: `
    <!-- A songbook's entry list has nothing to search or sort: its order is the
         content, and re-sorting the thing you are ordering is meaningless. -->
    @if (capabilities().canSearch) {
      <div class="tools">
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
      </div>
    }

    @if (rows().length === 0) {
      <app-empty-state [text]="emptyText()" data-testid="explorer-empty" />
    } @else {
      <cdk-virtual-scroll-viewport
        class="list"
        [itemSize]="ROW_HEIGHT"
        data-testid="explorer-list"
        (scrolledIndexChange)="onScrolledIndex($event)"
      >
        <div
          *cdkVirtualFor="let row of rows(); trackBy: trackById"
          class="row"
          [class.is-current]="row.id === currentId()"
          [class.is-selected]="selectedIds().has(row.id)"
          [class.is-insert-before]="insertAt() === row.position"
          [class.is-insert-after]="isLastAndInsertAtEnd(row)"
          [attr.data-testid]="rowTestid()"
          [attr.data-song-id]="row.id"
        >
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
              [appTooltip]="favoriteRowLabel(row)"
              [attr.data-testid]="'favorite-' + row.id"
              (click)="favorited.emit(row.id)"
            >
              <app-icon name="favorite" [isFilled]="row.isFavorite" />
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

          <div class="row-actions">
            @if (capabilities().canEdit) {
              <button
                appButton
                type="button"
                [isIconOnly]="true"
                [attr.aria-label]="editRowLabel(row)"
                [appTooltip]="editRowLabel(row)"
                [attr.data-testid]="'edit-' + row.id"
                (click)="opened.emit(row.id)"
              >
                <app-icon name="edit" />
              </button>
            }
            @if (capabilities().canRename) {
              <button
                appButton
                type="button"
                [isIconOnly]="true"
                [attr.aria-label]="renameRowLabel(row)"
                [appTooltip]="renameRowLabel(row)"
                [attr.data-testid]="'rename-' + row.id"
                (click)="startRename(row)"
              >
                <app-icon name="rename" />
              </button>
            }
            @if (capabilities().canDuplicate) {
              <button
                appButton
                type="button"
                [isIconOnly]="true"
                [attr.aria-label]="duplicateRowLabel(row)"
                [appTooltip]="duplicateRowLabel(row)"
                [attr.data-testid]="'duplicate-' + row.id"
                (click)="duplicated.emit(row.id)"
              >
                <app-icon name="duplicate" />
              </button>
            }
            @if (capabilities().canRemove) {
              <!-- An X, not a bin: this drops a slot and destroys nothing. The
                   bin is the library's, and it means the song itself
                   (CONTEXT.md §Delete vs Remove). -->
              <button
                appButton
                type="button"
                [isIconOnly]="true"
                [attr.aria-label]="removeRowLabel(row)"
                [appTooltip]="removeRowLabel(row)"
                [attr.data-testid]="'remove-' + row.id"
                (click)="removed.emit([row.id])"
              >
                <app-icon name="close" />
              </button>
            }
            @if (capabilities().canDelete) {
              <button
                appButton
                type="button"
                [isIconOnly]="true"
                [attr.aria-label]="deleteRowLabel(row)"
                [appTooltip]="deleteRowLabel(row)"
                [attr.data-testid]="'delete-' + row.id"
                (click)="deleted.emit([row.id])"
              >
                <app-icon name="delete" />
              </button>
            }
          </div>
        </div>
      </cdk-virtual-scroll-viewport>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-block-size: 0;
      block-size: 100%;
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

    .check {
      accent-color: var(--brand);
      inline-size: 16px;
      block-size: 16px;
      flex: none;
    }

    .star {
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
    .row.is-current .row-actions {
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

  protected readonly ROW_HEIGHT = ROW_HEIGHT;

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
    { value: 'favorite', label: $localize`:@@explorer.sort.favorite:Favorite` },
  ];

  protected readonly dirLabel = computed(() =>
    this.dir() === 'asc'
      ? $localize`:@@explorer.dir.asc:Ascending`
      : $localize`:@@explorer.dir.desc:Descending`,
  );

  protected trackById(_index: number, row: SongRow): string {
    return row.id;
  }

  /** "After the end" has no row of its own, so the last row wears the line. */
  protected isLastAndInsertAtEnd(row: SongRow): boolean {
    const at = this.insertAt();
    return at !== null && at === this.rows().length && row.position === at - 1;
  }

  // Every row action names its row. "Rename" repeated down a list of 50 rows
  // tells a screen-reader user which button they are on and nothing about which
  // song it would rename (PRD-UI-SHELL.md §5.2).
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
