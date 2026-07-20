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
