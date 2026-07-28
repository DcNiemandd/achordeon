import { FakeChordTheory } from './fake-chord-theory.fake';
import { parse } from './parser';
import { transposeContent } from './transpose';

// The parser feeds a live editor, so it must be TOTAL — any input, including
// half-typed and adversarial text, yields an AST and never throws (ADR-0005).
const theory = new FakeChordTheory();

const ADVERSARIAL = [
  '',
  '   ',
  '\n\n\n',
  '\\', // lone trailing backslash
  '[', // unterminated bracket
  '[C', // half-typed chord
  '[C/', // half-typed slash chord
  '[/G]',
  ']]][[[',
  '[[C]]',
  '[[', // half-typed inline group
  '[[C', // …with a chord started
  '[[C]', // …one bracket short of closing
  '[[]]',
  '[[C]]]',
  '[[C\\]]',
  ']]',
  '][',
  '::::',
  ':::: ',
  '* ',
  '** ',
  '*',
  ':',
  'Verse: [G',
  'Narrator\\:',
  'C:\\path\\to\\file',
  '🎸[C]🔥 unicode 音楽',
  'a'.repeat(5000),
  '* T1\n* T2\n** S1\n\n\nLabel:: body [C][G][Solo]',
];

describe('parser totality', () => {
  it.each(ADVERSARIAL)('parse never throws for %j', (input) => {
    const ast = parse(input, theory);
    expect(Array.isArray(ast.blocks)).toBe(true);
    expect(Array.isArray(ast.warnings)).toBe(true);
  });

  it.each(ADVERSARIAL)('transposeContent never throws for %j', (input) => {
    for (const semitones of [-12, -5, -1, 0, 1, 7, 13]) {
      expect(() => transposeContent(input, semitones, theory)).not.toThrow();
    }
  });

  // The notation option feeds the same rewrite, so it inherits the same duty: it
  // is chosen from a settings panel, not from the text, and no half-typed bracket
  // may become the one input that makes a transpose throw.
  it.each(ADVERSARIAL)(
    'transposeContent never throws in German for %j',
    (input) => {
      for (const semitones of [-12, -5, -1, 0, 1, 7, 13]) {
        expect(() =>
          transposeContent(input, semitones, theory, 'german'),
        ).not.toThrow();
      }
    },
  );

  // And whatever it writes must still parse: a German rewrite that produced a
  // symbol the parser no longer recognised would turn chords into grey
  // annotations on the next keystroke.
  it.each(ADVERSARIAL)('a German rewrite still parses for %j', (input) => {
    for (const semitones of [-12, -1, 1, 7]) {
      const rewritten = transposeContent(input, semitones, theory, 'german');
      const before = parse(input, theory);
      const after = parse(rewritten, theory);
      expect(validity(after)).toEqual(validity(before));
    }
  });
});

/** Every chord anchor's `valid` flag, in reading order. */
function validity(ast: ReturnType<typeof parse>): boolean[] {
  return ast.blocks.flatMap((block) =>
    block.lines.flatMap((line) => line.chords.map((chord) => chord.valid)),
  );
}
