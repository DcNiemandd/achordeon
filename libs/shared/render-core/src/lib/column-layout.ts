// Column layout — Epic 3 ▸ subtask 4 (assignment + balancing)
// Spec: PRD-RENDERING §4.2 (columns). The author sets the column COUNT; the
// renderer chooses WHERE to break — only at Block boundaries (a Block is atomic,
// §4.2), preserving document order, choosing the breaks that MINIMISE THE
// TALLEST COLUMN (which is the content-box height, so minimising it maximises
// the uniform fit scale, §4.1). All in base units — assignment flows one way
// (blocks → content box → scale), no circular dependency.

import type { Block } from '@achordeon/shared/domain';
import type { TextItem } from './render-plan';
import type { LayoutContext } from './context';
import { inlineLabelWidth, layoutBlock } from './block-layout';

export interface ColumnLayout {
  items: TextItem[];
  width: number; // content-box width (base units)
  height: number; // content-box height = tallest column (base units)
}

/**
 * Partition `heights` (document order) into exactly `k` contiguous columns that
 * minimise the tallest column, where a column of m blocks also carries `gap`
 * between each adjacent pair. Returns one index array per column. Pure DP over
 * split points: `dp[c][i]` = min achievable tallest column placing the first `i`
 * blocks in `c` columns.
 */
export function assignColumns(
  heights: number[],
  k: number,
  gap: number,
): number[][] {
  const n = heights.length;
  if (n === 0) return [];
  const cols = Math.max(1, Math.min(k, n));

  // colHeight[i][j] = height of blocks i..j inclusive (with inter-block gaps).
  const prefix = [0];
  for (let i = 0; i < n; i++) prefix.push(prefix[i] + heights[i]);
  const colHeight = (i: number, j: number) =>
    prefix[j + 1] - prefix[i] + gap * (j - i);

  // dp[c][i] over the first i blocks; back[c][i] = the split index j.
  const dp: number[][] = Array.from({ length: cols + 1 }, () =>
    new Array(n + 1).fill(Infinity),
  );
  const back: number[][] = Array.from({ length: cols + 1 }, () =>
    new Array(n + 1).fill(0),
  );
  for (let i = 1; i <= n; i++) dp[1][i] = colHeight(0, i - 1);
  for (let c = 2; c <= cols; c++) {
    for (let i = c; i <= n; i++) {
      for (let j = c - 1; j < i; j++) {
        const worst = Math.max(dp[c - 1][j], colHeight(j, i - 1));
        if (worst < dp[c][i]) {
          dp[c][i] = worst;
          back[c][i] = j;
        }
      }
    }
  }

  const bounds: number[] = [n];
  for (let c = cols, i = n; c > 1; c--) {
    const j = back[c][i];
    bounds.unshift(j);
    i = j;
  }
  bounds.unshift(0);
  const result: number[][] = [];
  for (let c = 0; c < cols; c++) {
    const seg: number[] = [];
    for (let b = bounds[c]; b < bounds[c + 1]; b++) seg.push(b);
    result.push(seg);
  }
  return result;
}

/** Blocks that draw nothing (no label, no lines) add phantom gaps — drop them. */
function isEmpty(block: Block): boolean {
  return !block.label && block.lines.length === 0;
}

/**
 * Assign `blocks` into `columns` balanced columns and place every item in
 * content-box coordinates. Per-column gutter = widest inline label in the column
 * (§4.8); per-column width = widest block; chord-only lines then justify to it
 * (§4.9). Columns run left→right, blocks top→bottom (document order, §4.2).
 */
export function layoutColumns(
  blocks: Block[],
  columns: number,
  ctx: LayoutContext,
): ColumnLayout {
  const live = blocks.filter((b) => !isEmpty(b));
  if (live.length === 0) return { items: [], width: 0, height: 0 };

  const { tuning, metrics } = ctx;
  const interBlockGap =
    tuning.spacing.interBlockGapFactor * metrics.lyric.height;
  const columnGap = tuning.spacing.columnGapEm * tuning.baseSizePx;

  // Heights are assignment-independent (gutter/column width move x, not y).
  const heights = live.map((b) => layoutBlock(b, ctx).height);
  const segments = assignColumns(heights, columns, interBlockGap);

  const items: TextItem[] = [];
  let x = 0;
  let contentHeight = 0;
  for (const seg of segments) {
    if (seg.length === 0) continue;
    const colBlocks = seg.map((i) => live[i]);
    const gutter = Math.max(
      0,
      ...colBlocks.map((b) => inlineLabelWidth(b, ctx)),
    );
    // Column width from natural block widths, then justify chord-only lines to it.
    const colWidth = Math.max(
      0,
      ...colBlocks.map((b) => layoutBlock(b, ctx, gutter).width),
    );

    let y = 0;
    for (const block of colBlocks) {
      const bl = layoutBlock(block, ctx, gutter, colWidth);
      for (const it of bl.items)
        items.push({ ...it, x: it.x + x, y: it.y + y });
      y += bl.height + interBlockGap;
    }
    contentHeight = Math.max(contentHeight, y - interBlockGap);
    x += colWidth + columnGap;
  }

  return { items, width: x - columnGap, height: contentHeight };
}
