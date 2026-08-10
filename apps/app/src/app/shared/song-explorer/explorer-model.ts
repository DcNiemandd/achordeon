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
   * A per-*row* exception to the per-*mount* capability rule: capabilities answer
   * "what may be done on this screen", which a row cannot know, while this
   * answers "what is this row made of", which nothing else can. Opening still
   * works — there is something to open.
   */
  readonly isReadOnly?: boolean;
  /**
   * This row holds nothing — an empty songbook, or All songs on an empty library.
   * The other fact only the row knows, and the reason Perform disappears rather
   * than greying out: an empty songbook cannot be performed (Epic 8), and the
   * stage picker's own answer to this is to hide the row, not to disable it,
   * because a greyed-out control trains you to click it anyway. Absent means
   * "holds something", which is right for a song — a song is never empty in this
   * sense.
   */
  readonly isEmpty?: boolean;
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
  /**
   * Rows carry a **drag handle** (Epic 14) — the row itself never starts a drag.
   * A row is already a click target that selects, and a list where pressing a
   * row might drag it is a list you cannot click confidently on touch.
   */
  readonly canDrag: boolean;
  /** This list **accepts** a drop. Separate from `canDrag` because the library
   * is a source and never a destination: its order is a sort, not an
   * arrangement, so there is no "here" to drop something at. */
  readonly canDrop: boolean;
  /**
   * A row dropped here from **another** list is taken out of that one (Epic 7
   * follow-up). The songbook builder's library pane: dragging a slot back onto
   * the library is how you remove it from the book. Distinct from `canDrop`,
   * which inserts at a position — this has no position, only "out".
   */
  readonly canDropRemove: boolean;
  /**
   * Take this row to the stage (Epic 8). Only the songbook list has it: a song is
   * performed as part of a book, and a slot inside one is already in the book you
   * would be performing. **Not gated on `isReadOnly`** — All songs is read-only
   * and is the most likely thing to perform on the spur of the moment.
   */
  readonly canPerform: boolean;
  /** Open the editor. Identity/destructive — off in the Songbooks panel. */
  readonly canEdit: boolean;
  /**
   * A magnifier that opens this row's render in a dialog — **look, without going
   * in to edit** (the songbook builder's panes). It is the read half of the pair
   * `canEdit` is the write half of: the builder turns editing off because you are
   * arranging songs here, not administering them, but you still want to see what
   * a song looks like before you drop it in a book. The dialog it opens carries
   * its own way through to the editor, so this is not a back door to `canEdit`.
   */
  readonly canPreview: boolean;
  readonly canRename: boolean;
  readonly canDuplicate: boolean;
  readonly canDelete: boolean;
  /**
   * Take this row away as a file — a page, a picture, or the Achordeon file,
   * which its dialog asks about. Off in the songbook builder's panes, where a
   * whole book downloads rather than a slot.
   *
   * There is no `canExport` beside it any more: Download and Export were one
   * subject asked twice, so they are one row action opening one dialog.
   */
  readonly canDownload: boolean;
  /**
   * Configure this row — the songbook's own scope of the render cascade plus
   * its title-page fields (CONTEXT.md §Render settings). Only the songbook list
   * has it: a song carries no such scope, and the builder configures the book it
   * has open from the action bar instead. A secondary action, so it rides in the
   * `⋯` menu with the rest; off for the read-only All songs, which has no record
   * to configure.
   */
  readonly canConfigure: boolean;
  /**
   * Fold the secondary row actions (perform, duplicate, download, delete)
   * behind a `⋯` menu, keeping the everyday ones in reach. True where a row
   * carries many actions and few of them are everyday.
   *
   * **A wish, not a promise.** A menu holding one item is a click to reveal a
   * click, so where the count comes to one the action is laid out on the row
   * instead, whatever this says (see `secondaryActionCount`).
   */
  readonly usesRowMenu: boolean;
  /**
   * Keep **duplicate** out of the `⋯` and on the row itself.
   *
   * The third action in both libraries: copying a book is how you make next
   * week's set out of last week's, and copying a song is how you try an
   * arrangement without risking the one that works. Both are everyday acts on
   * **one row**, which is the whole reason they are here and not in the page's
   * bulk bar. Only meaningful alongside `usesRowMenu` — without a menu every
   * action is already on the row.
   */
  readonly hasInlineDuplicate: boolean;
  /**
   * This mount answers to the keyboard: the arrows move the current row, Enter
   * opens it, and the row actions have bare keys (ADR-0015).
   *
   * **A capability rather than "whichever list has focus"**, because the rows
   * are drawn by a virtual scroll: there is no focus ring roving over them to
   * read, and the current row is a signal the presenter owns. Where two
   * explorers share a screen (the songbook builder) neither takes the keys —
   * with no focus to arbitrate between them, a bare `f` would have to guess
   * which list it meant.
   */
  readonly hasKeyboard: boolean;
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
  canDrag: false,
  canDrop: false,
  canPerform: false,
  canEdit: true,
  // The Songs module opens the editor from the row directly, so there is nothing
  // a look-first preview would buy that a click does not already give.
  canPreview: false,
  canRename: true,
  canDuplicate: true,
  canDelete: true,
  canDownload: true,
  canConfigure: false,
  canDropRemove: false,
  usesRowMenu: true,
  hasInlineDuplicate: true,
  hasKeyboard: true,
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
  canDrag: true,
  canDrop: false,
  canPerform: false,
  canEdit: false,
  // Editing is off — you are picking, not administering — but looking is not:
  // the magnifier reads a song's render in a dialog before you add it to a book.
  canPreview: true,
  canRename: false,
  canDuplicate: false,
  canDelete: false,
  canDownload: false,
  canConfigure: false,
  canDropRemove: true,
  usesRowMenu: false,
  hasInlineDuplicate: false,
  hasKeyboard: false,
};

