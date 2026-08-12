// RenderPlan — Epic 3 ▸ subtask 2
// Spec: PRD-RENDERING §5. The output of `layout` and the input to `emit`:
// PURE DATA, no SVG/DOM. Coords are in BASE (pre-fit) units; one transform in
// `emit` applies `fit`. Keeping this a flat, positioned list (not a block tree)
// is what lets `emit` stay a dumb walk and keeps the native-emitter escape hatch
// open (§1).

/** The only thing `emit` branches on when styling an item. */
export type TextRole =
  | 'title'
  | 'subtitle'
  | 'label'
  | 'sublabel'
  | 'lyric'
  | 'chord';

export interface TextItem {
  text: string;
  x: number; // baseline-LEFT origin, BASE (pre-fit) units
  y: number; // baseline y, base units
  role: TextRole; // → styles[role]
  rotate?: -90; // title CCW spine only (§4.5); absent = upright
  sizeScale?: number; // per-item multiple of styles[role].sizePx (flow chords, §4.9); absent = 1
  // Per-item emphasis overrides for markdown runs (§4.10): they replace the
  // role's own weight/style when present, and pick a different embedded face of
  // the SAME family. Absent = the role's style.
  weight?: 'normal' | 'bold';
  style?: 'normal' | 'italic';
}

export interface TextStyle {
  family: string;
  sizePx: number;
  weight: 'normal' | 'bold';
  style?: 'normal' | 'italic';
  fill: string;
  /** CSS generic appended after `family` for the SVG fallback (§4.10). */
  fallback?: string;
  /**
   * Where a face this family has not got comes from, by `${weight}-${style}`
   * (§4.10's donor rule, ADR-0017).
   *
   * Absent — the normal case — means the family draws all of its own. Present,
   * it names a **different family** for that one face, which is why it cannot be
   * left to the browser: an unbundled italic gets synthesized on screen and
   * simply does not exist in the PDF, and the two would disagree.
   */
  faces?: Partial<Record<string, { family: string; fallback?: string }>>;
}

/**
 * The family and fallback a role really draws one face in — its own, or the
 * donor's where it has none (§4.10).
 *
 * The one place that rule is applied. `emit`, the measurer and the font book all
 * call it, so a run of `*italic*` is measured, drawn and embedded in the same
 * face by construction.
 */
export function faceOf(
  style: TextStyle,
  weight: 'normal' | 'bold',
  fontStyle: 'normal' | 'italic',
): { family: string; fallback?: string } {
  return (
    style.faces?.[`${weight}-${fontStyle}`] ?? {
      family: style.family,
      fallback: style.fallback,
    }
  );
}

/** The font bytes, embedded both ways (SVG `@font-face` + jsPDF `addFont`). */
export interface EmbeddedFont {
  family: string;
  weight: 'normal' | 'bold';
  style: 'normal' | 'italic';
  /** Base64-encoded TTF. Empty when the platform relies on a CSS-loaded face. */
  base64: string;
}

export interface RenderPlan {
  box: { width: number; height: number }; // render box = aspect crop → SVG viewBox
  fit: number; // uniform content→box scale (§4.1)
  origin: { x: number; y: number }; // top-left of scaled content in the box (hugs top-left)
  items: TextItem[]; // EVERYTHING to draw, base units
  styles: Record<TextRole, TextStyle>; // resolved per-role style
  fonts: EmbeddedFont[]; // the bytes, embedded both ways
  /**
   * A ground the render paints for itself, filling the whole box.
   *
   * **Absent by default, and that is the normal case**: the render is a
   * document, so its page belongs to the medium — the PNG's opaque white
   * canvas, the PDF's paper, the `.page` div on screen. A transparent SVG is
   * the honest thing to hand each of them.
   *
   * The dark page (`RenderOpts.dark`) is the exception, and it is set here
   * rather than left to CSS so the SVG remains *self-describing*: white-ish ink
   * that only reads because of a class on an ancestor is a picture that is
   * wrong the moment it leaves this app. The fills and the ground they were
   * computed against travel together.
   */
  paper?: string;
}

/** Viewer options — NOT settings (§5). Re-run `layout` to toggle; reflow-safe. */
export interface RenderOpts {
  /** Blank chord glyphs but keep their reserved rows (Audience, §4.6). */
  hideChords?: boolean;
  /**
   * A content-placement OVERRIDE for pages that are not songs. Default absent —
   * a song hugs the corner (§4.5) unless its own `contentX`/`contentY` settings
   * move it. `center` is for a songbook's title page, which is a page of the book
   * rather than a song and belongs in the middle of its paper, regardless of any
   * song-level setting (§5). `top-left` forces the corner.
   *
   * The per-song nine-position placement is a SETTING (`contentX`/`contentY`);
   * this option exists only to override it for the title page.
   */
  align?: 'top-left' | 'center';
  /**
   * Turn the page over: a true-black ground and a light-on-dark palette
   * (`RenderTuning.dark`). Default absent — every render is light unless the
   * viewer in front of it asked otherwise.
   *
   * An **option, not a setting**, and the distinction is the whole design.
   * Settings cascade Global → Songbook → Song and are what the download, the
   * PDF and the print all resolve (CONTEXT.md §Render settings); a dark
   * background stored there would sooner or later come out of a printer as a
   * black A4. This never can: the export paths call `layout` without opts, so
   * the only way to a dark page is a live viewer asking for one.
   *
   * It is also **not shared**. The performer's stage may be dark while a
   * viewer's kitchen is not, so this rides on neither the settings the lobby
   * payload carries nor anything else that syncs — each device answers for its
   * own room, exactly as `hideChords` does (CONTEXT.md §Audience).
   */
  dark?: boolean;
}
