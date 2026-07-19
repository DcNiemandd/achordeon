import type { GlobalSettings, Line } from '@achordeon/shared/domain';
import { createFakeMeasurer } from './fake-measurer';
import { DEFAULT_TUNING } from './tuning';
import { createContext } from './context';
import { layoutLine } from './line-layout';

// Fake metrics with base 16: lyric glyph advance = 16 * 0.6 = 9.6, font box
// height 16 (ascent 12.8 + descent 3.2). Chords are 0.7em (PoC look), so the
// chord font box is 11.2 (ascent 8.96 + descent 2.24) and its advance is 6.72.
const settings: GlobalSettings = {
  scale: 'auto',
  columns: 1,
  titlePosition: 'top',
  titleLayout: 'stacked',
  aspectRatio: 'A4',
  padding: 0,
  chordColor: '#123456',
  chordSize: 1,
};

const ctx = (hideChords = false) =>
  createContext(settings, createFakeMeasurer(), DEFAULT_TUNING, hideChords);

const line = (text: string, chords: Line['chords'] = []): Line => ({
  text,
  chords,
});

describe('layoutLine — chord x-positioning (§4.6)', () => {
  it('left-edge-anchors a chord at the anchored character', () => {
    const r = layoutLine(
      line('Hello', [{ raw: 'C', at: 2, valid: true }]),
      ctx(),
      0,
    );
    const chord = r.items.find((i) => i.role === 'chord');
    expect(chord).toMatchObject({ text: 'C', x: 2 * 9.6 });
  });

  it('floats an end-of-line anchor past the last glyph', () => {
    const r = layoutLine(
      line('Hello', [{ raw: 'C', at: 5, valid: true }]),
      ctx(),
      0,
    );
    const chord = r.items.find((i) => i.role === 'chord');
    expect(chord?.x).toBeCloseTo(5 * 9.6);
  });

  it('collapses a same-index group into one left-aligned run', () => {
    const r = layoutLine(
      line('abc', [
        { raw: 'A', at: 1, valid: true },
        { raw: 'B', at: 1, valid: true },
      ]),
      ctx(),
      0,
    );
    const chords = r.items.filter((i) => i.role === 'chord');
    expect(chords).toHaveLength(1);
    expect(chords[0]).toMatchObject({ text: 'A B', x: 9.6 });
  });

  it('honours the lineOrigin offset on both lyric and chords', () => {
    const r = layoutLine(
      line('ab', [{ raw: 'C', at: 1, valid: true }]),
      ctx(),
      100,
    );
    expect(r.items.find((i) => i.role === 'lyric')?.x).toBe(100);
    expect(r.items.find((i) => i.role === 'chord')?.x).toBeCloseTo(100 + 9.6);
  });

  it('renders invalid annotations verbatim in the run', () => {
    const r = layoutLine(
      line('x', [{ raw: '[N.C.]', at: 0, valid: false }]),
      ctx(),
      0,
    );
    expect(r.items.find((i) => i.role === 'chord')?.text).toBe('[N.C.]');
  });
});

describe('layoutLine — vertical rhythm (§4.7)', () => {
  it('reserves a chord row only above a chorded line', () => {
    const chorded = layoutLine(
      line('a', [{ raw: 'C', at: 0, valid: true }]),
      ctx(),
      0,
    );
    const plain = layoutLine(line('a'), ctx(), 0);
    expect(chorded.hasChordRow).toBe(true);
    expect(chorded.height).toBeCloseTo(27.2); // chord row 11.2 + lyric slot 16
    expect(plain.hasChordRow).toBe(false);
    expect(plain.height).toBeCloseTo(16);
  });

  it('places the lyric baseline below the reserved chord row', () => {
    const chorded = layoutLine(
      line('a', [{ raw: 'C', at: 0, valid: true }]),
      ctx(),
      0,
    );
    const plain = layoutLine(line('a'), ctx(), 0);
    expect(chorded.items.find((i) => i.role === 'lyric')?.y).toBeCloseTo(
      11.2 + 12.8,
    );
    expect(plain.items.find((i) => i.role === 'lyric')?.y).toBeCloseTo(12.8);
  });
});

describe('layoutLine — hideChords is reflow-safe (§4.6)', () => {
  it('omits chord glyphs but keeps the reserved row and lyric baseline', () => {
    const shown = layoutLine(
      line('a', [{ raw: 'C', at: 0, valid: true }]),
      ctx(false),
      0,
    );
    const hidden = layoutLine(
      line('a', [{ raw: 'C', at: 0, valid: true }]),
      ctx(true),
      0,
    );
    expect(hidden.items.some((i) => i.role === 'chord')).toBe(false);
    expect(hidden.height).toBeCloseTo(shown.height);
    expect(hidden.items.find((i) => i.role === 'lyric')?.y).toBeCloseTo(
      shown.items.find((i) => i.role === 'lyric')?.y as number,
    );
  });
});

describe('layoutLine — chord fill comes from the chordColor setting (§4.10)', () => {
  it('resolves the chord style fill to chordColor', () => {
    expect(ctx().styles.chord.fill).toBe('#123456');
    expect(ctx().styles.lyric.fill).toBe(DEFAULT_TUNING.textColor);
  });
});
