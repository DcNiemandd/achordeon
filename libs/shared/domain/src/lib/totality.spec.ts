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
});
