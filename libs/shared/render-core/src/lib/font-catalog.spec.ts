import type { GlobalSettings, SongAst } from '@achordeon/shared/domain';
import { createFakeMeasurer } from './fake-measurer';
import {
  BODY_FONT,
  BUNDLED_CATALOG,
  createFontCatalog,
  isBodyCapable,
  missingFaces,
  resolveFonts,
  type FontCatalog,
  type FontFamily,
} from './font-catalog';
import { emit } from './emit';
import { layoutCore } from './layout';
import { DEFAULT_TUNING } from './tuning';

/** A family with all four faces — the shape a whole song can be set in. */
const whole: FontFamily = {
  id: 'whole',
  label: 'Whole',
  category: 'serif',
  family: 'Whole Serif',
  fallback: 'serif',
  faces: {
    'normal-normal': { kind: 'asset', path: 'w-r.ttf' },
    'bold-normal': { kind: 'asset', path: 'w-b.ttf' },
    'normal-italic': { kind: 'asset', path: 'w-i.ttf' },
    'bold-italic': { kind: 'asset', path: 'w-bi.ttf' },
  },
  license: 'OFL-1.1',
};

/** Regular + bold only — the shape almost every title face really has. */
const short: FontFamily = {
  id: 'short',
  label: 'Short',
  category: 'display',
  family: 'Short Display',
  fallback: 'sans-serif',
  faces: {
    'normal-normal': { kind: 'asset', path: 's-r.ttf' },
    'bold-normal': { kind: 'asset', path: 's-b.ttf' },
  },
  license: 'OFL-1.1',
};

/** Stands in for the app's own body family, which is what a donor defaults to. */
const fallbackDonor: FontFamily = { ...whole, id: 'roboto-mono' };

const catalog: FontCatalog = createFontCatalog([fallbackDonor, whole, short]);

describe('font catalog', () => {
  it('resolves a retired role name to the family it always meant', () => {
    // A song written before there was a library still says 'serif'. Nothing
    // migrates it (ADR-0017); the lookup carries the alias instead.
    const family = BUNDLED_CATALOG.get('serif');

    expect(family?.id).toBe('crimson-text');
  });

  it('leaves an id it has never heard of unresolved', () => {
    // The receiver of a song from someone with a font this build lacks. It must
    // come back empty rather than guess, so the caller can say so by name.
    expect(BUNDLED_CATALOG.get('custom:nothing-here')).toBeUndefined();
  });

  it('draws an unknown id in the body face', () => {
    const fonts = resolveFonts(
      catalog,
      { body: 'whole', title: 'custom:nothing-here' },
      DEFAULT_TUNING,
    );

    expect(fonts.title.family).toBe(whole.family);
  });

  it('follows the body font for the "same as song" sentinel', () => {
    const fonts = resolveFonts(
      catalog,
      { body: 'whole', title: BODY_FONT },
      DEFAULT_TUNING,
    );

    expect(fonts.title.family).toBe(whole.family);
  });

  describe('a family short of a face', () => {
    it('borrows exactly the ones it has not got', () => {
      const fonts = resolveFonts(catalog, { body: 'short' }, DEFAULT_TUNING);

      expect(Object.keys(fonts.bodyFaces).sort()).toEqual([
        'bold-italic',
        'normal-italic',
      ]);
      expect(fonts.bodyFaces['normal-italic']?.family).toBe(
        fallbackDonor.family,
      );
    });

    it('borrows from the app body face when nothing says otherwise', () => {
      const fonts = resolveFonts(catalog, { body: 'short' }, DEFAULT_TUNING);

      // Precached, so borrowing from it costs no fetch.
      expect(fonts.donor.id).toBe('roboto-mono');
    });

    it('borrows from whoever italicFont names instead', () => {
      const fonts = resolveFonts(
        catalog,
        { body: 'short', italic: 'whole' },
        DEFAULT_TUNING,
      );

      expect(fonts.bodyFaces['normal-italic']?.family).toBe(whole.family);
    });

    it('borrows nothing when the family draws all of its own', () => {
      const fonts = resolveFonts(catalog, { body: 'whole' }, DEFAULT_TUNING);

      expect(fonts.bodyFaces).toEqual({});
    });

    it('asks a title block for two faces, not four', () => {
      // Titles are never markdown-parsed, so a face this family has not got is
      // one nothing was ever going to draw.
      const fonts = resolveFonts(catalog, { title: 'short' }, DEFAULT_TUNING);

      expect(fonts.titleFaces).toEqual({});
    });
  });

  it('calls a family body-capable only with all four faces', () => {
    expect(isBodyCapable(whole)).toBe(true);
    expect(isBodyCapable(short)).toBe(false);
    expect(missingFaces(short)).toEqual(['normal-italic', 'bold-italic']);
  });

  describe('through a whole render', () => {
    const settings: GlobalSettings = {
      scale: 'auto',
      columns: 1,
      titlePosition: 'top',
      titleLayout: 'stacked',
      aspectRatio: 'A4',
      bodyFont: 'short',
      italicFont: 'whole',
      titleFont: BODY_FONT,
      padding: 0,
      blockGap: DEFAULT_TUNING.spacing.interBlockGapFactor,
      contentX: 'left',
      contentY: 'top',
      chordColor: '#aa0000',
      chordSize: 1,
      notation: 'english',
    };

    const ast: SongAst = {
      warnings: [],
      blocks: [
        {
          lines: [
            {
              text: 'plain italic',
              chords: [],
              spans: [{ start: 6, end: 12, italic: true }],
            },
          ],
        },
      ],
    };

    const svg = (): string =>
      emit(
        layoutCore(ast, settings, createFakeMeasurer(), {}, { catalog }),
        {},
      );

    it('draws the italic run in the donor and the rest in the choice', () => {
      // The whole point of resolving this at layout time: the browser would
      // synthesize an oblique of Short Display, and the PDF — which cannot —
      // would print it upright. Screen and export have to name one face.
      expect(svg()).toContain(`font-family="'${whole.family}', serif"`);
      expect(svg()).toContain(`font-family="'${short.family}', sans-serif"`);
    });

    it('embeds the donor face rather than a face nobody has', () => {
      const plan = layoutCore(
        ast,
        settings,
        createFakeMeasurer(),
        {},
        { catalog, fonts: () => 'QUJD' },
      );

      // A book naming Short Display italic would be a registration jsPDF cannot
      // make: there are no such bytes anywhere.
      expect(
        plan.fonts.filter((face) => face.style === 'italic'),
      ).not.toContainEqual(expect.objectContaining({ family: short.family }));
      expect(plan.fonts).toContainEqual(
        expect.objectContaining({ family: whole.family, style: 'italic' }),
      );
    });
  });
});
