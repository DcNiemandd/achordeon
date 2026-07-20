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
export type ExplorerSort = 'name' | 'created' | 'changed' | 'favorite';
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

const SORTS: readonly ExplorerSort[] = [
  'name',
  'created',
  'changed',
  'favorite',
];
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
  /** The search box and the sort controls. A songbook's order IS its content,
   * so re-sorting the thing you are ordering is meaningless. */
  readonly canSearch: boolean;
  /** Number each row by its position — only where position is the content. */
  readonly hasOrdinals: boolean;
  /** Multi-select checkboxes. What acts on the selection is the page's business. */
  readonly canSelect: boolean;
  readonly canFavorite: boolean;
  /** Drop the row from THIS list (an X). Not `canDelete`, which destroys. */
  readonly canRemove: boolean;
  /** Open the editor. Identity/destructive — off in the Songbooks panel. */
  readonly canEdit: boolean;
  readonly canRename: boolean;
  readonly canDuplicate: boolean;
  readonly canDelete: boolean;
}

/** The Songs module: everything on. */
export const FULL_CAPABILITIES: ExplorerCapabilities = {
  canSearch: true,
  hasOrdinals: false,
  canSelect: true,
  canFavorite: true,
  canRemove: false,
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
  hasOrdinals: false,
  canSelect: true,
  canFavorite: true,
  canRemove: false,
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
  hasOrdinals: true,
  canSelect: true,
  canFavorite: false,
  canRemove: true,
  canEdit: false,
  canRename: false,
  canDuplicate: false,
  canDelete: false,
};

/** The virtual All songs book: a read-only order, so nothing may be moved out. */
export const READONLY_ENTRY_CAPABILITIES: ExplorerCapabilities = {
  ...ENTRY_CAPABILITIES,
  canSelect: false,
  canRemove: false,
};

/** A rename committed in a row. */
export interface RenameChange {
  readonly id: string;
  readonly name: string;
}
