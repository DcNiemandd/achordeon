import { ChordTheory, type ParsedChord } from '@achordeon/shared/domain';
import { findNotationSpans } from './notation-warnings';

/**
 * Enough grammar for "is this a chord", with the same German→English reading the
 * real adapter does (a leading `H` and a `/H` are B natural), so `[H]` counts as
 * a chord here exactly as it does in the app. Root/bass are reported English —
 * which is the whole reason the scan reads the raw token and not `parseChord`.
 */
const QUALITIES = new Set(['', 'm', '7', 'm7', 'maj7', 'sus4', 'dim']);

class StubTheory extends ChordTheory {
  parseChord(text: string): ParsedChord | null {
    const english = text.replace(/(^|\/)H/g, '$1B');
    const m = /^([A-G](?:#|b)?)([^/]*)(?:\/([A-G](?:#|b)?))?$/.exec(english);
    return m && QUALITIES.has(m[2])
      ? { root: m[1], bass: m[3] ?? null, quality: m[2] }
      : null;
  }
  noteChroma(): number | null {
    return null;
  }
}

const find = (content: string, notation: 'english' | 'german') =>
  findNotationSpans(content, notation, new StubTheory());
/** The marked text itself — what a reader of a failure wants to see. */
const marked = (content: string, notation: 'english' | 'german') =>
  find(content, notation).map((span) =>
    content.split('\n')[span.line].slice(span.range[0], span.range[1]),
  );

describe('findNotationSpans', () => {
  describe('english — a German name is foreign', () => {
    it('marks a leading H', () => {
      expect(find('[H]', 'english')).toEqual([{ line: 0, range: [1, 2] }]);
      expect(marked('[Hm]', 'english')).toEqual(['Hm']);
    });

    it('marks a /H bass', () => {
      expect(marked('[C/H]', 'english')).toEqual(['C/H']);
    });

    it('leaves an English B alone', () => {
      expect(find('[B]', 'english')).toEqual([]);
      expect(find('[Bb Bm G/B]', 'english')).toEqual([]);
    });

    it('marks only the foreign name in a row', () => {
      expect(marked('[Em Am H]', 'english')).toEqual(['H']);
    });
  });

  describe('german — a bare B (B natural) is the trap', () => {
    it('marks a bare leading B and its qualities', () => {
      expect(marked('[B]', 'german')).toEqual(['B']);
      expect(marked('[Bm7]', 'german')).toEqual(['Bm7']);
    });

    it('marks a bare /B bass', () => {
      expect(marked('[C/B]', 'german')).toEqual(['C/B']);
    });

    it('leaves Bb alone — it is B♭, the correct German spelling', () => {
      expect(find('[Bb]', 'german')).toEqual([]);
      expect(find('[Bbm]', 'german')).toEqual([]);
      expect(find('[C/Bb]', 'german')).toEqual([]);
    });

    it('leaves a German H alone', () => {
      expect(find('[H]', 'german')).toEqual([]);
      expect(find('[Hm C/H]', 'german')).toEqual([]);
    });
  });

  it('never touches a token that is not a chord', () => {
    // `[Half]` and `[Bells]` lead with the foreign letter but are annotations.
    expect(find('[Half]', 'german')).toEqual([]);
    expect(find('[Bells]', 'german')).toEqual([]);
    expect(find('[Hero]', 'english')).toEqual([]);
  });

  it('reads inside an inline group', () => {
    expect(marked('la [[Am H]] la', 'english')).toEqual(['H']);
  });

  it('ignores brackets on a title/subtitle line', () => {
    expect(find('* [H]', 'english')).toEqual([]);
    expect(find('** [B]', 'german')).toEqual([]);
  });

  it('reports the right line', () => {
    expect(find('[C]\n[H]', 'english')).toEqual([{ line: 1, range: [1, 2] }]);
  });

  it('leaves an unterminated bracket alone', () => {
    expect(find('[H', 'english')).toEqual([]);
  });
});
