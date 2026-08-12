import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { customFontId, parseSfnt, slugify, FontFileError } from './sfnt';

/**
 * The real bundled files, not a hand-built fixture.
 *
 * A synthesised sfnt would only ever prove the parser agrees with the fixture's
 * author. What has to hold is that it agrees with fonts as foundries actually
 * ship them — which is the whole reason the file is read at add-time.
 */
const FONTS = join(__dirname, '../../../../../apps/app/public/fonts');

function read(name: string): ArrayBuffer {
  const buffer = readFileSync(join(FONTS, name));
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
}

describe('parseSfnt', () => {
  it('reads the family the font names itself', () => {
    expect(parseSfnt(read('Oswald-Regular.ttf')).family).toBe('Oswald');
    expect(parseSfnt(read('CrimsonText-Bold.ttf')).family).toBe('Crimson Text');
  });

  it.each([
    ['RobotoMono-Regular.ttf', 'normal-normal'],
    ['RobotoMono-Bold.ttf', 'bold-normal'],
    ['RobotoMono-Italic.ttf', 'normal-italic'],
    ['RobotoMono-BoldItalic.ttf', 'bold-italic'],
  ])('reads %s as the %s face', (file, variant) => {
    // A file is one face, and which one is not a guess from its name: the same
    // family added face by face has to land in four different slots.
    expect(parseSfnt(read(file)).variant).toBe(variant);
  });

  it('says whether the outlines are variable', () => {
    // Static files, so nothing borrows. A variable one would be a family short
    // of faces (ADR-0016), which is a different answer, not an error.
    expect(parseSfnt(read('Caveat-Regular.ttf')).isVariable).toBe(false);
  });

  it('refuses a file that is not a font', () => {
    const junk = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

    expect(() => parseSfnt(junk.buffer)).toThrow(FontFileError);
  });

  it('refuses CFF outlines by the header, not the extension', () => {
    // A `.otf` may hold either kind. jsPDF reads `glyf` and nothing else, so
    // accepting this one would draw on screen and vanish from every PDF.
    const otto = new DataView(new ArrayBuffer(12));
    otto.setUint32(0, 0x4f54544f);

    expect(() => parseSfnt(otto.buffer)).toThrow(/CFF/);
  });
});

describe('the id a font gets', () => {
  it('is a slug of the family, namespaced', () => {
    // Two devices that add the same file independently must agree, and a
    // bundled family must not collide with a user's own copy of it.
    expect(customFontId('Crimson Text')).toBe('custom:crimson-text');
  });

  it('survives a family name that is not ASCII', () => {
    expect(slugify('Písmo Čtyři')).toBe('pismo-ctyri');
  });
});
