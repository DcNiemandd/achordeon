// RenderTuning — Epic 3 ▸ dev-facing tuning knobs
// Spec: PRD-RENDERING §4.7/§4.8/§4.9/§4.10 ("spacing magnitudes are tunable
// internal constants, NOT render settings").
//
// This is the renderer author's control surface: every geometry magnitude and
// visual-policy choice the PRD flags as "tunable" is a field here with a chosen
// default. It is DISTINCT from the user-facing SETTINGS registry (scale,
// columns, aspectRatio, chordColor, …): those cascade and persist per entity;
// these do not. A dev threads a partial `RenderTuning` into `createLayout` to
// A/B a magnitude; users never see any of this. Defaults are the author's taste
// (§4.7: "deliberately not grilled").
//
// Units convention:
//   *Factor  — multiple of a VERTICAL slot (lyric or chord line pitch).
//   *Em      — multiple of the base font size (horizontal whitespace).
//   *Multiplier / *Ratio — dimensionless scale of a measured quantity.

import type { TextRole } from './render-plan';

/** Per-role font selection, relative to the base lyric size. */
export interface RoleTypography {
  /** Font size as a multiple of `baseSizePx`. Chords additionally × the `chordSize` setting. */
  sizeFactor: number;
  weight: 'normal' | 'bold';
  style?: 'normal' | 'italic';
  /** Fill for this role, overriding `textColor`. Ignored for `chord` (the `chordColor` setting wins). */
  color?: string;
  /** The dark-page counterpart of `color`, overriding `dark.textColor`. Same
   * exclusion: chords take the (lifted) `chordColor` setting. */
  darkColor?: string;
}

/**
 * The dark page — a **viewer option**, never a setting and never the app theme.
 *
 * A performer on a dark stage reads off a black screen; the same song printed,
 * downloaded or handed to a viewer in daylight must not. So this palette is
 * reachable only through `RenderOpts.dark`, which the export paths never set
 * (PRD-RENDERING §5: opts are per-render viewer state, not settings, and they
 * do not cascade or persist). PRD-UI-SHELL.md §6 — "the render is a document,
 * dark mode is the desk, not the paper" — still holds for the app theme, which
 * cannot reach this: turning the UI dark leaves every render light, exactly as
 * before. This is the one thing that turns the paper itself over, and only
 * because a performer asked for it on the device in their hands.
 */
export interface DarkTuning {
  /** The page. True black, for the OLED panel in a dark room the feature exists for. */
  paper: string;
  /** Fill for every non-chord role that names no `darkColor` of its own. */
  textColor: string;
  /**
   * The contrast floor the user's `chordColor` is lifted to against `paper`
   * (WCAG AA for body text). A floor, not a target: a chord colour that already
   * reads on black is left exactly as chosen. See `liftInkForPaper`.
   */
  minChordContrast: number;
}

export interface RenderTuning {
  /** The base reference lyric size, in base units. All role sizes derive from it (§4.1). */
  baseSizePx: number;

  /** The one bundled v1 family (§4.10). Bytes are injected via the FontBook seam. */
  fontFamily: string;
  /** CSS generic(s) appended after the family in the SVG `font-family` (§4.10 fallback). */
  fallbackStack: string;
  /** Fill for every non-chord role that names no `color` of its own; chords use the `chordColor` setting (§4.10). */
  textColor: string;

  /** The same palette for a page turned over — see `DarkTuning`. */
  dark: DarkTuning;

  /** Per-role size/weight/style. Chord `sizeFactor` is pre-`chordSize` (§4.10). */
  typography: Record<TextRole, RoleTypography>;

