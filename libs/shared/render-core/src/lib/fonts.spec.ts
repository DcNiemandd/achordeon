import { buildFontBook, collectFaces, singleFamilyResolver } from './fonts';
import type { TextRole, TextStyle } from './render-plan';

const style = (over: Partial<TextStyle> = {}): TextStyle => ({
  family: 'Body',
  sizePx: 16,
  weight: 'normal',
  fill: '#000',
  ...over,
});

/** The role shape `resolveStyles` produces: a title face, a body face, bolds. */
const styles = (
  over: Partial<Record<TextRole, TextStyle>> = {},
): Record<TextRole, TextStyle> => ({
  title: style({ family: 'Title', weight: 'bold' }),
  subtitle: style({ family: 'Title' }),
  label: style({ weight: 'bold' }),
  lyric: style(),
  chord: style({ weight: 'bold' }),
  ...over,
});

describe('collectFaces', () => {
  it('dedupes roles that draw with the same face', () => {
    // label and chord are both body-bold; lyric is body-normal.
    expect(collectFaces(styles())).toEqual([
      { family: 'Title', weight: 'bold', style: 'normal' },
      { family: 'Title', weight: 'normal', style: 'normal' },
      { family: 'Body', weight: 'bold', style: 'normal' },
      { family: 'Body', weight: 'normal', style: 'normal' },
    ]);
  });

  it('treats an unset style as normal, so it cannot split a face in two', () => {
    const faces = collectFaces(
      styles({
        lyric: style({ style: 'normal' }),
        label: style(),
        chord: style(),
      }),
    );
    expect(faces.filter((f) => f.family === 'Body')).toHaveLength(1);
  });
});

describe('buildFontBook', () => {
  it('carries the faces the resolver answers', () => {
    const book = buildFontBook(styles(), (face) =>
      face.family === 'Title' ? `bytes-${face.weight}` : undefined,
    );
    expect(book).toEqual([
      {
        family: 'Title',
        weight: 'bold',
        style: 'normal',
        base64: 'bytes-bold',
      },
      {
        family: 'Title',
        weight: 'normal',
        style: 'normal',
        base64: 'bytes-normal',
      },
    ]);
  });

  it('drops a face with no bytes rather than carrying it empty', () => {
    // The PDF registers exactly what the book lists (§3), so "we have nothing
    // for this one" has to read as an absence, not as an empty string.
    const book = buildFontBook(styles(), () => undefined);
    expect(book).toEqual([]);
  });
});

describe('singleFamilyResolver', () => {
  const resolve = singleFamilyResolver('Body', { normal: 'R', bold: 'B' });

  it('answers its own family, per weight', () => {
    expect(resolve({ family: 'Body', weight: 'bold', style: 'normal' })).toBe(
      'B',
    );
    expect(resolve({ family: 'Body', weight: 'normal', style: 'normal' })).toBe(
      'R',
    );
  });

  it('answers nothing for another family or an italic it does not carry', () => {
    expect(
      resolve({ family: 'Title', weight: 'normal', style: 'normal' }),
    ).toBeUndefined();
    expect(
      resolve({ family: 'Body', weight: 'normal', style: 'italic' }),
    ).toBeUndefined();
  });
});
