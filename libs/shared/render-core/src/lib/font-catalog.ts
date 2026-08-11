// Font catalog — the families a song may be set in
// Spec: PRD-RENDERING §4.10 (fonts, chord colour & chord size), ADR-0017 (a font
// id is a family slug, and the catalog is injected).
//
// The seam between a *setting* ("the title is set in Crimson Text") and the
// *bytes* that eventually draw it. A setting stores an id; resolving it yields
// the CSS family + fallback stack that `measure` and `emit` both name — and those
// two must always agree, or the geometry describes a font the browser never draws
// with.
//
// **One row per family, and the row owns everything about it.** The family names
// used to live in a `switch` here while the file paths lived in a constant in
// `data-access`, hand-synced; a mismatch between them drew a font nobody loaded,
// silently. A row now carries its CSS identity, its faces and where their bytes
// are, so there is one place to be wrong and it fails at the row rather than
// between two files.
//
// **The catalog is a parameter, not a constant** (ADR-0017). Which families exist
// is a function of the *device* once a user can add their own, so the pure core
// declares the shape and the platform supplies `BUNDLED_FONTS` merged with
// whatever is installed. This is the argument `fonts.ts` already makes for
// `FontResolver` — "the platform therefore injects a lookup rather than a list" —
// applied one layer up.

import type { FaceVariant } from './fonts';
import type { RenderTuning } from './tuning';

/**
 * What a font setting stores: a slug of the family's own name (ADR-0017).
 *
 * Deliberately `string` and not a union. The value space is open — a family the
 * user installed exists on one device and not another — and a value this build's
 * catalog does not know is *preserved verbatim*, never repaired, so nothing may
 * narrow it on the way in.
 */
export type FontId = string;

/** The sentinel `titleFont` uses for "whatever the rest of the song is set in". */
export const BODY_FONT: FontId = 'body';

/** The id of the family the app is set in until a song says otherwise. */
export const DEFAULT_BODY_FONT: FontId = 'roboto-mono';

/** How a picker groups its families. Not a value anything stores. */
export type FontCategory = 'mono' | 'serif' | 'sans' | 'display' | 'script';

/** Where one face's bytes come from. The platform is what knows how to read it. */
export type FaceSource =
  /** A file shipped with the app, as a path relative to the base href. */
  | { readonly kind: 'asset'; readonly path: string }
  /** A face the user added, by its key in the device's font store (ADR-0016). */
  | { readonly kind: 'stored'; readonly key: string };

/** One family: its identity, its faces, and where their bytes are. */
export interface FontFamily {
  readonly id: FontId;
  /**
   * The family's own name, as it prints. Not translated and not a role — with a
   * library there are two serifs, and "Serif" stops being a name.
   */
  readonly label: string;
  readonly category: FontCategory;
  /**
   * The CSS family name `measure` and `emit` both name. Distinct from `id`
   * because a user-added family is namespaced against the bundled one it may
   * share a name with, and the browser's font registry has no namespaces.
   */
  readonly family: string;
  /** CSS generic(s) after `family`, for the frame or two before the face lands. */
  readonly fallback: string;
  readonly faces: Partial<Record<FaceVariant, FaceSource>>;
  /**
   * Where a face this family does not have is borrowed from. Absent means the
   * body family, which is precached and so costs nothing to borrow (ADR-0017).
   */
  readonly donor?: FontId;
  /** SPDX-ish identifier, and the notice file that has to travel with the bytes. */
  readonly license: string;
  readonly notice?: string;
}

/**
 * The families this device has.
 *
 * Two consumers, both load-bearing: resolution by id (layout, emit, PDF) and
 * enumeration (the picker, and the import warning that has to say which font a
 * file names that this install lacks).
 */
export interface FontCatalog {
  get(id: FontId): FontFamily | undefined;
  list(): readonly FontFamily[];
}

/**
 * The role names `titleFont` stored before there was a library.
 *
 * A stored `'serif'` still means Crimson Text, so it resolves as a **lookup
 * alias** rather than being migrated: no stored record changes and this is not a
 * schema break (ADR-0007), the same mechanism the retired `'sans'` already uses.
 * `'sans'` is deliberately absent — it named a CSS generic that could never be
 * embedded, so it falls through to the body face, which is this setting's own
 * default and the one answer that is never wrong.
 */
export const FONT_ALIASES: Readonly<Record<string, FontId>> = {
  serif: 'crimson-text',
  display: 'oswald',
  script: 'caveat',
};

/**
 * The families the app ships (§4.10's recommended set: a mono body, a serif, a
 * condensed/display and a script).
 *
 * The three title faces were chosen because they look unlike Roboto Mono at title
 * size. Only the body carries italics — markdown emphasis is a body-lyric thing,
 * and titles are never markdown-parsed.
 */