  spacing: {
    /** Extra leading between successive lines, × the line's own pitch. 0 = pitch only (§4.7). */
    lineLeadingFactor: number;
    /** Gap between blocks, × a lyric slot (§4.7 "≈ one lyric line slot"). */
    interBlockGapFactor: number;
    /** Gap between the chord row and its lyric slot, × chord-row height. 0 = abut (§4.7). */
    chordRowGapFactor: number;
    /** Horizontal gap between content columns, × `baseSizePx` (§4.2). */
    columnGapEm: number;
    /** Gap after an inline label or a sub-label before content begins, × `baseSizePx` (§4.8). */
    gutterGapEm: number;
    /** Gap between the title block and content, × a lyric slot (top) / `baseSizePx` (spine) (§4.5). */
    titleGapFactor: number;
    /** Gap between title and subtitle when stacked, × the subtitle slot (§4.5). */
    titleStackGapFactor: number;
    /** Gap between title and subtitle when inline, × `baseSizePx` (§4.5). */
    titleInlineGapEm: number;
  };

  /**
   * The auto-fit ceiling: the render box's short axis is never smaller than this
   * many `baseSizePx` (§4.1).
   *
   * The box is what the medium scales to fill, so a box drawn tight around a
   * two-line song is an instruction to magnify it enormously. This is the floor
   * that stops it — below it the song keeps its natural size and gains blank page
   * instead. Effectively "text is at most 1/N of the page's short side". Applies
   * to `scale: 'auto'` only.
   */
  minBoxEm: number;

  /**
   * Size of a chord that sits IN the line rather than above it (§4.9), × its
   * chord size. Applied in base units before the fit.
   *
   * A chord above a lyric is set small so it does not compete with the words;
   * a chord that IS the line has no words to defer to, so it comes back up to
   * lyric size. This is the old bridge multiplier: same number, same look, now
   * keyed on the chord rather than on the block it happened to sit in.
   */
  flowChordMultiplier: number;

  /** Members of a same-index anchor group are joined by this string in the chord font (§4.6). */
  sameIndexJoiner: string;

  /** Allow different-index chords to overlap rather than shove (§4.6). Fixed true in v1; a seam. */
  overlapChords: boolean;

  /** §4.7 fallback: synthesised leading when `fontBoundingBox*` is unavailable. */
  fontBoundingBoxFallbackLeading: number;
}

/**
 * The author's chosen defaults — **the PoC render look, transcribed.**
 *
 * Every magnitude below is read off the HTML/CSS proof-of-concept
 * (`notes-maker`) at its 16px base, converted from px into this file's unit
 * convention. Where the PoC expressed something in CSS that has no knob here
 * (a flex `gap` collapsing into a margin, for instance), the two were summed.
 * Change freely; none of it is a user setting.
 */
