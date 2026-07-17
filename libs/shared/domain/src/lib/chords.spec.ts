// Spec: docs/PARSER-GRAMMAR.md §Labelled content, §Escapes, §No nesting
//
// `findLabelDelimiter` is shared by Phase 1 and the editor's highlight grammar,
// so these cases are the contract between what parses as a label and what colours
// as one. The table below is PARSER-GRAMMAR's own.

import { findLabelDelimiter } from './chords';

describe('findLabelDelimiter', () => {
  it.each([
    // [line, expected delimiter index, why]
    ['1.: First verse', 2, 'a plain label'],
    [
      'R:: Block X',
      2,
      'a colon-run: the LAST colon delimits, `R:` is the text',
    ],
    ['1:::', 3, 'a run at end-of-line still delimits'],
    ['Verse:', 5, 'end-of-line delimits, with no content after it'],
    ['Narrator: hi', 8, 'the accepted footgun: this IS a label'],
  ])('%s → %i (%s)', (line, expected) => {
    expect(findLabelDelimiter(line)).toBe(expected);
  });

  it.each([
    ['http://x', 'a colon not followed by space-or-EOL is not a delimiter'],
    ['12:30', 'so times and URLs need no escaping'],
    [': foo', 'empty label text is meaningless'],
    ['\\: escaped', 'an escaped colon never counts'],
    ['no colons here', 'no colon at all'],
    ['12:30 at the park', 'a mid-line colon-run that fails the rule'],
  ])('%s → not a label (%s)', (line) => {
    expect(findLabelDelimiter(line)).toBe(-1);
  });

  it('takes the FIRST qualifying run, not the last', () => {
    expect(findLabelDelimiter('a: b: c')).toBe(1);
  });
});
