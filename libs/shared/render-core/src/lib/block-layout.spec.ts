import type { Block, GlobalSettings } from '@achordeon/shared/domain';
import { createFakeMeasurer } from './fake-measurer';
import { DEFAULT_TUNING } from './tuning';
import { createContext } from './context';
import { inlineLabelWidth, layoutBlock } from './block-layout';

// base 16 → glyph advance 9.6, font box height 16 (ascent 12.8, descent 3.2).
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
  chordColor: '#000000',
  chordSize: 1,
  notation: 'english',
};
const ctx = (hideChords = false) =>
  createContext(settings, createFakeMeasurer(), DEFAULT_TUNING, hideChords);

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

describe('layoutBlock — chords in the flow (§4.9)', () => {
  const flow = DEFAULT_TUNING.flowChordMultiplier;
  // A chord advance is 6.72 at the fake measurer's 0.7em chord size.
  const chordAdvance = 6.72 * flow;

  it('sets a lyric-less line’s chords in the flow, at the flow size', () => {
    const block: Block = {
      lines: [
        {
          text: ' ',
          chords: [
            { raw: 'C', at: 0, valid: true },
            { raw: 'G', at: 1, valid: true },
          ],
        },
      ],
    };
    const chords = layoutBlock(block, ctx()).items.filter(
      (i) => i.role === 'chord',
    );
    expect(chords[0]).toMatchObject({ x: 0 });
    expect(chords[0].sizeScale).toBeCloseTo(flow);
    // Packed on the author's own space, not on a fixed gap of the renderer's.
    expect(chords[1].x).toBeCloseTo(chordAdvance + 9.6);
  });

  it('gives a lyric-less line the taller of the lyric slot and the flow chord', () => {
    const block: Block = {
      lines: [{ text: '', chords: [{ raw: 'C', at: 0, valid: true }] }],
    };
    // The chord font box is 11.2 (chords are 0.7em), scaled by the flow.
    expect(layoutBlock(block, ctx()).height).toBeCloseTo(11.2 * flow);
  });

  it('treats a lyric-less line the same inside a block that has lyrics', () => {
    // The old rule scaled chords only when EVERY line of the block was chords;
    // one lyric line beside them left the row small. It is per line now.
    const block: Block = {
      lines: [
        { text: '', chords: [{ raw: 'C', at: 0, valid: true }] },
        { text: 'aaaa', chords: [] },
      ],
    };
    const chord = layoutBlock(block, ctx()).items.find(
      (i) => i.role === 'chord',
    );
    expect(chord?.sizeScale).toBeCloseTo(flow);
  });
});