export const DEFAULT_TUNING: RenderTuning = {
  baseSizePx: 16, // PoC `font-size: calc(16px * scale)`

  // The PoC set lyrics/labels/chords in Roboto Mono and titles in Roboto. v1
  // ships ONE font (§4.10), so the mono wins — it is the face the chord sheet is
  // actually made of, and the app already bundles it (`@fontsource-variable/
  // roboto-mono`, see `apps/app/project.json`). Titles go mono too; that is the
  // one deliberate departure from the PoC.
  //
  // This name must match a face the platform has really loaded. It previously
  // read 'Achordeon', which is nothing: every measurement and every glyph
  // silently fell through to the system sans.
  // The STATIC Roboto Mono, not the variable webfont the app chrome is set in
  // (`Roboto Mono Variable`). Epic 7 needs the same bytes in the PDF as on the
  // screen, and jsPDF `addFont` takes a static TTF — a variable face would be
  // one the render measured and the export could not embed. The platform loads
  // this family from `public/fonts` and registers it, so the name below is a
  // face the browser really has.
  fontFamily: 'Roboto Mono',
  fallbackStack: "ui-monospace, 'Cascadia Code', Menlo, Consolas, monospace",
  textColor: '#000000',

  // The light palette reflected across the lightness axis, written out as
  // constants because this file is where the author's ink choices live.
  //
  // - `paper` is **true black**, not a near-black: on an OLED panel a lit pixel
  //   is the only pixel drawing power and the only pixel giving off light, so a
  //   #111 page in a dark room is a visibly glowing rectangle where a #000 one
  //   is the room. That is the whole reason a performer asks for this.
  // - `textColor` is the reflection of `#000000` — which is `#ffffff` — pulled
  //   back to 92% lightness. Pure white on true black haloes: the glyph edges
  //   bloom and the lyric gets harder to read, not easier. #ebebeb is still
  //   17.6:1 against the page, which is far past AAA.
  // - The subtitle's `#747474` reflects to `#8b8b8b` (116 → 139 of 255), which
  //   keeps it exactly as subordinate to the body text as it is on white. That
  //   ordering is the reason for reflecting rather than picking afresh.
  // - 4.5 is WCAG AA for body text, and it applies to the chord glyphs because
  //   they are set *smaller* than the lyrics (0.7em), not larger.
  dark: {
    paper: '#000000',
    textColor: '#ebebeb',
    minChordContrast: 4.5,
  },

  typography: {
    title: { sizeFactor: 1.5, weight: 'bold' }, // PoC h1 `min(1.5em, 100px)`
    subtitle: {
      sizeFactor: 1.2,
      weight: 'normal',
      color: '#747474',
      darkColor: '#8b8b8b',
    }, // PoC h2
    label: { sizeFactor: 1.0, weight: 'bold' },
    // A sub-label is subordinate to the block's label, so it takes the other
    // emphasis rather than a smaller size: bold names the section, italic names
    // a row inside it.
    sublabel: { sizeFactor: 1.0, weight: 'normal', style: 'italic' },
    lyric: { sizeFactor: 1.0, weight: 'normal' },
    // PoC chords over a lyric line are 0.7em; `chordSize: 1` means "the PoC
    // default", not "the lyric size". A user who wants them lyric-sized sets
    // chordSize ≈ 1.43.
    chord: { sizeFactor: 0.7, weight: 'bold' },
  },
  spacing: {
    lineLeadingFactor: 0, // PoC `line-height: 1em` — the font box is the pitch
    interBlockGapFactor: 0.8, // PoC 24px between sections ÷ the 16px lyric slot
    chordRowGapFactor: 0, // PoC chord row abuts its lyric
    columnGapEm: 1.0, // PoC relied on the CSS `columns` default gap, 1em
    gutterGapEm: 0.25, // PoC section `gap: 4px` between label and content
    titleGapFactor: 2.0, // PoC `.titles` margin-bottom 24px + the 8px flex gap
    titleStackGapFactor: 0.2, // PoC `.titles` row-gap 4px ÷ the 19.2px subtitle slot
    titleInlineGapEm: 1.5, // PoC `.titles` column-gap 24px
  },
  // 24 ≈ "a line of lyrics is never wider than a third of the page". Roughly a
  // full A4 of song at natural size; tune to taste.
  minBoxEm: 24,
  // The PoC sized any chord row sitting over an EMPTY lyric at the full 1em while
  // a chorded lyric line got 0.7em. 1/0.7 reproduces that exactly — which is also
  // why this is keyed on the chord and not on the block: the PoC's rule was about
  // the row the chord sat on all along.
  flowChordMultiplier: 1.43,
  sameIndexJoiner: ' ',
  overlapChords: true,
  fontBoundingBoxFallbackLeading: 1.2,
};

/** Deep-merge a partial override onto `DEFAULT_TUNING` (one level of nesting). */
export function resolveTuning(
  overrides?: DeepPartial<RenderTuning>,
): RenderTuning {
  if (!overrides) return DEFAULT_TUNING;
  return {
    ...DEFAULT_TUNING,
    ...overrides,
    typography: mergeTypography(overrides.typography),
    spacing: { ...DEFAULT_TUNING.spacing, ...overrides.spacing },
    dark: { ...DEFAULT_TUNING.dark, ...overrides.dark },
  };
}

function mergeTypography(
  o?: DeepPartial<RenderTuning['typography']>,
): RenderTuning['typography'] {
  if (!o) return DEFAULT_TUNING.typography;
  const base = DEFAULT_TUNING.typography;
  const out = {} as RenderTuning['typography'];
  for (const role of Object.keys(base) as TextRole[]) {
    out[role] = { ...base[role], ...o[role] };
  }
  return out;
}

/** Recursive partial — every nested field optional, for spreading overrides. */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};
