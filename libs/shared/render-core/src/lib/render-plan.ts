// RenderPlan — Epic 3 ▸ subtask 2
// Spec: PRD-RENDERING §5. The output of `layout` and the input to `emit`:
// PURE DATA, no SVG/DOM. Coords are in BASE (pre-fit) units; one transform in
// `emit` applies `fit`. Keeping this a flat, positioned list (not a block tree)
// is what lets `emit` stay a dumb walk and keeps the native-emitter escape hatch
// open (§1).

/** The only thing `emit` branches on when styling an item. */
export type TextRole = 'title' | 'subtitle' | 'label' | 'lyric' | 'chord';

export interface TextItem {
  text: string;
  x: number; // baseline-LEFT origin, BASE (pre-fit) units
  y: number; // baseline y, base units
  role: TextRole; // → styles[role]
  rotate?: -90; // title CCW spine only (§4.5); absent = upright
  sizeScale?: number; // per-item multiple of styles[role].sizePx (bridge, §4.9); absent = 1
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
}
