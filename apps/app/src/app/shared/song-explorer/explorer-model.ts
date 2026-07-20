// Song explorer contract — Epic 5 ▸ subtask 1
// Spec: CONTEXT.md §Song explorer, §Search, §Favorite; PRD-INFRASTRUCTURE.md §3/§4

/**
 * One row, in the shape the list draws — not the shape `Song` has. The presenter
 * owns the mapping (PRD-UI-SHELL.md §3), so the explorer never sees `content`,
 * `settings` or a tombstone.
 *
 * `title`/`subtitle` come from the Song's parser **cache**, not a re-parse: they
 * are derived-and-stored precisely so a list of 500 songs costs no parsing.
 */
export interface SongRow {
  /**
   * What this row IS, for selection and every row action.
   *
   * A library row is a Song, so its id is the song's. **A songbook row is a
   * slot**, and a slot is a position — the same song may fill several of them,
   * so its id is the slot's key and never the song's, or removing one slot
   * would take its twins with it (CONTEXT.md §Songbook).
   */
  readonly id: string;
  readonly name: string;
  readonly title: string;
  readonly subtitle: string;
  readonly isFavorite: boolean;
  /**
   * The row's index in the list it is being drawn in. Shown as the slot number
   * where position is the content (a songbook), and used to place the insertion
   * line — both of which the list would otherwise have to infer from the
   * viewport, which renders only a window of the rows.
   */
  readonly position: number;
  /**
   * This row has no record behind it to rename or destroy — the virtual **All
   * songs** songbook is the case (CONTEXT.md §Songbook).
   *
   * A per-*row* exception to the per-*mount* capability rule, and the only one:
   * capabilities answer "what may be done on this screen", which a row cannot
   * know, while this answers "what is this row made of", which nothing else
   * can. Opening still works — there is something to open.
   */
  readonly isReadOnly?: boolean;
  /**
   * A `(?)` note about what this row *is*, for a row that is not what it looks
   * like — the virtual **All songs** book, which is the library wearing a
   * songbook's clothes. Absent on ordinary rows, which explain themselves.
   */
  readonly hint?: string;
}

/**
 * The sort axes the explorer offers (CONTEXT.md §Song explorer).
 *
 * Declared here rather than imported from `shared/data-access`, which the import
 * ladder forbids this folder from touching (PRD-UI-SHELL.md §3). It is
 * structurally the store's `SortKey`, so the presenter passes a value straight
 * through and a drift between the two breaks *its* build — which is where a
 * mismatch should surface, since the presenter is the only thing that spans both.
 */
export type ExplorerSort = 'name' | 'created' | 'changed';
export type ExplorerSortDir = 'asc' | 'desc';

export interface SortChange {
  readonly key: ExplorerSort;
  /**
   * Omitted = "this axis's natural direction", which is not the same as the
   * direction the previous axis happened to be pointing. Switching from Name
   * (A→Z) to Created must mean newest-first, not oldest-first: carrying `asc`
   * across the switch answers a question nobody asked.
   */
  readonly dir?: ExplorerSortDir;
}

const SORTS: readonly ExplorerSort[] = ['name', 'created', 'changed'];
const DIRS: readonly ExplorerSortDir[] = ['asc', 'desc'];

/**
 * Narrow a URL param to a sort axis, or `undefined` if it is not one.
 *
 * A search param is **user input** — `?sort=bogus` is one keystroke away, and a
 * TypeScript annotation on a route input asserts a shape the router never
 * checked. Unnarrowed, an unknown key reaches `pageRecords` and falls through its
 * sort branches to an all-equal value, leaving the library ordered by a uuid
 * tiebreak. Narrow at the boundary where untrusted text becomes a typed value.
 */
export function toExplorerSort(
  value: string | undefined,
): ExplorerSort | undefined {
  return SORTS.find((sort) => sort === value);
}

export function toExplorerSortDir(
  value: string | undefined,
): ExplorerSortDir | undefined {
  return DIRS.find((dir) => dir === value);
}

/**
 * What this mounting of the explorer may do. **One component, capability set per
 * context** (CONTEXT.md §Song explorer): the Songs module gets full power; the
 * Songbooks left panel (Epic 6) turns the identity/destructive actions off and
 * keeps search, sort, select and favorite.
 *
 * Capabilities are per-*mount*, never per-row: a row does not know where it is.
 */
