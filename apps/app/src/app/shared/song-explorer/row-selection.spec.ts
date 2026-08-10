import { RowSelection } from './row-selection';

describe('RowSelection', () => {
  it('the checkbox adds to the selection', () => {
    const selection = new RowSelection();
    selection.toggle('a');
    selection.toggle('b');

    expect([...selection.ids()].sort()).toEqual(['a', 'b']);
    expect(selection.count()).toBe(2);
  });

  it('the checkbox takes a row back off', () => {
    const selection = new RowSelection();
    selection.toggle('a');
    selection.toggle('a');

    expect(selection.isEmpty()).toBe(true);
  });

  // The gesture that made "click a song, press Add" do nothing: the row body was
  // not a way to select at all.
  it('the row replaces the selection with itself', () => {
    const selection = new RowSelection();
    selection.toggle('a');
    selection.toggle('b');
    selection.selectOnly('c');

    expect([...selection.ids()]).toEqual(['c']);
  });

  describe('shift and the checkbox', () => {
    const ORDER = ['a', 'b', 'c', 'd', 'e'];

    it('takes everything from the last row picked to this one', () => {
      const selection = new RowSelection();
      selection.toggle('b');
      selection.extendTo('d', ORDER);

      expect([...selection.ids()].sort()).toEqual(['b', 'c', 'd']);
    });

    it('reaches backwards just as well', () => {
      const selection = new RowSelection();
      selection.toggle('d');
      selection.extendTo('b', ORDER);

      expect([...selection.ids()].sort()).toEqual(['b', 'c', 'd']);
    });

    // Only ever adds: rows ticked by hand elsewhere in the list are what someone
    // reaching for shift is trying to keep.
    it('leaves the rest of the selection alone', () => {
      const selection = new RowSelection();
      selection.toggle('e');
      selection.toggle('a');
      selection.extendTo('c', ORDER);

      expect([...selection.ids()].sort()).toEqual(['a', 'b', 'c', 'e']);
    });

    // The anchor stays put, so pressing twice gives the range you meant.
    it('re-draws from the same anchor, not from the last range', () => {
      const selection = new RowSelection();
      selection.toggle('a');
      selection.extendTo('d', ORDER);
      selection.extendTo('b', ORDER);

      expect([...selection.ids()].sort()).toEqual(['a', 'b', 'c', 'd']);
    });

    it('is a plain tick with nothing to reach back to', () => {
      const selection = new RowSelection();
      selection.extendTo('c', ORDER);

      expect([...selection.ids()]).toEqual(['c']);
    });

    // The anchor was searched out of the list since it was picked.
    it('is a plain tick when the anchor has left the list', () => {
      const selection = new RowSelection();
      selection.toggle('a');
      selection.extendTo('d', ['c', 'd', 'e']);

      expect([...selection.ids()].sort()).toEqual(['a', 'd']);
    });

    it('reaches back to a row the row body picked', () => {
      const selection = new RowSelection();
      selection.selectOnly('b');
      selection.extendTo('d', ORDER);

      expect([...selection.ids()].sort()).toEqual(['b', 'c', 'd']);
    });
  });

  it('drops a row that no longer exists', () => {
    const selection = new RowSelection();
    selection.toggle('a');
    selection.toggle('b');
    selection.deselect('a');

    expect([...selection.ids()]).toEqual(['b']);
    selection.clear();
    expect(selection.isEmpty()).toBe(true);
  });
});
