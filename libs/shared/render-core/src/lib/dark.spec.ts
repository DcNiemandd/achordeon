import type { GlobalSettings } from '@achordeon/shared/domain';
import {
  contrastRatio,
  liftInkForPaper,
  parseHexColor,
  relativeLuminance,
} from './dark';
import { resolveStyles } from './context';
import { createFakeMeasurer } from './fake-measurer';
import { layoutCore } from './layout';
import { emit } from './emit';
import { DEFAULT_TUNING } from './tuning';

const settings: GlobalSettings = {
  scale: 'auto',
  columns: 1,
  titlePosition: 'top',
  titleLayout: 'stacked',
  aspectRatio: 'A4',
  titleFont: 'body',
  padding: 0,
  blockGap: DEFAULT_TUNING.spacing.interBlockGapFactor,
  contentX: 'left',
  contentY: 'top',
  chordColor: '#9f1212',
  chordSize: 1,
  notation: 'english',
};

const BLACK = '#000000';
const rgb = (hex: string) => {
  const parsed = parseHexColor(hex);
  if (!parsed) throw new Error(`Not a colour: ${hex}`);
  return parsed;
};
const against = (ink: string, paper: string) =>
  contrastRatio(rgb(ink), rgb(paper));
/** Hue and saturation, to the nearest degree / percent — what must not move. */
const hueOf = (hex: string) => {
  const { r, g, b } = rgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  const h =
    max === r
      ? ((g - b) / d) % 6
      : max === g
        ? (b - r) / d + 2
        : (r - g) / d + 4;
  return Math.round((h * 60 + 360) % 360);
};

describe('colour arithmetic', () => {
  it('parses both hex shapes and refuses everything else', () => {
    expect(parseHexColor('#fff')).toEqual(parseHexColor('#ffffff'));
    expect(parseHexColor('  #9F1212 ')).toEqual(parseHexColor('#9f1212'));
    expect(parseHexColor('red')).toBeNull();
    expect(parseHexColor('rgb(0 0 0)')).toBeNull();
    expect(parseHexColor('#9f121')).toBeNull();
  });

  it('agrees with WCAG on the two anchors', () => {
    expect(relativeLuminance(rgb('#000000'))).toBeCloseTo(0, 5);
    expect(relativeLuminance(rgb('#ffffff'))).toBeCloseTo(1, 5);
    expect(against('#000000', '#ffffff')).toBeCloseTo(21, 2);
  });
});

describe('liftInkForPaper', () => {
  // The promise the feature rests on: a performer who picked a colour has to
  // still recognise it on the dark page.
  it('keeps the hue of the default chord red while making it legible', () => {
    const lifted = liftInkForPaper('#9f1212', BLACK, 4.5);

    expect(against('#9f1212', BLACK)).toBeLessThan(4.5); // the problem
    expect(hueOf(lifted)).toBe(hueOf('#9f1212')); // still red
    expect(against(lifted, BLACK)).toBeGreaterThanOrEqual(4.5);
  });

  it('moves the ink no further than the floor demands', () => {
    const lifted = liftInkForPaper('#9f1212', BLACK, 4.5);

    // Snug against the floor, not slammed to white: overshooting would be a
    // restyling of a choice that was not ours to restyle.
    expect(against(lifted, BLACK)).toBeLessThan(5.0);
  });

  it('leaves a colour that already reads on black byte-identical', () => {
    expect(liftInkForPaper('#ff8080', BLACK, 4.5)).toBe('#ff8080');
    expect(liftInkForPaper('#ffffff', BLACK, 4.5)).toBe('#ffffff');
  });

  it('lifts a pure black ink to a grey that reads, hue being unavailable', () => {
    const lifted = liftInkForPaper('#000000', BLACK, 4.5);
    expect(against(lifted, BLACK)).toBeGreaterThanOrEqual(4.5);
  });

  it('darkens instead, when the paper is the light one', () => {
    // The direction is derived, not assumed — the same helper serves a white
    // page, which is what keeps it a general rule rather than a special case.
    const inked = liftInkForPaper('#ffee00', '#ffffff', 4.5);
    expect(against(inked, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(hueOf(inked)).toBe(hueOf('#ffee00'));
  });

  it('returns the best available when the floor is unreachable', () => {
    // A mid grey page cannot give 21:1 to anything. Answering with the most
    // legible colour there is beats throwing inside a render.
    const inked = liftInkForPaper('#808080', '#808080', 21);
    expect(against(inked, '#808080')).toBeGreaterThan(1);
  });

  it('leaves an unreadable colour value alone rather than failing a render', () => {
    expect(liftInkForPaper('var(--brand)', BLACK, 4.5)).toBe('var(--brand)');
    expect(liftInkForPaper('#9f1212', 'papyrus', 4.5)).toBe('#9f1212');
  });
});

describe('resolveStyles on a dark page', () => {
  it('turns the ink over without touching the settings', () => {
    const light = resolveStyles(settings, DEFAULT_TUNING);
    const dark = resolveStyles(settings, DEFAULT_TUNING, true);

    expect(light.lyric.fill).toBe('#000000');
    expect(dark.lyric.fill).toBe(DEFAULT_TUNING.dark.textColor);
    expect(dark.subtitle.fill).toBe(
      DEFAULT_TUNING.typography.subtitle.darkColor,
    );
    // Same geometry, both ways — only the fills move.
    expect(dark.lyric.sizePx).toBe(light.lyric.sizePx);
    expect(dark.chord.sizePx).toBe(light.chord.sizePx);
    expect(settings.chordColor).toBe('#9f1212');
  });

  it('keeps the subtitle subordinate to the body text, as it is on white', () => {
    const dark = resolveStyles(settings, DEFAULT_TUNING, true);
    const paper = DEFAULT_TUNING.dark.paper;

    expect(against(dark.subtitle.fill, paper)).toBeLessThan(
      against(dark.lyric.fill, paper),
    );
  });

  it('never asks a true-black page for pure white — it haloes', () => {
    const dark = resolveStyles(settings, DEFAULT_TUNING, true);
    expect(dark.lyric.fill).not.toBe('#ffffff');
    expect(against(dark.lyric.fill, DEFAULT_TUNING.dark.paper)).toBeGreaterThan(
      7,
    );
  });
});

describe('the dark page in a plan', () => {
  const planFor = (dark?: boolean) =>
    layoutCore(
      {
        title: 'T',
        blocks: [
          {
            lines: [{ text: 'ab', chords: [{ raw: 'C', at: 0, valid: true }] }],
          },
        ],
        warnings: [],
      },
      settings,
      createFakeMeasurer(),
      dark === undefined ? {} : { dark },
    );

  it('carries a ground only when one was asked for', () => {
    expect(planFor().paper).toBeUndefined();
    expect(planFor(false).paper).toBeUndefined();
    expect(planFor(true).paper).toBe('#000000');
  });

  // The export guarantee, asserted rather than argued: every download path
  // calls `layout` without opts, and that is the plan below.
  it('leaves the default render untouched — the one exports use', () => {
    const svg = emit(planFor());
    expect(svg).not.toContain('<rect');
    expect(svg).toContain('fill="#9f1212"');
    expect(svg).toContain('fill="#000000"');
  });

  it('paints the ground behind the fit transform, filling the whole box', () => {
    const plan = planFor(true);
    const svg = emit(plan);

    expect(svg).toContain(
      `<rect x="0" y="0" width="${plan.box.width}" height="${plan.box.height}" fill="#000000"/>`,
    );
    // Before the content group, or it would cover the song.
    expect(svg.indexOf('<rect')).toBeLessThan(svg.indexOf('<g '));
  });
});
