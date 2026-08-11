import type { GlobalSettings, Line } from '@achordeon/shared/domain';
import { createFakeMeasurer } from './fake-measurer';
import type { TextMeasurer } from './text-measurer';
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
  bodyFont: 'roboto-mono',
  italicFont: 'roboto-mono',
  titleFont: 'body',
  padding: 0,
  blockGap: DEFAULT_TUNING.spacing.interBlockGapFactor,
  contentX: 'left',
  contentY: 'top',
  chordColor: '#123456',
  chordSize: 1,
  notation: 'english',
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

describe('layoutLine — chords in the flow (§4.9)', () => {
  const flow = DEFAULT_TUNING.flowChordMultiplier;
  const chordAdvance = 6.72 * flow; // one chord glyph at the flow size

  it('sets an inline chord in the line and pushes the rest of it right', () => {
    const r = layoutLine(
      line('ab', [{ raw: 'C', at: 1, valid: true, inline: true }]),
      ctx(),
      0,
    );
    const chord = r.items.find((i) => i.role === 'chord');
    const lyrics = r.items.filter((i) => i.role === 'lyric');
    expect(chord).toMatchObject({ text: 'C', x: 9.6 });
    expect(chord?.sizeScale).toBeCloseTo(flow);
    // It sits ON the lyric baseline, so no chord row is reserved above the line.
    expect(chord?.y).toBeCloseTo(lyrics[0].y);
    expect(r.hasChordRow).toBe(false);
    expect(lyrics.map((i) => i.text)).toEqual(['a', 'b']);
    expect(lyrics[1].x).toBeCloseTo(9.6 + chordAdvance);
  });

  it('treats every chord on a lyric-less line as inline, brackets or not', () => {
    const r = layoutLine(
      line('', [{ raw: 'Am', at: 0, valid: true }]),
      ctx(),
      0,
    );
    const chord = r.items.find((i) => i.role === 'chord');
    expect(chord).toMatchObject({ x: 0 });
    expect(chord?.sizeScale).toBeCloseTo(flow);
    expect(r.hasChordRow).toBe(false);
    expect(r.height).toBeCloseTo(11.2 * flow);
  });

  it('floats a same-line anchor over the character the flow moved', () => {
    const r = layoutLine(
      line('ab', [
        { raw: 'C', at: 1, valid: true, inline: true },
        { raw: 'G', at: 2, valid: true },
      ]),
      ctx(),
      0,
    );
    const above = r.items.filter((i) => i.role === 'chord' && !i.sizeScale);
    expect(r.hasChordRow).toBe(true);
    // 'a' + the flow chord + 'b' — the anchored character is that far along now.
    expect(above[0].x).toBeCloseTo(9.6 + chordAdvance + 9.6);
  });

  it('keeps the flow advance when the chords are hidden (§4.6)', () => {
    const chords: Line['chords'] = [
      { raw: 'C', at: 1, valid: true, inline: true },
    ];
    const shown = layoutLine(line('ab', chords), ctx(false), 0);
    const hidden = layoutLine(line('ab', chords), ctx(true), 0);
    expect(hidden.items.some((i) => i.role === 'chord')).toBe(false);
    const x = (r: typeof shown) =>
      r.items.filter((i) => i.role === 'lyric').map((i) => i.x);
    expect(x(hidden)).toEqual(x(shown));
    expect(hidden.height).toBeCloseTo(shown.height);
  });

  it('draws no lyric item for the space between two flow chords', () => {
    const r = layoutLine(
      line(' ', [
        { raw: 'C', at: 0, valid: true },
        { raw: 'G', at: 1, valid: true },
      ]),
      ctx(),
      0,
    );
    expect(r.items.some((i) => i.role === 'lyric')).toBe(false);
    const chords = r.items.filter((i) => i.role === 'chord');
    expect(chords[1].x).toBeCloseTo(chordAdvance + 9.6);
  });
});

