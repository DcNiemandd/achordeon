import {
  ENTRY_CAPABILITIES,
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

/**
 * A stored songbook's entry list, which is now the only entry list there is.
 *
 * Its order IS its content — an array of slots you arranged — so there is nothing
 * for a search or a sort to do: re-ordering what you are ordering is meaningless.
 * The virtual All songs used to mount this list with sorting turned on, back when
 * it was a screen you could open; that order is asked for in the Stage picker now.
 */
describe('the entry list capability set', () => {
  it('offers no search and no sort', () => {
    expect(ENTRY_CAPABILITIES.canSearch).toBe(false);
    expect(ENTRY_CAPABILITIES.canSort).toBe(false);
  });

  it('numbers its slots, because position is the content', () => {
    expect(ENTRY_CAPABILITIES.hasOrdinals).toBe(true);
  });
});
