import type { GlobalSettings, SongAst } from '@achordeon/shared/domain';
import { createFakeMeasurer } from './fake-measurer';
import { singleFamilyResolver } from './fonts';
import { layoutCore } from './layout';
import { emit } from './emit';
import type { RenderPlan } from './render-plan';
import { DEFAULT_TUNING } from './tuning';

const settings: GlobalSettings = {
  scale: 'auto',
  columns: 1,
  titlePosition: 'top',
  titleLayout: 'stacked',
  aspectRatio: 'A4',
  titleFont: 'body',
  padding: 0,
  contentX: 'left',
  contentY: 'top',
  chordColor: '#aa0000',
  chordSize: 1,
};
const measure = createFakeMeasurer();
const plan = (
  over: Partial<SongAst> = {},
  fonts = singleFamilyResolver(DEFAULT_TUNING.fontFamily, { normal: 'QUJD' }),
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

describe('emit — escaping', () => {
  it('escapes XML metacharacters in text', () => {
    const svg = emit(
      plan({ blocks: [{ lines: [{ text: 'a<b>&"\'', chords: [] }] }] }),
    );
    expect(svg).toContain('a&lt;b&gt;&amp;&quot;&apos;');
  });
});