describe('layoutLine — sub-labels (§4.8)', () => {
  const gutterGap = DEFAULT_TUNING.spacing.gutterGapEm * 16; // 4

  it('opens the row with the sub-label and starts the content after it', () => {
    const r = layoutLine({ label: 'Kl', text: 'ab', chords: [] }, ctx(), 0);
    const label = r.items.find((i) => i.role === 'sublabel');
    const lyric = r.items.find((i) => i.role === 'lyric');
    expect(label).toMatchObject({ text: 'Kl', x: 0, y: 12.8 });
    expect(lyric?.x).toBeCloseTo(2 * 9.6 + gutterGap);
    // One row: the sub-label shares the lyric's baseline.
    expect(lyric?.y).toBeCloseTo(12.8);
    expect(r.height).toBeCloseTo(16);
  });

  it('offsets the chords of a lyric-less row by the sub-label too', () => {
    const r = layoutLine(
      { label: 'Kl', text: '', chords: [{ raw: 'Am', at: 0, valid: true }] },
      ctx(),
      0,
    );
    expect(r.items.find((i) => i.role === 'chord')?.x).toBeCloseTo(
      2 * 9.6 + gutterGap,
    );
  });

  it('rides the lineOrigin like everything else on the row', () => {
    const r = layoutLine({ label: 'Kl', text: 'ab', chords: [] }, ctx(), 100);
    expect(r.items.find((i) => i.role === 'sublabel')?.x).toBe(100);
  });
});

describe('layoutLine — emphasis runs (§4.10 markdown)', () => {
  const emph = (
    text: string,
    spans: Line['spans'],
    chords: Line['chords'] = [],
  ): Line => ({ text, chords, spans });

  it('splits a lyric into one item per emphasis run, tagging italic', () => {
    const r = layoutLine(
      emph('abc', [{ start: 1, end: 2, italic: true }]),
      ctx(),
      0,
    );
    const lyrics = r.items.filter((i) => i.role === 'lyric');
    expect(lyrics.map((i) => i.text)).toEqual(['a', 'b', 'c']);
    expect(lyrics[1].style).toBe('italic');
    expect(lyrics[1].weight).toBeUndefined();
    // Monospace: the split does not move the glyphs — x's are the plain positions.
    expect(lyrics.map((i) => i.x)).toEqual([0, 9.6, 19.2]);
  });

  it('tags a bold run and a bold+italic run', () => {
    const r = layoutLine(
      emph('xy', [
        { start: 0, end: 1, bold: true },
        { start: 1, end: 2, bold: true, italic: true },
      ]),
      ctx(),
      0,
    );
    const lyrics = r.items.filter((i) => i.role === 'lyric');
    expect(lyrics[0]).toMatchObject({ text: 'x', weight: 'bold' });
    expect(lyrics[0].style).toBeUndefined();
    expect(lyrics[1]).toMatchObject({
      text: 'y',
      weight: 'bold',
      style: 'italic',
    });
  });

  it('leaves a plain line as a single untagged lyric item', () => {
    const r = layoutLine(line('abc'), ctx(), 0);
    const lyrics = r.items.filter((i) => i.role === 'lyric');
    expect(lyrics).toHaveLength(1);
    expect(lyrics[0]).toMatchObject({ text: 'abc', x: 0 });
    expect(lyrics[0].weight).toBeUndefined();
    expect(lyrics[0].style).toBeUndefined();
  });

  it('measures each run in its own face when placing a later chord', () => {
    // A measurer where bold glyphs are twice as wide proves the chord x sums each
    // intervening run in its OWN face, not the plain one.
    const wideBold: TextMeasurer = {
      measure: (text, font) => ({
        width: text.length * font.sizePx * (font.weight === 'bold' ? 1.2 : 0.6),
        fontBoundingBoxAscent: font.sizePx * 0.8,
        fontBoundingBoxDescent: font.sizePx * 0.2,
      }),
    };
    const c = createContext(settings, wideBold, DEFAULT_TUNING, false);
    const r = layoutLine(
      {
        text: 'abX',
        chords: [{ raw: 'C', at: 2, valid: true }],
        spans: [{ start: 0, end: 2, bold: true }],
      },
      c,
      0,
    );
    const chord = r.items.find((i) => i.role === 'chord');
    // Bold "ab" is 2 · 16 · 1.2 = 38.4 wide, not the plain 2 · 9.6 = 19.2.
    expect(chord?.x).toBeCloseTo(2 * 16 * 1.2);
  });
});

describe('layoutLine — chord fill comes from the chordColor setting (§4.10)', () => {
  it('resolves the chord style fill to chordColor', () => {
    expect(ctx().styles.chord.fill).toBe('#123456');
    expect(ctx().styles.lyric.fill).toBe(DEFAULT_TUNING.textColor);
  });
});
