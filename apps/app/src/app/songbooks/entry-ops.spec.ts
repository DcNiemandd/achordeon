import { insertEntries, insertionIndex, shiftSelection } from './entry-ops';

describe('insertionIndex', () => {
  it('answers the ends without needing a selection', () => {
    expect(insertionIndex(3, new Set(), 'start')).toBe(0);
    expect(insertionIndex(3, new Set(), 'end')).toBe(3);
  });

  it('brackets a multi-slot selection rather than splitting it', () => {
    const selected = new Set([1, 3]);
    expect(insertionIndex(5, selected, 'above')).toBe(1);
    expect(insertionIndex(5, selected, 'below')).toBe(4);
  });

  it('falls back to the end when there is no anchor', () => {
    expect(insertionIndex(3, new Set(), 'above')).toBe(3);
    expect(insertionIndex(3, new Set(), 'below')).toBe(3);
  });

  it('ignores a selected index the list no longer has', () => {
    expect(insertionIndex(2, new Set([7]), 'above')).toBe(2);
  });
});

describe('insertEntries', () => {
  it('splices at the index', () => {
    expect(insertEntries(['a', 'b'], ['x', 'y'], 1)).toEqual([
      'a',
      'x',
      'y',
      'b',
    ]);
  });

  it('allows the same song in several slots', () => {
    expect(insertEntries(['a'], ['a'], 1)).toEqual(['a', 'a']);
  });

  it('clamps an index outside the list', () => {
    expect(insertEntries(['a'], ['x'], 9)).toEqual(['a', 'x']);
    expect(insertEntries(['a'], ['x'], -3)).toEqual(['x', 'a']);
  });
});

describe('shiftSelection', () => {
  it('moves the slots below the splice down by the count', () => {
    expect([...shiftSelection(new Set([0, 2]), 1, 2)]).toEqual([0, 4]);
  });

  it('leaves a selection above the splice alone', () => {
    expect([...shiftSelection(new Set([0]), 3, 1)]).toEqual([0]);
  });
});
