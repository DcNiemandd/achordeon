// Song explorer — Epic 5 ▸ subtasks 1–2
// Spec: CONTEXT.md §Song explorer, §Search, §Favorite; PRD-INFRASTRUCTURE.md §3/§4

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
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
 * The rich Song list: search, sort, multi-select, bulk actions, row actions
 * (CONTEXT.md §Song explorer).
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
    <div class="tools">
      <div class="search">
        <app-icon name="search" class="search-icon" />
        <input
          appField
          type="search"
          class="search-field"
          [value]="query()"
          [attr.aria-label]="searchLabel"
          [attr.placeholder]="searchLabel"
          data-testid="explorer-search"
          (input)="onSearchInput($event)"
        />
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

    <!-- The bulk bar exists only while a selection does: a permanently mounted
         bar of disabled buttons is a worse answer than one that appears. -->
    @if (capabilities().canSelect && selectedIds().size > 0) {
      <div class="bulk" data-testid="explorer-bulk">
        <span class="bulk-count">{{ selectionLabel() }}</span>

        <!-- Epic 6 projects "Add to songbook" here. The explorer does not know
             what a songbook is, and must not learn. -->
        <ng-content select="[bulk-actions]" />

        @if (capabilities().canFavorite) {
          <button
            appButton
            type="button"
            variant="ghost"
            data-testid="explorer-bulk-favorite"
            (click)="favoritedMany.emit([...selectedIds()])"
          >
            {{ favoriteLabel }}
          </button>
        }

        @if (capabilities().canDelete) {
          <button
            appButton
            type="button"
            variant="ghost"
            data-testid="explorer-bulk-delete"
            (click)="deleted.emit([...selectedIds()])"
          >
            {{ deleteLabel }}
          </button>
        }

        <button
          appButton
          type="button"
          variant="ghost"
          data-testid="explorer-bulk-clear"
          (click)="selectionCleared.emit()"
        >
          {{ clearLabel }}
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
          [attr.data-testid]="'song-row'"
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
              <app-icon name="favorite" />
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

    .sort {
      block-size: 32px;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-md);
      background: var(--surface);
      color: var(--text);
      font: inherit;
      font-size: var(--text-sm);
    }

    .bulk {
      display: flex;
      align-items: center;
      gap: var(--space-1);
      padding: var(--space-1) var(--space-2);
      background: var(--brand-subtle);
      border-block-end: 1px solid var(--border);
    }

    .bulk-count {
      margin-inline-end: auto;
      font-size: var(--text-sm);
      color: var(--brand);
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

    .row:hover .row-actions,
    .row:focus-within .row-actions {
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

  readonly queryChange = output<string>();
  readonly sortChange = output<SortChange>();
  /** The window is within a page of its end — grow it (PRD-INFRA §3). */
  readonly loadMore = output<void>();
  /** A row was clicked: make it the current song. Does not open the editor. */
  readonly activated = output<string>();
  /** Open this song in the editor. */
  readonly opened = output<string>();
  readonly selectToggled = output<string>();
  readonly selectionCleared = output<void>();
  readonly favorited = output<string>();
  readonly favoritedMany = output<string[]>();
  /**
   * A request to delete, never the deed — one id from a row, many from the bulk
   * bar. Deleting a song can destroy songbook entries, so what happens next
   * (warn, confirm, cascade) is the presenter's call, not a list's.
   */
  readonly deleted = output<string[]>();
  readonly renamed = output<RenameChange>();
  readonly duplicated = output<string>();

  protected readonly ROW_HEIGHT = ROW_HEIGHT;

  /** The only state this component owns: which row is mid-rename. */
  protected readonly renamingId = signal<string | null>(null);

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly searchLabel = $localize`:@@explorer.search:Search songs`;
  protected readonly sortLabel = $localize`:@@explorer.sort:Sort by`;
  protected readonly clearLabel = $localize`:@@explorer.clearSelection:Clear`;
  protected readonly favoriteLabel = $localize`:@@explorer.favorite:Favorite`;
  protected readonly deleteLabel = $localize`:@@explorer.delete:Delete`;

  protected readonly sortOptions: readonly {
    value: ExplorerSort;
    label: string;
  }[] = [
    { value: 'name', label: $localize`:@@explorer.sort.name:Name` },
    { value: 'created', label: $localize`:@@explorer.sort.created:Created` },
    { value: 'changed', label: $localize`:@@explorer.sort.changed:Changed` },
    { value: 'favorite', label: $localize`:@@explorer.sort.favorite:Favorite` },
  ];

  protected readonly selectionLabel = computed(
    () =>
      $localize`:@@explorer.selected:${this.selectedIds().size}:count: selected`,
  );

  protected readonly dirLabel = computed(() =>
    this.dir() === 'asc'
      ? $localize`:@@explorer.dir.asc:Ascending`
      : $localize`:@@explorer.dir.desc:Descending`,
  );

  protected trackById(_index: number, row: SongRow): string {
    return row.id;
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

  protected onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (this.searchTimer !== null) {
      clearTimeout(this.searchTimer);
    }
    this.searchTimer = setTimeout(
      () => this.queryChange.emit(value),
      SEARCH_DEBOUNCE_MS,
    );
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
