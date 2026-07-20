import {
  insertEntries,
  insertionIndex,
  moveEntries,
  shiftSelection,
} from './entry-ops';

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

describe('moveEntries', () => {
  const list = ['a', 'b', 'c', 'd'];

  it('moves one slot over, and the selection with it', () => {
    const up = moveEntries(list, new Set([2]), 'up');
    expect(up.entries).toEqual(['a', 'c', 'b', 'd']);
    expect([...up.selected]).toEqual([1]);

    const down = moveEntries(list, new Set([2]), 'down');
    expect(down.entries).toEqual(['a', 'b', 'd', 'c']);
    expect([...down.selected]).toEqual([3]);
  });

  it('sends the selection to either end, keeping its order', () => {
    const start = moveEntries(list, new Set([1, 3]), 'start');
    expect(start.entries).toEqual(['b', 'd', 'a', 'c']);
    expect([...start.selected].sort()).toEqual([0, 1]);

    const end = moveEntries(list, new Set([0, 1]), 'end');
    expect(end.entries).toEqual(['c', 'd', 'a', 'b']);
    expect([...end.selected].sort()).toEqual([2, 3]);
  });

  it('holds at the wall instead of falling off it', () => {
    const up = moveEntries(list, new Set([0]), 'up');
    expect(up.entries).toEqual(list);
    expect([...up.selected]).toEqual([0]);

    const down = moveEntries(list, new Set([3]), 'down');
    expect(down.entries).toEqual(list);
  });

  it('stacks a blocked selection against the wall rather than freezing it', () => {
    // 'a' is already at the top; 'c' still has somewhere to go.
    const up = moveEntries(list, new Set([0, 2]), 'up');
    expect(up.entries).toEqual(['a', 'c', 'b', 'd']);
    expect([...up.selected].sort()).toEqual([0, 1]);
  });

  it('keeps two selected neighbours from swapping with each other', () => {
    const up = moveEntries(list, new Set([1, 2]), 'up');
    expect(up.entries).toEqual(['b', 'c', 'a', 'd']);
    expect([...up.selected].sort()).toEqual([0, 1]);
  });

  it('is a no-op with nothing selected', () => {
    expect(moveEntries(list, new Set(), 'up').entries).toEqual(list);
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
