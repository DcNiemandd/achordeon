// Block layout — Epic 3 ▸ subtask 7 (label gutter, chord-only lines, bridge)
// Spec: PRD-RENDERING §4.8 (label gutter), §4.9 (chord-only lines & bridge),
// §4.7 (inter-line/inter-block rhythm).
//
// Stacks a Block's lines into a block-local box (origin = block top-left). Owns:
//   • the inline-label gutter (content indents to `gutter`; label sits in it),
//   • chord-only line distribution across the column content width,
//   • the bridge convention (all-chord-only Block renders larger).
// The column pass (subtask 4) sizes the gutter and column width, then calls this
// with the resolved values; block layout in isolation packs at natural width.

import type { Block, Line } from '@achordeon/shared/domain';
import type { TextItem } from './render-plan';
import { toFontSpec, type LayoutContext } from './context';
import { layoutLine } from './line-layout';

export interface BlockLayout {
  items: TextItem[];
  width: number; // rightmost extent (for column width)
  height: number; // total block height in base units
  isBridge: boolean; // all-chord-only ⇒ rendered larger (§4.9)
}

/** A chord-only line: carries anchors but no printable lyric text (§4.9). */
export function isChordOnly(line: Line): boolean {
  return line.chords.length > 0 && line.text.trim() === '';
}

/** Inline-label width (0 unless the block owns an inline label) — feeds the column gutter (§4.8). */
export function inlineLabelWidth(block: Block, ctx: LayoutContext): number {
  if (!block.label || !block.labelInline) return 0;
  return ctx.measure.measure(block.label, toFontSpec(ctx.styles.label)).width;
}

/** Group anchors sharing an `at` into one run, doc order preserved (§4.6). */
function groups(line: Line, joiner: string): string[] {
  const byIndex = new Map<number, string[]>();
  for (const c of line.chords) {
    const run = byIndex.get(c.at);
    if (run) run.push(c.raw);
    else byIndex.set(c.at, [c.raw]);
  }
  return [...byIndex.values()].map((raws) => raws.join(joiner));
}

/**
 * Distribute a chord-only line's chords across `targetWidth` (§4.9). `justified`
 * spreads left edges with equal gaps to fill the width; `left` packs them at the
 * natural gap. `scale` is the bridge multiplier applied to glyph size + widths.
 */
function layoutChordOnly(
  line: Line,
  ctx: LayoutContext,
  lineOrigin: number,
  scale: number,
  targetWidth: number | undefined,
): { items: TextItem[]; width: number; height: number } {
  const { tuning, metrics } = ctx;
  const chordFont = toFontSpec(ctx.styles.chord);
  const runs = groups(line, tuning.sameIndexJoiner);
  const widths = runs.map(
    (t) => ctx.measure.measure(t, chordFont).width * scale,
  );
  const gap = tuning.spacing.chordOnlyGapEm * tuning.baseSizePx * scale;
  const sumW = widths.reduce((a, b) => a + b, 0);
  const natural = sumW + gap * Math.max(0, runs.length - 1);

  const justified =
    tuning.chordOnlyDistribution === 'justified' &&
    targetWidth !== undefined &&
    targetWidth > natural &&
    runs.length > 1;
  const step = justified ? (targetWidth - sumW) / (runs.length - 1) : gap;

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
  const width = lineOrigin + (justified ? targetWidth : natural);
  return { items, width, height };
}

/**
 * Lay out a Block. `gutter` is the column's inline-label gutter (§4.8);
 * `columnWidth` (when known) lets chord-only lines justify to the column (§4.9).
 */
export function layoutBlock(
  block: Block,
  ctx: LayoutContext,
  gutter = 0,
  columnWidth?: number,
): BlockLayout {
  const { metrics, tuning } = ctx;
  const isBridge = block.lines.length > 0 && block.lines.every(isChordOnly);
  const scale = isBridge ? tuning.bridgeSizeMultiplier : 1;

  const hasInlineLabel = !!block.label && !!block.labelInline;
  const lineOrigin = hasInlineLabel ? gutter : 0;
  // Chord-only lines justify to the content span (column minus the gutter).
  const contentWidth =
    columnWidth !== undefined ? columnWidth - lineOrigin : undefined;

  const items: TextItem[] = [];
  let y = 0;
  let width = 0;
  const leading = tuning.spacing.lineLeadingFactor * metrics.lyric.height;

  // Two-line label: its own row at x = 0, content rows below it (§4.8).
  if (block.label && !block.labelInline) {
    items.push({
      text: block.label,
      x: 0,
      y: metrics.label.ascent,
      role: 'label',
    });
    width = Math.max(
      width,
      ctx.measure.measure(block.label, toFontSpec(ctx.styles.label)).width,
    );
    y += metrics.label.height + leading;
  }

  block.lines.forEach((line, i) => {
    const local = isChordOnly(line)
      ? layoutChordOnly(line, ctx, lineOrigin, scale, contentWidth)
      : (() => {
          const l = layoutLine(line, ctx, lineOrigin);
          return { items: l.items, width: l.width, height: l.height };
        })();

    // Inline label rides the first content line's row, rendered in the gutter.
    if (hasInlineLabel && i === 0) {
      const baseline =
        local.items.find((it) => it.role === 'lyric')?.y ??
        metrics.label.ascent;
      items.push({
        text: block.label as string,
        x: 0,
        y: y + baseline,
        role: 'label',
      });
    }

    for (const it of local.items) items.push({ ...it, y: it.y + y });
    width = Math.max(width, local.width);
    y += local.height + leading;
  });

  // Trim the trailing inter-line leading; block height is content only.
  const height =
    block.lines.length > 0 || block.label ? Math.max(0, y - leading) : 0;
  return { items, width, height, isBridge };
}
