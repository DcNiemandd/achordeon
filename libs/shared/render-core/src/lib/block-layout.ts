// Block layout — Epic 3 ▸ subtask 7 (label gutter, line stacking)
// Spec: PRD-RENDERING §4.8 (label gutter), §4.9 (chords in the flow),
// §4.7 (inter-line/inter-block rhythm).
//
// Stacks a Block's lines into a block-local box (origin = block top-left). Owns:
//   • the inline-label gutter (content indents to `gutter`; label sits in it),
//   • nothing else — every line goes through the one line-layout pass, which
//     decides for itself which of its chords float and which sit in the flow.
// The column pass (subtask 4) sizes the gutter, then calls this with it; block
// layout in isolation packs at natural width.

import type { Block } from '@achordeon/shared/domain';
import type { TextItem } from './render-plan';
import { toFontSpec, type LayoutContext } from './context';
import { layoutLine } from './line-layout';

export interface BlockLayout {
  items: TextItem[];
  width: number; // rightmost extent (for column width)
  height: number; // total block height in base units
}

/** Inline-label width (0 unless the block owns an inline label) — feeds the column gutter (§4.8). */
export function inlineLabelWidth(block: Block, ctx: LayoutContext): number {
  if (!block.label || !block.labelInline) return 0;
  return ctx.measure.measure(block.label, toFontSpec(ctx.styles.label)).width;
}

/** Lay out a Block. `gutter` is the column's inline-label gutter (§4.8). */
export function layoutBlock(
  block: Block,
  ctx: LayoutContext,
  gutter = 0,
): BlockLayout {
  const { metrics, tuning } = ctx;

  const hasInlineLabel = !!block.label && !!block.labelInline;
  const lineOrigin = hasInlineLabel ? gutter : 0;

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
    const local = layoutLine(line, ctx, lineOrigin);

    // Inline label rides the first content line's row, rendered in the gutter —
    // on that row's own baseline, whatever happens to sit on it (a lyric, a
    // sub-label, a chord in the flow).
    if (hasInlineLabel && i === 0) {
      items.push({
        text: block.label as string,
        x: 0,
        y: y + local.baseline,
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
  return { items, width, height };
}
