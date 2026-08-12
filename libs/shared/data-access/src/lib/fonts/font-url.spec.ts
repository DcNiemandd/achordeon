import {
  FontUrlError,
  displayName,
  familyKey,
  filesFor,
  jsdelivrUrl,
  readFontUrl,
  searchFamilies,
} from './font-url';

describe('readFontUrl', () => {
  it('takes a .ttf on an allow-listed host as it stands', () => {
    const url =
      'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/lora/Lora%5Bwght%5D.ttf';

    expect(readFontUrl(url)).toEqual({ kind: 'file', url });
  });

  it('reads the families out of an embed URL, and never the CSS', () => {
    // The block the Google Fonts site tells you to paste into your <head>. Its
    // query string is the whole of what is used: the stylesheet it points at
    // answers by User-Agent, and a browser cannot ask for the TrueType variant.
    const request = readFontUrl(
      'https://fonts.googleapis.com/css2?family=Courier+Prime:ital,wght@0,400;1,400&family=Oswald:wght@200..700&display=swap',
    );

    expect(request).toEqual({
      kind: 'google',
      families: ['Courier Prime', 'Oswald'],
    });
  });

  it('drops a repeated family rather than fetching it twice', () => {
    const request = readFontUrl(
      'https://fonts.googleapis.com/css2?family=Lora&family=Lora:wght@700',
    );

    expect(request).toEqual({ kind: 'google', families: ['Lora'] });
  });

  it.each([
    ['not a link at all', 'Oswald'],
    ['plain http', 'http://cdn.jsdelivr.net/x/Font.ttf'],
    // A real font on a real host that sends no ACAO header: the fetch would come
    // back as an unexplainable TypeError, so it is refused with a reason instead.
    ['a host that is not allow-listed', 'https://example.com/Font.ttf'],
    ['a file that is not a TTF', 'https://cdn.jsdelivr.net/gh/x/Font.woff2'],
    ['an embed URL naming nothing', 'https://fonts.googleapis.com/css2'],
  ])('refuses %s', (_case, raw) => {
    expect(() => readFontUrl(raw)).toThrow(FontUrlError);
  });
});

describe('which files a family is fetched as', () => {
  it('prefers the four static faces over a variable file', () => {
    // A variable TTF registers with jsPDF as its default instance only, so a
    // family installed from one would print a bold that is not bold.
    expect(
      filesFor({
        d: 'ofl/courierprime',
        f: [
          'CourierPrime-Bold.ttf',
          'CourierPrime-BoldItalic.ttf',
          'CourierPrime-Italic.ttf',
          'CourierPrime-Regular.ttf',
        ],
      }),
    ).toHaveLength(4);
  });

  it('takes the variable files when a family ships nothing else', () => {
    // One usable face each, and the rest borrowed — no special case needed.
    expect(
      filesFor({
        d: 'ofl/lora',
        f: ['Lora-Italic[wght].ttf', 'Lora[wght].ttf'],
      }),
    ).toEqual(['Lora-Italic[wght].ttf', 'Lora[wght].ttf']);
  });

  it('falls back to a static whose name is not one of the four', () => {
    expect(
      filesFor({ d: 'ofl/x', f: ['X-Light.ttf', 'X-SemiBold.ttf'] }),
    ).toEqual(['X-Light.ttf']);
  });
});

describe('the index key', () => {
  it('is the repo folder convention, not the setting slug', () => {
    // `ofl/crimsontext`, not `crimson-text`. Both spellings exist in this
    // codebase and they must not be confused for one another.
    expect(familyKey('Crimson Text')).toBe('crimsontext');
  });
});

describe('the name a search result shows', () => {
  // The index key cannot supply it — `crimsontext` has lost its capitals for
  // good — so it is read back out of the file name, which has not.
  it.each([
    ['a two-word family', ['CrimsonText-Bold.ttf'], 'Crimson Text'],
    ['a variable file', ['RobotoMono-Italic[wght].ttf'], 'Roboto Mono'],
    ['one word', ['Caveat[wght].ttf'], 'Caveat'],
    ['a nested static', ['static/Lora-Regular.ttf'], 'Lora'],
    [
      'three words',
      ['BitcountPropSingle[CRSV,wght].ttf'],
      'Bitcount Prop Single',
    ],
    // A run of capitals is one word until the last of them, which starts the
    // next: `NotoSansJP` is three words and `EBGaramond` is two.
    ['a trailing initialism', ['NotoSansJP[wght].ttf'], 'Noto Sans JP'],
    ['a leading initialism', ['EBGaramond[wght].ttf'], 'EB Garamond'],
    ['an underscore', ['PT_Sans-Web-Regular.ttf'], 'PT Sans'],
  ])('spaces out %s', (_case, files, expected) => {
    expect(displayName({ d: 'ofl/x', f: files }, 'x')).toBe(expected);
  });

  it('falls back to the key for a family with no files', () => {
    expect(displayName({ d: 'ofl/x', f: [] }, 'somefamily')).toBe('somefamily');
  });
});

describe('searching the catalogue', () => {
  const index = {
    crimsontext: { d: 'ofl/crimsontext', f: ['CrimsonText-Bold.ttf'] },
    crimsonpro: { d: 'ofl/crimsonpro', f: ['CrimsonPro[wght].ttf'] },
    notocrimson: { d: 'ofl/notocrimson', f: ['NotoCrimson[wght].ttf'] },
    oswald: { d: 'ofl/oswald', f: ['Oswald[wght].ttf'] },
  };

  it('matches however the name is typed', () => {
    // Both sides go through `familyKey`, so spacing and case are not a query.
    for (const query of ['Crimson Text', 'crimsontext', 'CRIMSON  text']) {
      expect(searchFamilies(index, query, 10).map((one) => one.key)).toEqual([
        'crimsontext',
      ]);
    }
  });

  it('puts what the name starts with above what merely contains it', () => {
    expect(
      searchFamilies(index, 'crimson', 10).map((one) => one.label),
    ).toEqual(['Crimson Pro', 'Crimson Text', 'Noto Crimson']);
  });

  it('says how many faces adding it would install', () => {
    // The same count the library will show once it is in, said before the
    // click: one file is one face, and `filesFor` decides which files.
    expect(searchFamilies(index, 'crimsontext', 10)[0]).toEqual({
      key: 'crimsontext',
      label: 'Crimson Text',
      faces: 1,
      isVariable: false,
    });
  });

  it('marks a family that only ships variable files', () => {
    // Why a family offering nine weights installs as one face — known from the
    // brackets in the file name, so it can be said before anything is fetched.
    expect(searchFamilies(index, 'crimsonpro', 10)[0]).toMatchObject({
      faces: 1,
      isVariable: true,
    });
  });

  it('caps the list', () => {
    expect(searchFamilies(index, 'o', 2)).toHaveLength(2);
  });

  it('answers an empty query with nothing rather than everything', () => {
    expect(searchFamilies(index, '   ', 10)).toEqual([]);
  });
});

describe('jsdelivrUrl', () => {
  it('escapes the brackets a variable filename carries', () => {
    expect(jsdelivrUrl('ofl/lora', 'Lora[wght].ttf')).toBe(
      'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/lora/Lora%5Bwght%5D.ttf',
    );
  });

  it('keeps a nested static path a path', () => {
    expect(jsdelivrUrl('ofl/lora', 'static/Lora-Regular.ttf')).toBe(
      'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/lora/static/Lora-Regular.ttf',
    );
  });
});
