// Spec: docs/PARSER-GRAMMAR.md §Labelled content, §Escapes, §No nesting
//
// `findLabelDelimiter` is shared by Phase 1 and the editor's highlight grammar,
// so these cases are the contract between what parses as a label and what colours
// as one. The table below is PARSER-GRAMMAR's own.

import {
  bracketAt,
  emphasisMarkers,
  emphasisSpans,
  findLabelDelimiter,
} from './chords';

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

describe('bracketAt', () => {
  // Also the editor's caret guard: the toolbar greys out bold/italic where this
  // finds a bracket, and enables ♯/♭ there. Same walk as Phase 2's, so a button's
  // enabled state and what the button then does can never disagree.

  it.each([
    // [caret index, why]
    [1, 'just past the opening bracket'],
    [2, 'mid-chord'],
    [3, 'on the closing bracket'],
  ])('[Am] at %i is inside the chord (%s)', (index) => {
    expect(bracketAt('[Am] la', index)).toEqual({
      start: 0,
      end: 3,
      inline: false,
    });
  });

  it.each([
    ['[Am] la', 0, 'on the opening bracket, not yet in'],
    ['[Am] la', 4, 'past the closing bracket'],
    ['\\[Am] la', 3, 'an escaped `[` opens nothing (§Escapes)'],
    ['[[Am]] la', 1, 'between the two `[` of an inline group'],
  ])('%s at %i is inside none (%s)', (line, index) => {
    expect(bracketAt(line, index)).toBeNull();
  });

  it('reads an inline group as one bracket', () => {
    expect(bracketAt('[[Am]] la', 3)).toEqual({
      start: 0,
      end: 4,
      inline: true,
    });
  });

  it.each([
    // An unterminated `[` is literal text, not a bracket — the same reading Phase
    // 2 takes when it emits a bare `[`. The repeat sign is why anyone writes one.
    [1, 'right after the stray `['],
    [6, 'mid-line'],
    [28, 'end of line'],
  ])('an unclosed `[` is inside none, at %i (%s)', (index) => {
    expect(bracketAt('[||\\: Em G Em G Em A G G :||', index)).toBeNull();
  });
});

describe('emphasisMarkers', () => {
  /** The map as `[start, length]` pairs, in reading order. */
  const groups = (s: string, from?: number) =>
    [...emphasisMarkers(s, from)].sort((a, b) => a[0] - b[0]);

  /** Every `*` the map leaves uncovered — the asterisks that print. */
  const printed = (s: string, from?: number) => {
    const covered = new Set<number>();
    for (const [at, length] of emphasisMarkers(s, from)) {
      for (let k = 0; k < length; k++) {
        covered.add(at + k);
      }
    }
    return [...s].flatMap((c, at) =>
      c === '*' && at >= (from ?? 0) && !covered.has(at) ? [at] : [],
    );
  };

  it.each([
    ['*i*', 'a closed pair'],
    ['**a *b* c**', 'a nest: the exact pass stops the `*` eating a `**`'],
    ['* a *', 'nothing is required either side of a marker'],
    ['2* and 3*', 'the accepted cost of that: two strays on a line do pair'],
    ['****A****', 'any length pairs; what four asterisks MEAN is Phase 2'],
  ])('%s → every asterisk is markup (%s)', (line) => {
    expect(printed(line)).toEqual([]);
  });

  it('never reads an asterisk Phase 2 will not reach', () => {
    expect(groups('a\\*b\\*c')).toEqual([]); // resolved by the escape, not here
    expect(groups('*a [Solo*] b*')).toEqual([
      // the one in the bracket is chord text, so the outer pair still meets
      [0, 1],
      [12, 1],
    ]);
  });

  it.each([
    ['*ab', [0], 'nothing matches it'],
    ['Refrain (2*)', [10], 'the footnote mark this whole rule exists for'],
    ['*a*b*', [4], 'the pair closes; the third has nothing left to match'],
    ['*asd**', [5], "a closer's surplus prints"],
    [
      '**asd***',
      [7],
      'the closer spends two, as the opener did, and has one over',
    ],
    ['***a**', [0], 'the repair spends two against two and prints the third'],
    ['**a*b', [0], 'the repair pairs one against one and prints the other'],
    ['****x', [0, 1, 2, 3], 'one run alone on a line has nothing to pair with'],
    ['***** a as****', [0], 'four against four; the odd one out prints'],
  ])('%s → %j printed (%s)', (line, expected) => {
    expect(printed(line)).toEqual(expected);
  });

  it('nests by closing the innermost emphasis first', () => {
    expect(groups('**a *b* c**')).toEqual([
      [0, 2],
      [4, 1],
      [6, 1],
      [9, 2],
    ]);
  });

  it('repairs a mismatch from the inside out, leaving the surplus outside', () => {
    // Five open, four close: the opener keeps its LEFTMOST asterisk as text and
    // spends the four that sit next to the words.
    expect(groups('***** a as****')).toEqual([
      [1, 4],
      [10, 4],
    ]);
    // A lone `*` cannot close a `**` exactly, so the repair pairs one with one —
    // the `**`'s second asterisk, with the first left to print.
    expect(groups('**a*b')).toEqual([
      [1, 1],
      [3, 1],
    ]);
  });

  it('skips a label marker and still reports absolute indices', () => {
    expect(groups('R*: *a*', 3)).toEqual([
      [4, 1],
      [6, 1],
    ]);
    expect(printed('R*: *a', 4)).toEqual([4]);
  });
});

describe('emphasisSpans', () => {
  // The toolbar's view of the same markers: which pair encloses what. Bold and
  // Italic rewrite a span, so a span the markers made has to be nameable — reading
  // the asterisks next to a word cannot see one that starts a phrase away.

  it('pairs the markers of a phrase', () => {
    expect(emphasisSpans('**Karneval karneval**')).toEqual([
      { start: 0, end: 19, length: 2 },
    ]);
  });

  it('reports the innermost span first', () => {
    // Closing order: the `*b*` closes before the bold it sits in, so a caret in
    // `b` finds the italic and a caret in `a` finds the bold.
    expect(emphasisSpans('**a *b* c**')).toEqual([
      { start: 4, end: 6, length: 1 },
      { start: 0, end: 9, length: 2 },
    ]);
  });

  it('leaves the asterisks that only print out of it', () => {
    expect(emphasisSpans('*ab')).toEqual([]); // matches nothing, so spans nothing
    // The closer spends one and prints the other; the span is the pair, not the run.
    expect(emphasisSpans('*asd**')).toEqual([{ start: 0, end: 4, length: 1 }]);
  });

  it('is blind to a bracket, like the markers it reads', () => {
    // The `*` in the chord is text, so the two outside it are the pair.
    expect(emphasisSpans('*a [Solo*] b*')).toEqual([
      { start: 0, end: 12, length: 1 },
    ]);
  });

  it('skips a label marker and still reports absolute indices', () => {
    expect(emphasisSpans('R*: *a*', 3)).toEqual([
      { start: 4, end: 6, length: 1 },
    ]);
  });
});
