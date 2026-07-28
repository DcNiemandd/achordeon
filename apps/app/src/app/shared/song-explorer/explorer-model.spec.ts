import {
  ENTRY_CAPABILITIES,
  FULL_CAPABILITIES,
  READONLY_ENTRY_CAPABILITIES,
  toExplorerSort,
  toExplorerSortDir,
} from './explorer-model';

describe('sort params from the URL', () => {
  // The URL is the source of truth for sort (§7), and a search param is user
  // input: `?sort=bogus` is one keystroke away, and an unnarrowed key reaches
  // `pageRecords` and orders the library by a uuid tiebreak.
  it('narrows the axes the explorer offers, and nothing else', () => {
    expect(toExplorerSort('name')).toBe('name');
    expect(toExplorerSort('created')).toBe('created');
    expect(toExplorerSort('changed')).toBe('changed');

    expect(toExplorerSort('favorite')).toBeUndefined();
    expect(toExplorerSort('')).toBeUndefined();
    expect(toExplorerSort(undefined)).toBeUndefined();
  });

  it('narrows the direction, so an absent one can mean "the axis decides"', () => {
    expect(toExplorerSortDir('asc')).toBe('asc');
    expect(toExplorerSortDir('desc')).toBe('desc');
    expect(toExplorerSortDir('sideways')).toBeUndefined();
    expect(toExplorerSortDir(undefined)).toBeUndefined();
  });
});

describe('the virtual All songs capability set', () => {
  /**
   * The whole point of the read-only entry set (CONTEXT.md §Songbook): the book
   * has no arrangement of its own to protect, so **sorting is the one thing it
   * can be told** — and it is told with the same controls the Songs module's
   * list wears, or the two would be sorted in different vocabularies.
   */
  it('offers the same query controls the Songs list does', () => {
    expect(READONLY_ENTRY_CAPABILITIES.canSort).toBe(FULL_CAPABILITIES.canSort);
    expect(READONLY_ENTRY_CAPABILITIES.canSearch).toBe(
      FULL_CAPABILITIES.canSearch,
    );
    expect(READONLY_ENTRY_CAPABILITIES.canFavorite).toBe(
      FULL_CAPABILITIES.canFavorite,
    );
  });

  /**
   * And sorting must never read as reordering. A stored book's order IS its
   * content; this one's is a query, so every tool that would rearrange, remove
   * or destroy a slot stays off — which is what keeps "sorted" and "arranged"
   * from looking like the same act on two lists of the same shape.
   */
  it('keeps every arranging tool off', () => {
    expect(READONLY_ENTRY_CAPABILITIES.canReorder).toBe(false);
    expect(READONLY_ENTRY_CAPABILITIES.canDrag).toBe(false);
    expect(READONLY_ENTRY_CAPABILITIES.canDrop).toBe(false);
    expect(READONLY_ENTRY_CAPABILITIES.canRemove).toBe(false);
    expect(READONLY_ENTRY_CAPABILITIES.canDelete).toBe(false);
    expect(READONLY_ENTRY_CAPABILITIES.canRename).toBe(false);
  });

  /** A slot number is a promise about position, and a list you re-sort has none
   * to make — unlike a stored book's entries, where position is the content. */
  it('numbers nothing, where a stored book numbers everything', () => {
    expect(ENTRY_CAPABILITIES.hasOrdinals).toBe(true);
    expect(READONLY_ENTRY_CAPABILITIES.hasOrdinals).toBe(false);
  });

  /** A stored book has nothing to sort: re-ordering what you are ordering is
   * meaningless, so the two sets must disagree here. */
  it('is the only entry list that can be sorted', () => {
    expect(ENTRY_CAPABILITIES.canSort).toBe(false);
    expect(ENTRY_CAPABILITIES.canSearch).toBe(false);
  });
});
