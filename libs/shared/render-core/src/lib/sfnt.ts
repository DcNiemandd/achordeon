// sfnt — reading a font file well enough to accept or refuse it
// Spec: ADR-0016 (one parse at add-time answers everything), ADR-0017 (the id is
// a slug of the family's own name), PRD-RENDERING §4.10.
//
// **One read answers every question adding a font asks**: is this really
// TrueType, what does the family call itself, is it variable, and which of the
// four faces this file is. Doing them separately would mean four passes over a
// quarter of a megabyte and four places to disagree about what the file said.
//
// Pure, and deliberately here rather than in the platform: it decides what goes
// into a catalog row (`font-catalog.ts`), and nothing about reading a byte
// buffer needs a browser.
//
// **TrueType only, and refused rather than sniffed** when it is not. jsPDF's
// `addFont` reads `glyf` outlines and nothing else, so a CFF/`OTTO` file would
// draw on screen and be missing from every PDF — §4.10's forbidden divergence.
// The extension does not say which a `.otf` is, which is why the answer comes
// from the header instead.

import type { FaceVariant } from './fonts';

/** Everything the one parse found. */
export interface ParsedFont {
  /** The family as the font itself names it — the source of the id (ADR-0017). */
  family: string;
  /** "Regular", "Bold Italic"… What the font calls this particular file. */
  subfamily: string;
  /** Which of the four faces this file is. */
  variant: FaceVariant;
  /**
   * The file carries an `fvar` table.
   *
   * jsPDF reads `glyf` and ignores `gvar`, so a variable font registers as its
   * **default instance only** and cannot be asked for another axis value. Marked
   * here so the catalog can treat it as a family short of faces (ADR-0016) rather
   * than register it as a bold it cannot actually draw.
   */
  isVariable: boolean;
  /** Name ID 13 — what the file says about its own licence, where it says it. */
  license?: string;
}

/** Why a file was refused. The message is shown to the user, so it says what to do. */
export class FontFileError extends Error {}

const TRUETYPE = 0x00010000;
const TRUE = 0x74727565; // 'true' — an older TrueType signature, still valid
const OTTO = 0x4f54544f; // CFF outlines: real font, wrong kind
const TTCF = 0x74746366; // a collection of fonts rather than one

/** Read a font file, or throw saying why it cannot be used. */
export function parseSfnt(buffer: ArrayBuffer): ParsedFont {
  const view = new DataView(buffer);
  if (buffer.byteLength < 12) {
    throw new FontFileError('not a font file');
  }

  const signature = view.getUint32(0);
  if (signature === OTTO) {
    throw new FontFileError('OpenType/CFF outlines');
  }
  if (signature === TTCF) {
    throw new FontFileError('font collection');
  }
  if (signature !== TRUETYPE && signature !== TRUE) {
    throw new FontFileError('not TrueType');
  }

  const tables = readTableDirectory(view);
  // The outlines themselves. A file passing the signature check without them is
  // not something anything downstream could draw.
  if (!tables.has('glyf')) {
    throw new FontFileError('no TrueType outlines');
  }

  const names = readNames(view, tables.get('name'));
  // Typographic family (16) before family (1): a four-face family splits itself
  // across several ID-1 names — "Lora" and "Lora Semibold" — and only 16 says
  // they are one family. Where both exist, 16 is the one that groups.
  const family = names.get(16) ?? names.get(1);
  if (!family) {
    throw new FontFileError('the font does not name its family');
  }

  return {
    family,
    subfamily: names.get(17) ?? names.get(2) ?? 'Regular',
    variant: readVariant(view, tables),
    isVariable: tables.has('fvar'),
    ...(names.get(13) ? { license: names.get(13) } : {}),
  };
}

/**
 * The catalog id for a family the user added (ADR-0017).
 *
 * Prefixed, because a bundled `lora` and a user's own copy of Lora are two rows
 * and the browser's font registry has no namespaces. Slugged from the family's
 * own name, which is what makes the same font added on a phone and on a laptop
 * agree without any identity reconciliation.
 */
export function customFontId(family: string): string {
  return `custom:${slugify(family)}`;
}

/** Lowercase, hyphenated, ASCII-ish — a name that survives being a key. */
export function slugify(name: string): string {
  return (
    name
      .normalize('NFKD')
      // Combining marks, so "Ubuntu Condensed" and an accented family both land
      // on something a URL and an index key can hold.
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  );
}

