import type { Block, GlobalSettings } from '@achordeon/shared/domain';
import { createFakeMeasurer } from './fake-measurer';
import { DEFAULT_TUNING } from './tuning';
import { createContext } from './context';
import { inlineLabelWidth, isChordOnly, layoutBlock } from './block-layout';

// base 16 → glyph advance 9.6, font box height 16 (ascent 12.8, descent 3.2).
const settings: GlobalSettings = {
  scale: 'auto',
  columns: 1,
  titlePosition: 'top',
  titleLayout: 'stacked',
  aspectRatio: 'A4',
  chordColor: '#000000',
  chordSize: 1,
};
const ctx = (hideChords = false) =>
  createContext(settings, createFakeMeasurer(), DEFAULT_TUNING, hideChords);

describe('isChordOnly', () => {
  it('is true for anchors over blank text, false otherwise', () => {
    expect(
      isChordOnly({ text: '   ', chords: [{ raw: 'C', at: 0, valid: true }] }),
    ).toBe(true);
    expect(
      isChordOnly({ text: 'la', chords: [{ raw: 'C', at: 0, valid: true }] }),
    ).toBe(false);
    expect(isChordOnly({ text: '', chords: [] })).toBe(false);
  });
});

describe('layoutBlock — label gutter (§4.8)', () => {
  it('starts an unlabelled block at x = 0', () => {
    const block: Block = { lines: [{ text: 'ab', chords: [] }] };
    const r = layoutBlock(block, ctx());
    expect(r.items.find((i) => i.role === 'lyric')?.x).toBe(0);
  });

  it('puts a two-line label on its own row at x = 0, content below', () => {
    const block: Block = {
      label: 'Verse',
      labelInline: false,
      lines: [{ text: 'ab', chords: [] }],
    };
    const r = layoutBlock(block, ctx());
    const label = r.items.find((i) => i.role === 'label');
    const lyric = r.items.find((i) => i.role === 'lyric');
    expect(label).toMatchObject({ x: 0, y: 12.8 });
    expect(lyric?.x).toBe(0);
    expect(lyric?.y).toBeCloseTo(16 + 12.8); // label slot then lyric baseline
  });

  it('indents an inline-label block to the gutter, label rendered in it', () => {
    const block: Block = {
      label: 'Verse',
      labelInline: true,
      lines: [{ text: 'ab', chords: [] }],
    };
    const r = layoutBlock(block, ctx(), 48);
    const label = r.items.find((i) => i.role === 'label');
    const lyric = r.items.find((i) => i.role === 'lyric');
    expect(label).toMatchObject({ x: 0, y: 12.8 }); // aligned to first line's lyric baseline
    expect(lyric?.x).toBe(48); // content indented to the gutter
  });

  it('reports the inline label width (0 for two-line / unlabelled)', () => {
    expect(
      inlineLabelWidth({ label: 'Verse', labelInline: true, lines: [] }, ctx()),
    ).toBeCloseTo(48);
    expect(
      inlineLabelWidth(
        { label: 'Verse', labelInline: false, lines: [] },
        ctx(),
      ),
    ).toBe(0);
    expect(inlineLabelWidth({ lines: [] }, ctx())).toBe(0);
  });
});

describe('layoutBlock — bridge convention (§4.9)', () => {
  it('flags an all-chord-only block as a bridge and scales its chords', () => {
    const block: Block = {
      lines: [
        {
          text: '',
          chords: [
            { raw: 'C', at: 0, valid: true },
            { raw: 'G', at: 1, valid: true },
          ],
        },
      ],
    };
    const r = layoutBlock(block, ctx());
    expect(r.isBridge).toBe(true);
    const chord = r.items.find((i) => i.role === 'chord');
    expect(chord?.sizeScale).toBeCloseTo(DEFAULT_TUNING.bridgeSizeMultiplier);
    expect(r.height).toBeCloseTo(16 * DEFAULT_TUNING.bridgeSizeMultiplier);
  });

  it('does not bridge a block that mixes chord-only and lyric lines', () => {
    const block: Block = {
      lines: [
        { text: '', chords: [{ raw: 'C', at: 0, valid: true }] },
        { text: 'aaaa', chords: [] },
      ],
    };
    expect(layoutBlock(block, ctx()).isBridge).toBe(false);
  });
});

describe('layoutBlock — chord-only distribution (§4.9)', () => {
  const mixed: Block = {
    lines: [
      {
        text: '',
        chords: [
          { raw: 'C', at: 0, valid: true },
          { raw: 'G', at: 1, valid: true },
        ],
      },
      { text: 'aaaa', chords: [] },
    ],
  };

  it('justifies chords to the column content width when known', () => {
    const r = layoutBlock(mixed, ctx(), 0, 200);
    const chords = r.items.filter((i) => i.role === 'chord');
    expect(chords[0].x).toBeCloseTo(0);
    // last chord right edge hugs the column width (200)
    expect(chords[1].x + 9.6).toBeCloseTo(200);
  });

  it('packs chords at the natural gap when no column width is given', () => {
    const r = layoutBlock(mixed, ctx());
    const chords = r.items.filter((i) => i.role === 'chord');
    const gap = DEFAULT_TUNING.spacing.chordOnlyGapEm * 16; // 24
    expect(chords[1].x).toBeCloseTo(9.6 + gap);
  });
});
