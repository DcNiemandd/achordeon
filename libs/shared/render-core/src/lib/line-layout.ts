// Line layout — Epic 3 ▸ subtask 6 (chord x-positioning + vertical rhythm)
// Spec: PRD-RENDERING §4.6 (chord x-positioning), §4.7 (vertical rhythm).
//
// Positions ONE line's items relative to the line's own top-left (`y = 0` at the
// top of the space the line occupies, `x = lineOrigin`). The caller (block
// layout) stacks these and translates them into column/page space, so this pass
// owns only the intra-line geometry: the signature chord-over-character x, the
// chord-only line distribution, the per-line chord row, and the base-unit
// vertical slot heights.

import type { Line, ChordAnchor } from '@achordeon/shared/domain';
import type { TextItem } from './render-plan';
import { toFontSpec, type LayoutContext } from './context';

export interface LineLayout {
  items: TextItem[];
  /** Total vertical slot for this line in base units (chord row + lyric slot, §4.7). */
  height: number;
  /** True when a chord row was reserved — kept even when `hideChords` blanks it (§4.6). */
  hasChordRow: boolean;
  /** Rightmost x reached by any item — feeds column width (§4.2). */
  width: number;
}

/**
 * Group anchors sharing one `at` into a single left-aligned run (§4.6
 * same-index group), preserving document order both across and within groups.
 * `[A][B]c` and `[A B]c` collapse to the identical run. Shared with the
 * chord-only distribution path in block layout, which keeps only `text`.
 */
export function groupByIndex(
  chords: ChordAnchor[],
  joiner: string,
): { at: number; text: string }[] {
  const groups = new Map<number, string[]>();
  for (const c of chords) {
    const run = groups.get(c.at);
    if (run) run.push(c.raw);
    else groups.set(c.at, [c.raw]);
  }
  return [...groups].map(([at, raws]) => ({ at, text: raws.join(joiner) }));
}

/**
 * Lay out one line at the given horizontal origin. Vertical rhythm (§4.7): a
 * chord row is reserved ONLY above a line that carries ≥1 anchor; the chord row
 * abuts the lyric slot (gap tunable). `hideChords` omits the chord glyphs but
 * keeps the row — so lyric baselines are identical with or without chords, and
 * nothing reflows (§4.6).
 */
export function layoutLine(
  line: Line,
  ctx: LayoutContext,
  lineOrigin: number,
): LineLayout {
  const { metrics, styles, tuning } = ctx;
  const lyricFont = toFontSpec(styles.lyric);
  const chordFont = toFontSpec(styles.chord);

  const hasChordRow = line.chords.length > 0;
  const chordRowH = hasChordRow ? metrics.chord.height : 0;
  const chordGap = hasChordRow
    ? tuning.spacing.chordRowGapFactor * metrics.chord.height
    : 0;

  const lyricTop = chordRowH + chordGap;
  const lyricBaseline = lyricTop + metrics.lyric.ascent;
  const chordBaseline = metrics.chord.ascent;
  const height = lyricTop + metrics.lyric.height;

  const items: TextItem[] = [];
  let width = lineOrigin;

  if (line.text.length > 0) {
    items.push({
      text: line.text,
      x: lineOrigin,
      y: lyricBaseline,
      role: 'lyric',
    });
    width = Math.max(
      width,
      lineOrigin + ctx.measure.measure(line.text, lyricFont).width,
    );
  }

  for (const group of groupByIndex(line.chords, tuning.sameIndexJoiner)) {
    // Left-edge-at-anchor: the chord's left edge sits at the left edge of the
    // anchored character; `at === text.length` floats it past the last glyph.
    const x =
      lineOrigin +
      ctx.measure.measure(line.text.slice(0, group.at), lyricFont).width;
    width = Math.max(
      width,
      x + ctx.measure.measure(group.text, chordFont).width,
    );
    if (!ctx.hideChords) {
      items.push({ text: group.text, x, y: chordBaseline, role: 'chord' });
    }
  }

  return { items, height, hasChordRow, width };
}

/**
 * Lay out one CHORD-ONLY line (anchors over blank text, §4.9) — a sibling of
 * `layoutLine` for the case where there are no characters to anchor over, so
 * chords are distributed across the width instead of measured over glyphs.
 * `justified` spreads left edges with equal gaps to fill `targetWidth`; `left`
 * packs them at the natural gap. `scale` is the bridge multiplier (§4.9) applied
 * to glyph size + widths. The whole line IS a chord row (`hasChordRow: true`).
 */
export function layoutChordOnly(
  line: Line,
  ctx: LayoutContext,
  lineOrigin: number,
  scale: number,
  targetWidth?: number,
): LineLayout {
  const { tuning, metrics } = ctx;
  const chordFont = toFontSpec(ctx.styles.chord);
  const runs = groupByIndex(line.chords, tuning.sameIndexJoiner).map(
    (g) => g.text,
  );
  const widths = runs.map(
    (t) => ctx.measure.measure(t, chordFont).width * scale,
  );
  const gap = tuning.spacing.chordOnlyGapEm * tuning.baseSizePx * scale;
  const sumW = widths.reduce((a, b) => a + b, 0);
  const natural = sumW + gap * Math.max(0, runs.length - 1);

  const isJustified =
    tuning.chordOnlyDistribution === 'justified' &&
    targetWidth !== undefined &&
    targetWidth > natural &&
    runs.length > 1;
  const step = isJustified ? (targetWidth - sumW) / (runs.length - 1) : gap;

  const height = metrics.chord.height * scale;
  const baseline = metrics.chord.ascent * scale;
  const items: TextItem[] = [];
  let x = lineOrigin;
  for (let i = 0; i < runs.length; i++) {
    if (!ctx.hideChords) {
      const item: TextItem = { text: runs[i], x, y: baseline, role: 'chord' };
      if (scale !== 1) item.sizeScale = scale;
      items.push(item);
    }
    x += widths[i] + step;
  }
  const width = lineOrigin + (isJustified ? targetWidth : natural);
  return { items, width, height, hasChordRow: true };
}