/** tag → { offset, length } for every table in the file. */
function readTableDirectory(
  view: DataView,
): Map<string, { offset: number; length: number }> {
  const count = view.getUint16(4);
  const tables = new Map<string, { offset: number; length: number }>();
  for (let i = 0; i < count; i++) {
    const record = 12 + i * 16;
    if (record + 16 > view.byteLength) break;
    const tag = String.fromCharCode(
      view.getUint8(record),
      view.getUint8(record + 1),
      view.getUint8(record + 2),
      view.getUint8(record + 3),
    );
    tables.set(tag, {
      offset: view.getUint32(record + 8),
      length: view.getUint32(record + 12),
    });
  }
  return tables;
}

/**
 * The `name` table, as nameID → string.
 *
 * Windows/Unicode records win over Macintosh ones where a file has both, because
 * the Mac record is MacRoman and loses every character outside ASCII — a Czech or
 * Greek family would come out of it mangled and then be slugged that way.
 */
function readNames(
  view: DataView,
  table: { offset: number; length: number } | undefined,
): Map<number, string> {
  const names = new Map<number, string>();
  if (!table) return names;
  const base = table.offset;
  if (base + 6 > view.byteLength) return names;

  const count = view.getUint16(base + 2);
  const storage = base + view.getUint16(base + 4);
  const seenUnicode = new Set<number>();

  for (let i = 0; i < count; i++) {
    const record = base + 6 + i * 12;
    if (record + 12 > view.byteLength) break;
    const platform = view.getUint16(record);
    const nameId = view.getUint16(record + 6);
    const length = view.getUint16(record + 8);
    const offset = storage + view.getUint16(record + 10);
    if (offset + length > view.byteLength) continue;

    // Platform 0 is Unicode, 3 is Windows (UTF-16BE in every encoding we care
    // about); 1 is Macintosh, single-byte.
    const isUnicode = platform === 0 || platform === 3;
    if (!isUnicode && seenUnicode.has(nameId)) continue;

    const text = isUnicode
      ? readUtf16Be(view, offset, length)
      : readLatin1(view, offset, length);
    if (!text) continue;

    names.set(nameId, text);
    if (isUnicode) seenUnicode.add(nameId);
  }
  return names;
}

function readUtf16Be(view: DataView, offset: number, length: number): string {
  let text = '';
  for (let i = 0; i + 1 < length; i += 2) {
    text += String.fromCharCode(view.getUint16(offset + i));
  }
  return text.trim();
}

function readLatin1(view: DataView, offset: number, length: number): string {
  let text = '';
  for (let i = 0; i < length; i++) {
    text += String.fromCharCode(view.getUint8(offset + i));
  }
  return text.trim();
}

/**
 * Which face this file is.
 *
 * `OS/2.fsSelection` first and `head.macStyle` only as a fallback: `macStyle` is
 * the older field and is left at zero by a fair number of foundries, which would
 * make every file in a family look like the regular and quietly overwrite it.
 */
function readVariant(
  view: DataView,
  tables: Map<string, { offset: number; length: number }>,
): FaceVariant {
  const os2 = tables.get('OS/2');
  if (os2 && os2.offset + 64 <= view.byteLength) {
    const fsSelection = view.getUint16(os2.offset + 62);
    // Bit 0 ITALIC, bit 5 BOLD, bit 9 OBLIQUE — an oblique is an italic as far
    // as anything downstream is concerned.
    const isItalic = (fsSelection & 0x001) !== 0 || (fsSelection & 0x200) !== 0;
    const isBold = (fsSelection & 0x020) !== 0;
    return variantOf(isBold, isItalic);
  }

  const head = tables.get('head');
  if (head && head.offset + 46 <= view.byteLength) {
    const macStyle = view.getUint16(head.offset + 44);
    return variantOf((macStyle & 0x01) !== 0, (macStyle & 0x02) !== 0);
  }
  return 'normal-normal';
}

function variantOf(isBold: boolean, isItalic: boolean): FaceVariant {
  return `${isBold ? 'bold' : 'normal'}-${
    isItalic ? 'italic' : 'normal'
  }` as FaceVariant;
}
