import { FakeChordTheory } from './fake-chord-theory.fake';
import { scanContent } from './phase2';

const theory = new FakeChordTheory();
const scan = (content: string) => scanContent(content, theory);

describe('phase2 — inline scan', () => {
  it('anchors a chord over the character after the closing bracket', () => {
    expect(scan('tr[C]ade')).toEqual({
      text: 'trade',
      chords: [{ raw: 'C', at: 2, valid: true }],
    });
  });

  it('anchors an end-of-line bracket at text.length', () => {
    expect(scan('abc[G]')).toEqual({
      text: 'abc',
      chords: [{ raw: 'G', at: 3, valid: true }],
    });
  });

  it('places multiple chords in one bracket at the same index, in order', () => {
    expect(scan('[C G,Am]x')).toEqual({
      text: 'x',
      chords: [
        { raw: 'C', at: 0, valid: true },
        { raw: 'G', at: 0, valid: true },
        { raw: 'Am', at: 0, valid: true },
      ],
    });
  });

  it('keeps an invalid bracket as a verbatim annotation (not literal text)', () => {
    expect(scan('[Solo]riff')).toEqual({
      text: 'riff',
      chords: [{ raw: 'Solo', at: 0, valid: false }],
    });
    expect(scan('la[x2]la')).toEqual({
      text: 'lala',
      chords: [{ raw: 'x2', at: 2, valid: false }],
    });
  });

  it('produces a chord-only line (chords over empty/whitespace text)', () => {
    const line = scan('[C] [G]');
    expect(line.text.trim()).toBe('');
    expect(line.chords.map((c) => c.raw)).toEqual(['C', 'G']);
  });

  describe('escapes', () => {
    it('resolves \\[ \\* \\: \\\\ to literal characters', () => {
      expect(scan('a\\[b').text).toBe('a[b');
      expect(scan('a\\*b').text).toBe('a*b');
      expect(scan('Narrator\\: hi').text).toBe('Narrator: hi');
      expect(scan('a\\\\b').text).toBe('a\\b');
    });

    it('keeps a backslash before a non-escapable char literal', () => {
      expect(scan('C:\\path').text).toBe('C:\\path');
      expect(scan('a\\nb').text).toBe('a\\nb');
    });

    it('resolves \\  to a literal space (the kept-leading-space escape)', () => {
      // Phase 1 strips leading whitespace; `\ ` is how a deliberate one survives,
      // and its backslash must not reach the rendered lyric.
      expect(scan('\\ kept').text).toBe(' kept');
      expect(scan('\\ \\ two').text).toBe('  two');
      // A chord anchored on the escaped space's neighbour counts the space.
      const line = scan('\\ [C]x');
      expect(line.text).toBe(' x');
      expect(line.chords).toEqual([{ raw: 'C', at: 1, valid: true }]);
    });

    it('does not treat an escaped bracket as a chord anchor', () => {
      expect(scan('a\\[C]b')).toEqual({ text: 'a[C]b', chords: [] });
    });

    it('resolves \\] to a literal ], symmetric with \\[', () => {
      // Escaping both brackets for a literal bracketed word must not leave the
      // trailing backslash stranded in the output.
      expect(scan('a\\[word\\]b').text).toBe('a[word]b');
    });

    it('resolves escapes INSIDE a bracket token', () => {
      // A repeat sign must escape its colon to avoid becoming a label, and the
      // backslash must not survive into the rendered annotation.
      const line = scan('[||\\: Em G :||]');
      expect(line.text).toBe('');
      expect(line.chords.map((c) => c.raw)).toEqual(['||:', 'Em', 'G', ':||']);
      // The escaped bars are annotations, the real chords stay valid.
      expect(line.chords.map((c) => c.valid)).toEqual([
        false,
        true,
        true,
        false,
      ]);
    });
  });

  describe('emphasis', () => {
    it('reads one/two/three asterisks as italic/bold/both', () => {
      expect(scan('*i*')).toEqual({
        text: 'i',
        chords: [],
        spans: [{ start: 0, end: 1, italic: true }],
      });
      expect(scan('**b**')).toEqual({
        text: 'b',
        chords: [],
        spans: [{ start: 0, end: 1, bold: true }],
      });
      expect(scan('***bi***')).toEqual({
        text: 'bi',
        chords: [],
        spans: [{ start: 0, end: 2, bold: true, italic: true }],
      });
    });

    it('emphasises a span in the middle of a line', () => {
      expect(scan('a *b* c')).toEqual({
        text: 'a b c',
        chords: [],
        spans: [{ start: 2, end: 3, italic: true }],
      });
    });

    it('nests a different emphasis inside another', () => {
      // Toggle model: bold opens, italic opens and closes inside it, bold closes.
      expect(scan('**a *b* c**')).toEqual({
        text: 'a b c',
        chords: [],
        spans: [
          { start: 0, end: 2, bold: true },
          { start: 2, end: 3, bold: true, italic: true },
          { start: 3, end: 5, bold: true },
        ],
      });
    });

    it('closes an unclosed emphasis at end of line', () => {
      expect(scan('*ab')).toEqual({
        text: 'ab',
        chords: [],
        spans: [{ start: 0, end: 2, italic: true }],
      });
    });

    it('treats four or more asterisks as literal', () => {
      expect(scan('****x')).toEqual({ text: '****x', chords: [] });
    });

    it('keeps an escaped asterisk literal, with no emphasis', () => {
      expect(scan('a\\*b\\*c')).toEqual({ text: 'a*b*c', chords: [] });
    });

    it('overlays emphasis and a chord independently', () => {
      expect(scan('*[C]x*')).toEqual({
        text: 'x',
        chords: [{ raw: 'C', at: 0, valid: true }],
        spans: [{ start: 0, end: 1, italic: true }],
      });
    });
  });

  it('treats an unterminated bracket as a literal [', () => {
    expect(scan('do [re mi')).toEqual({ text: 'do [re mi', chords: [] });
  });

  it('ignores an empty or whitespace-only bracket', () => {
    expect(scan('a[]b')).toEqual({ text: 'ab', chords: [] });
    expect(scan('a[  ]b')).toEqual({ text: 'ab', chords: [] });
  });
});
