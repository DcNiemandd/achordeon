import { ChordTheory, type ParsedChord } from '@achordeon/shared/domain';
import { findVerbatimSpans } from './verbatim-brackets';

/**
 * A letter A–G, an optional accidental, and a quality from a short list — enough
 * of the real grammar for "is this a chord at all", which is the only question
 * this file asks. The quality list is what makes `Gmimi` and `Guitar` fail, which
 * is the whole point of the tests below; tonal rejects them for the same reason.
 *
 * Local rather than the domain's `FakeChordTheory`, which is excluded from that
 * lib's build and so never crosses the barrel.
 */
const QUALITIES = new Set(['', 'm', '7', 'm7', 'maj7', 'sus4', 'dim']);

class StubTheory extends ChordTheory {
  parseChord(text: string): ParsedChord | null {
    const m = /^([A-G](?:#|b)?)(.*)$/.exec(text);
    return m && QUALITIES.has(m[2])
      ? { root: m[1], bass: null, quality: m[2] }
      : null;
  }
  noteChroma(): number | null {
    return null;
  }
}

const find = (content: string) => findVerbatimSpans(content, new StubTheory());
/** The marked text itself, which is what a reader of a failure wants to see. */
const marked = (content: string) =>
  find(content).map((span) =>
    content.split('\n')[span.line].slice(span.range[0], span.range[1]),
  );

describe('findVerbatimSpans', () => {
  it('marks the one bad name in a row of chords', () => {
    expect(find('[Em Am Gmimi]')).toEqual([{ line: 0, range: [7, 12] }]);
    expect(marked('[Em Am Gmimi]')).toEqual(['Gmimi']);
  });

  it('marks every bad name, not just the first', () => {
    expect(marked('[Ami C Emi]')).toEqual(['Ami', 'Emi']);
  });

  it('splits on commas as well as spaces', () => {
    expect(marked('[C,Ami,G]')).toEqual(['Ami']);
  });

  it('leaves a bracket of chords alone', () => {
    expect(find('la [Am] la')).toEqual([]);
    expect(find('[Em Am G]')).toEqual([]);
  });

  it('marks a chordless bracket as one whole thing, brackets included', () => {
    expect(marked('la [Guitar solo] la')).toEqual(['[Guitar solo]']);
  });

  it('covers both markers of a chordless inline group', () => {
    expect(marked('la [[x2]] la')).toEqual(['[[x2]]']);
  });

  it('marks inside a chord-bearing inline group', () => {
    expect(marked('[[Am F Gx]]')).toEqual(['Gx']);
  });

  it('says nothing about an empty bracket', () => {
    expect(find('la [] la')).toEqual([]);
  });

  it('reports the line each span is on', () => {
    expect(find('[Am]\n\n[x2]')).toEqual([{ line: 2, range: [0, 4] }]);
  });

  it('ignores an escaped bracket, which opens nothing', () => {
    expect(find('a \\[Solo] b')).toEqual([]);
  });

  it('ignores an unterminated bracket, which is literal text', () => {
    expect(find('a [Solo b')).toEqual([]);
  });

  it('ignores a title line, where a bracket is never a chord anyway', () => {
    expect(find('* [Solo]')).toEqual([]);
    expect(find('** [Solo]')).toEqual([]);
  });

  // An escaped `]` does not close the bracket, so the scan must read past it —
  // stopping there would end the bracket in the middle and judge the rest of the
  // line as lyric.
  it('reads past an escaped closing bracket', () => {
    expect(marked('[Am\\] G] la')).toEqual(['Am\\]']);
  });

  it('marks the repeat signs around real chords', () => {
    expect(marked('[||\\: Em G :||]')).toEqual(['||\\:', ':||']);
  });
});