export const BUNDLED_FONTS: readonly FontFamily[] = [
  {
    id: 'roboto-mono',
    label: 'Roboto Mono',
    category: 'mono',
    // The STATIC Roboto Mono, not the variable webfont the app chrome is set in:
    // jsPDF `addFont` takes a static TTF, and the render must measure the face
    // the export embeds.
    family: 'Roboto Mono',
    fallback: "ui-monospace, 'Cascadia Code', Menlo, Consolas, monospace",
    faces: {
      'normal-normal': { kind: 'asset', path: 'fonts/RobotoMono-Regular.ttf' },
      'bold-normal': { kind: 'asset', path: 'fonts/RobotoMono-Bold.ttf' },
      'normal-italic': { kind: 'asset', path: 'fonts/RobotoMono-Italic.ttf' },
      'bold-italic': { kind: 'asset', path: 'fonts/RobotoMono-BoldItalic.ttf' },
    },
    license: 'Apache-2.0',
    notice: 'fonts/OFL.txt',
  },
  {
    id: 'crimson-text',
    label: 'Crimson Text',
    category: 'serif',
    family: 'Crimson Text',
    fallback: 'Georgia, Cambria, serif',
    faces: {
      'normal-normal': { kind: 'asset', path: 'fonts/CrimsonText-Regular.ttf' },
      'bold-normal': { kind: 'asset', path: 'fonts/CrimsonText-Bold.ttf' },
    },
    license: 'OFL-1.1',
    notice: 'fonts/OFL.txt',
  },
  {
    id: 'oswald',
    label: 'Oswald',
    category: 'display',
    family: 'Oswald',
    fallback: "'Arial Narrow', system-ui, sans-serif",
    faces: {
      'normal-normal': { kind: 'asset', path: 'fonts/Oswald-Regular.ttf' },
      'bold-normal': { kind: 'asset', path: 'fonts/Oswald-Bold.ttf' },
    },
    license: 'OFL-1.1',
    notice: 'fonts/OFL.txt',
  },
  {
    id: 'caveat',
    label: 'Caveat',
    category: 'script',
    family: 'Caveat',
    fallback: 'cursive',
    faces: {
      'normal-normal': { kind: 'asset', path: 'fonts/Caveat-Regular.ttf' },
      'bold-normal': { kind: 'asset', path: 'fonts/Caveat-Bold.ttf' },
    },
    license: 'OFL-1.1',
    notice: 'fonts/OFL.txt',
  },
];

/** A catalog over a fixed list of families, in the order a picker should show them. */
export function createFontCatalog(
  families: readonly FontFamily[],
): FontCatalog {
  const byId = new Map(families.map((family) => [family.id, family]));
  return {
    get: (id) => byId.get(FONT_ALIASES[id] ?? id),
    list: () => families,
  };
}

/** What the app has before anything is installed — and what a test gets for free. */
export const BUNDLED_CATALOG: FontCatalog = createFontCatalog(BUNDLED_FONTS);

/**
 * The CSS family of `DEFAULT_BODY_FONT` — the name jsPDF and the canvas know it
 * by, for text that is not a render and so has no plan to take a face from (the
 * songbook summary, the page numbers).
 *
 * Read off the row rather than written out again: an id and the family it draws
 * with are one decision, and two copies of it is exactly the drift this file
 * exists to end.
 */
export const DEFAULT_BODY_FAMILY: string =
  BUNDLED_CATALOG.get(DEFAULT_BODY_FONT)?.family ?? '';

/** A family a setting names, or `undefined` for the `body` sentinel and unknowns. */
export function findFont(
  catalog: FontCatalog,
  id: FontId | undefined,
): FontFamily | undefined {
  if (!id || id === BODY_FONT) return undefined;
  return catalog.get(id);
}

export interface ResolvedFont {
  /**
   * The family actually drawn, or `null` when nothing in the catalog answered and
   * the renderer's own tuning is what draws. Callers fetch bytes by this id.
   */
  id: FontId | null;
  family: string;
  /** CSS generic(s) after `family`, for both the SVG and the measurer. */
  fallback: string;
}

function toResolved(family: FontFamily): ResolvedFont {
  return { id: family.id, family: family.family, fallback: family.fallback };
}

/** The renderer's own face — where a choice lands when the catalog cannot answer. */
function fromTuning(tuning: RenderTuning): ResolvedFont {
  return {
    id: null,
    family: tuning.fontFamily,
    fallback: tuning.fallbackStack,
  };
}

/**
 * The two faces one render draws with.
 *
 * `title` following `body` is the whole meaning of the `body` sentinel, and it is
 * why both are resolved in one call: reading `titleFont` without knowing what the
 * body resolved to is how "Same as song" quietly became "same as the constant".
 *
 * An id this catalog has never heard of resolves to the body face and is left
 * **in the record untouched** (ADR-0017) — installing the font later is what
 * brings the page back.
 */
export function resolveFonts(
  catalog: FontCatalog,
  ids: { body?: FontId; title?: FontId },
  tuning: RenderTuning,
): { body: ResolvedFont; title: ResolvedFont } {
  const bodyFamily = findFont(catalog, ids.body);
  const body = bodyFamily ? toResolved(bodyFamily) : fromTuning(tuning);
  const titleFamily = findFont(catalog, ids.title);
  return { body, title: titleFamily ? toResolved(titleFamily) : body };
}
