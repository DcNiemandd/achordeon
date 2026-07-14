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

    it('does not treat an escaped bracket as a chord anchor', () => {
      expect(scan('a\\[C]b')).toEqual({ text: 'a[C]b', chords: [] });
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
