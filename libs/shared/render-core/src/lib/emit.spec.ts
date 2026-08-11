import type { GlobalSettings, SongAst } from '@achordeon/shared/domain';
import { createFakeMeasurer } from './fake-measurer';
import { singleFamilyResolver } from './fonts';
import { layoutCore } from './layout';
import { emit, turnedSvg } from './emit';
import type { RenderPlan } from './render-plan';
import { DEFAULT_TUNING } from './tuning';

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
  chordColor: '#aa0000',
  chordSize: 1,
  notation: 'english',
};
const measure = createFakeMeasurer();
const plan = (
  over: Partial<SongAst> = {},
  fonts = singleFamilyResolver(DEFAULT_TUNING.fontFamily, {
    'normal-normal': 'QUJD',
  }),
): RenderPlan =>
  layoutCore(
    { blocks: [], warnings: [], ...over },
    settings,
    measure,
    {},
    { fonts },
  );

const song: Partial<SongAst> = {
  title: 'T',
  blocks: [
    { lines: [{ text: 'ab', chords: [{ raw: 'C', at: 0, valid: true }] }] },
  ],
};

describe('emit — SVG shell (§1, §5)', () => {
  it('emits a self-contained svg with the render box as viewBox', () => {
    const p = plan(song);
    const svg = emit(p);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(
      true,
    );
    expect(svg).toContain(`viewBox="0 0 ${p.box.width} ${p.box.height}"`);
  });

  it('wraps items in one translate+scale group (fit applied once)', () => {
    const svg = emit(plan(song));
    expect(svg).toContain('<g transform="translate(0 0) scale(1)">');
  });

  it('renders lyric and chord text nodes', () => {
    const svg = emit(plan(song));
    expect(svg).toContain('>ab</text>');
    expect(svg).toContain('>C</text>');
  });

  it('applies the chordColor fill to chord glyphs', () => {
    const svg = emit(plan(song));
    const chord = svg.match(/<text[^>]*>C<\/text>/)?.[0] ?? '';
    expect(chord).toContain('fill="#aa0000"');
  });

  it('applies a markdown item’s own weight and style over the role’s', () => {
    const svg = emit(
      plan({
        blocks: [
          {
            lines: [
              {
                text: 'bi',
                chords: [],
                spans: [{ start: 0, end: 2, bold: true, italic: true }],
              },
            ],
          },
        ],
      }),
    );
    const node = svg.match(/<text[^>]*>bi<\/text>/)?.[0] ?? '';
    expect(node).toContain('font-weight="bold"');
    expect(node).toContain('font-style="italic"');
  });
});

describe('emit — whitespace is content (§4.6)', () => {
  // `layout` measures chord x against the real string, spaces included, so the
  // browser has to draw that same string. SVG's default collapses it.
  it('preserves the whitespace the geometry was measured against', () => {
    const indented = plan({
      blocks: [
        {
          lines: [
            { text: '   la  la', chords: [{ raw: 'C', at: 3, valid: true }] },
          ],
        },
      ],
    });
    const svg = emit(indented);

    const lyric = svg.match(/<text[^>]*>[^<]*la[^<]*<\/text>/)?.[0] ?? '';
    expect(lyric).toContain('xml:space="preserve"');
    // The exact string, with its indent and its double space intact.
    expect(svg).toContain('>   la  la<');

    // And the chord still sits over the character the anchor names: three
    // leading spaces at the fake measurer's 9.6 advance.
    const chord = indented.items.find((i) => i.role === 'chord');
    expect(chord?.x).toBeCloseTo(3 * 9.6);
  });
});

describe('emit — fonts (§2, §4.10)', () => {
  it('inlines @font-face base64 only when inlineFonts is set (export)', () => {
    const p = plan(song);
    expect(emit(p, { inlineFonts: true })).toContain('@font-face');
    expect(emit(p, { inlineFonts: true })).toContain('base64,QUJD');
    expect(emit(p)).not.toContain('@font-face');
  });

  it('lists the family then the fallback stack', () => {
    const svg = emit(plan(song));
    expect(svg).toContain(
      `font-family="'${DEFAULT_TUNING.fontFamily}', ${DEFAULT_TUNING.fallbackStack}"`,
    );
  });
});

describe('emit — spine rotation (§4.5)', () => {
  it('emits a rotate transform for left-spine title items', () => {
    const p = layoutCore(
      { title: 'T', subtitle: 'S', blocks: [], warnings: [] },
      { ...settings, titlePosition: 'left' },
      measure,
    );
    const svg = emit(p);
    expect(svg).toMatch(/<text[^>]*transform="rotate\(-90 /);
  });
});

describe('turnedSvg', () => {
  const inner = '<svg viewBox="0 0 100 50" width="100" height="50"></svg>';

  it('swaps the document box', () => {
    const turned = turnedSvg(inner, { width: 100, height: 50 });
    expect(turned).toContain('viewBox="0 0 50 100"');
    expect(turned).toContain('width="50"');
    expect(turned).toContain('height="100"');
  });

  it('turns counter-clockwise, like the title spine', () => {
    // The same handedness as `rotate: -90` in title-layout, so the two sideways
    // things Achordeon draws are read with one tilt of the head (ADR-0013).
    expect(turnedSvg(inner, { width: 100, height: 50 })).toContain(
      'rotate(-90)',
    );
  });

  it('translates the rotated box back into view', () => {
    // Rotating [0,w]x[0,h] about the origin lands it in [0,h]x[-w,0]; without
    // the lift by w the drawing would be entirely off the top of the sheet.
    expect(turnedSvg(inner, { width: 100, height: 50 })).toContain(
      'transform="translate(0 100) rotate(-90)"',
    );
  });

  it('nests the original document untouched — nothing is laid out again', () => {
    // A placement, not a render setting: the same glyphs in the same places,
    // seen from the side. A re-layout here could disagree with the screen.
    expect(turnedSvg(inner, { width: 100, height: 50 })).toContain(inner);
  });

  it('wraps a real render without disturbing its contents', () => {
    const svg = emit(
      plan({ blocks: [{ lines: [{ text: 'hello', chords: [] }] }] }),
    );
    const turned = turnedSvg(svg, { width: 210, height: 297 });
    expect(turned).toContain(svg);
    expect(turned).toContain('viewBox="0 0 297 210"');
  });
});

describe('emit — escaping', () => {
  it('escapes XML metacharacters in text', () => {
    const svg = emit(
      plan({ blocks: [{ lines: [{ text: 'a<b>&"\'', chords: [] }] }] }),
    );
    expect(svg).toContain('a&lt;b&gt;&amp;&quot;&apos;');
  });
});