/**
 * A songbook's entry list (Epic 6): **the same component again**, a third time.
 *
 * Numbered, arrangeable, and with neither search nor sort — the order is the
 * content. Selecting works exactly as it does in the library, which is the
 * point: two lists side by side that behaved differently to the same click was
 * the whole complaint.
 *
 * **No per-row remove** (`canRemove: false`): taking a song out of the book is
 * the minus button in the transfer strip, which acts on the slot selection — the
 * same gesture, in the same column, as putting one in. A second remove hanging
 * off each row was a fifth way to do the one thing the strip already does.
 */
export const ENTRY_CAPABILITIES: ExplorerCapabilities = {
  canSearch: false,
  canSort: false,
  hasOrdinals: true,
  canSelect: true,
  canFavorite: false,
  canRemove: false,
  canReorder: true,
  canDrag: true,
  canDrop: true,
  canPerform: false,
  canEdit: false,
  // A slot is a song in the book; looking at its render before you reorder or
  // remove it is the same want the library pane has, so the magnifier is here too.
  canPreview: true,
  canRename: false,
  canDuplicate: false,
  canDelete: false,
  canDownload: false,
  canConfigure: false,
  canDropRemove: false,
  usesRowMenu: false,
  hasInlineDuplicate: false,
  hasKeyboard: false,
};

/**
 * The songbook list (Epic 6): the same component a fourth time.
 *
 * No checkboxes — nothing acts on several songbooks at once yet — and no
 * search: a library holds hundreds of songs and a handful of books. A click
 * selects (pane B previews its title page), a double click opens it.
 *
 * The row reads **edit, rename, duplicate, `⋯`** — the three things you do to a
 * book you are keeping, and then everything else. It used to lay all seven out,
 * which is a hover strip you have to aim within rather than read.
 */
export const SONGBOOK_LIST_CAPABILITIES: ExplorerCapabilities = {
  canSearch: false,
  canSort: false,
  hasOrdinals: false,
  canSelect: false,
  canFavorite: false,
  canRemove: false,
  canReorder: false,
  canDrag: false,
  canDrop: false,
  // The one mount that performs: this row IS a songbook, and taking it to the
  // stage is the most everyday thing anyone does with one.
  canPerform: true,
  canEdit: true,
  // A row here is a whole book, not a song; pane B already previews the book you
  // pick, so a per-row magnifier would name the wrong thing.
  canPreview: false,
  canRename: true,
  canDuplicate: true,
  canDelete: true,
  canDownload: true,
  // The one mount that configures: a settings item in the ⋯ opens the book's
  // own scope of the cascade and its title-page fields.
  canConfigure: true,
  canDropRemove: false,
  usesRowMenu: true,
  hasInlineDuplicate: true,
  hasKeyboard: true,
};

/** Where a per-row move sends that one row. Same vocabulary as the toolbar's,
 * because it is the same act on a selection of one. */
export type RowMove = 'start' | 'up' | 'down' | 'end';

export interface RowMoveRequest {
  readonly id: string;
  readonly where: RowMove;
}

/**
 * A row was dropped onto a list that accepts drops (Epic 14).
 *
 * Emitted by the **receiving** list, because it is the only one that knows where
 * the pointer was over it. `id` is in the *source* list's id-space — a song id
 * coming from the library, a slot key coming from the list's own rows — and
 * `isSameList` is what tells the two apart, so the presenter never has to guess
 * which of its two id-spaces it has been handed.
 */
export interface RowDrop {
  readonly id: string;
  readonly isSameList: boolean;
  /** The boundary the insertion line was drawn at: 0 is before the first row,
   * `rows.length` after the last. Not a splice index — see `moveEntriesTo`. */
  readonly at: number;
}

/**
 * A tick was pressed.
 *
 * `isRange` is Shift being held: **everything from the last row picked to this
 * one**, the gesture every file manager and mail client already taught. The list
 * says only *which row and how*, because the two facts a range needs — where the
 * previous pick was, and what counts as "in between" — belong to the selection
 * and to the order it is being drawn in, and neither of those is a checkbox's
 * business.
 */
export interface RowSelect {
  readonly id: string;
  readonly isRange: boolean;
}

/** A rename committed in a row. */
export interface RenameChange {
  readonly id: string;
  readonly name: string;
}