export interface ExplorerCapabilities {
  /** The search box. */
  readonly canSearch: boolean;
  /** The sort axis, its direction, and the favourites-first toggle. A stored
   * songbook's order IS its content, so re-sorting what you are ordering is
   * meaningless; the virtual All songs book has no order of its own to protect,
   * so sorting is the only thing it *can* offer. */
  readonly canSort: boolean;
  /** Number each row by its position — only where position is the content. */
  readonly hasOrdinals: boolean;
  /** Multi-select checkboxes. What acts on the selection is the page's business. */
  readonly canSelect: boolean;
  readonly canFavorite: boolean;
  /** Drop the row from THIS list (an X). Not `canDelete`, which destroys. */
  readonly canRemove: boolean;
  /** Per-row move buttons. They act on **that row alone**, never the selection
   * — the row you are pointing at is the row you meant. */
  readonly canReorder: boolean;
  /** Open the editor. Identity/destructive — off in the Songbooks panel. */
  readonly canEdit: boolean;
  readonly canRename: boolean;
  readonly canDuplicate: boolean;
  readonly canDelete: boolean;
}

/** The Songs module: everything on. */
export const FULL_CAPABILITIES: ExplorerCapabilities = {
  canSearch: true,
  canSort: true,
  hasOrdinals: false,
  canSelect: true,
  canFavorite: true,
  canRemove: false,
  canReorder: false,
  canEdit: true,
  canRename: true,
  canDuplicate: true,
  canDelete: true,
};

/**
 * The Songbooks left panel (Epic 6): you are picking songs, not administering
 * them. Renaming or deleting a song from inside a songbook edits the *library*,
 * which is a different job in a different module.
 */
export const REDUCED_CAPABILITIES: ExplorerCapabilities = {
  canSearch: true,
  canSort: true,
  hasOrdinals: false,
  canSelect: true,
  canFavorite: true,
  canRemove: false,
  canReorder: false,
  canEdit: false,
  canRename: false,
  canDuplicate: false,
  canDelete: false,
};

/**
 * A songbook's entry list (Epic 6): **the same component again**, a third time.
 *
 * Numbered, removable, and with neither search nor sort — the order is the
 * content. Selecting works exactly as it does in the library, which is the
 * point: two lists side by side that behaved differently to the same click was
 * the whole complaint.
 */
export const ENTRY_CAPABILITIES: ExplorerCapabilities = {
  canSearch: false,
  canSort: false,
  hasOrdinals: true,
  canSelect: true,
  canFavorite: false,
  canRemove: true,
  canReorder: true,
  canEdit: false,
  canRename: false,
  canDuplicate: false,
  canDelete: false,
};

/** The virtual All songs book: a read-only order, so nothing may be moved out. */
export const READONLY_ENTRY_CAPABILITIES: ExplorerCapabilities = {
  ...ENTRY_CAPABILITIES,
  // The virtual All songs book: nothing to arrange, so **sorting is the one
  // thing it can be told** (CONTEXT.md §Songbook — read-only order).
  canSort: true,
  canSelect: false,
  canRemove: false,
  canReorder: false,
};

/**
 * The songbook list (Epic 6): the same component a fourth time.
 *
 * No checkboxes — nothing acts on several songbooks at once yet — and no
 * search: a library holds hundreds of songs and a handful of books. A click
 * selects (pane B previews its title page), a double click opens it.
 */
export const SONGBOOK_LIST_CAPABILITIES: ExplorerCapabilities = {
  canSearch: false,
  canSort: false,
  hasOrdinals: false,
  canSelect: false,
  canFavorite: false,
  canRemove: false,
  canReorder: false,
  canEdit: true,
  canRename: true,
  canDuplicate: false,
  canDelete: true,
};

/** Where a per-row move sends that one row. Same vocabulary as the toolbar's,
 * because it is the same act on a selection of one. */
export type RowMove = 'start' | 'up' | 'down' | 'end';

export interface RowMoveRequest {
  readonly id: string;
  readonly where: RowMove;
}

/** A rename committed in a row. */
export interface RenameChange {
  readonly id: string;
  readonly name: string;
}
