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
  titleFont: 'body',
  padding: 0,
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
    // The chord font box is 11.2 (chords are 0.7em), scaled by the bridge.
    expect(r.height).toBeCloseTo(11.2 * DEFAULT_TUNING.bridgeSizeMultiplier);
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

  const gap = DEFAULT_TUNING.spacing.chordOnlyGapEm * 16; // 24

  // The default. A chord-only line reads as a sequence you play through, and a
  // fixed gap keeps it looking the same whatever column it lands in.
  it('packs chords from the left at a fixed gap, even inside a wide column', () => {
    const r = layoutBlock(mixed, ctx(), 0, 200);
    const chords = r.items.filter((i) => i.role === 'chord');
    expect(chords[0].x).toBeCloseTo(0);
    // A chord advance is 6.72 at the fake measurer's 0.7em chord size.
    expect(chords[1].x).toBeCloseTo(6.72 + gap);
  });

  it('packs at the same gap when no column width is given at all', () => {
    const r = layoutBlock(mixed, ctx());
    const chords = r.items.filter((i) => i.role === 'chord');
    expect(chords[1].x).toBeCloseTo(6.72 + gap);
  });

  // Still implemented, and still the other half of the seam — just no longer the
  // default (see `chordOnlyDistribution`).
  it('spreads chords across the column when told to justify', () => {
    const justified = createContext(
      settings,
      createFakeMeasurer(),
      { ...DEFAULT_TUNING, chordOnlyDistribution: 'justified' },
      false,
    );
    const chords = layoutBlock(mixed, justified, 0, 200).items.filter(
      (i) => i.role === 'chord',
    );
    expect(chords[0].x).toBeCloseTo(0);
    expect(chords[1].x + 6.72).toBeCloseTo(200);
  });
});
