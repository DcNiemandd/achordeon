// Title region — Epic 3 ▸ subtask 5
// Spec: PRD-RENDERING §4.5. The Title + Subtitle form one title block laid out
// as a region that is NEVER a content column and NEVER balanced (§4.2). Two
// orthogonal settings drive it: `titlePosition` ('top' | 'left' CCW spine) and
// `titleLayout` ('stacked' | 'inline'). Anchoring is always HUG TOP-LEFT —
// left-aligned for 'top', top-aligned for the 'left' spine, never centred.
//
// The region reserves space first; `layout` then offsets the content columns by
// `offset` (down for 'top', right for the spine). Base units throughout.

import type { GlobalSettings, SongAst } from '@achordeon/shared/domain';
import type { TextItem } from './render-plan';
import { toFontSpec, type LayoutContext } from './context';

export interface TitleRegion {
  items: TextItem[];
  /** Where content must start so it clears the region (§4.5). */
  offset: { x: number; y: number };
  width: number;
  height: number;
}

const EMPTY: TitleRegion = {
  items: [],
  offset: { x: 0, y: 0 },
  width: 0,
  height: 0,
};

export function layoutTitle(
  ast: SongAst,
  ctx: LayoutContext,
  settings: GlobalSettings,
): TitleRegion {
  const title = ast.title?.trim() ? ast.title : undefined;
  const subtitle = ast.subtitle?.trim() ? ast.subtitle : undefined;
  if (!title && !subtitle) return EMPTY;

  const { metrics } = ctx;
  const titleW = title
    ? ctx.measure.measure(title, toFontSpec(ctx.styles.title)).width
    : 0;
  const subW = subtitle
    ? ctx.measure.measure(subtitle, toFontSpec(ctx.styles.subtitle)).width
    : 0;
  const gap = ctx.tuning.spacing.titleGapFactor * metrics.lyric.height;

  return settings.titlePosition === 'left'
    ? spine(title, subtitle, titleW, subW, ctx, settings, gap)
    : top(title, subtitle, titleW, subW, ctx, settings, gap);
}

/** 'top' placement — left-aligned block above the content (§4.5). */
function top(
  title: string | undefined,
  subtitle: string | undefined,
  titleW: number,
  subW: number,
  ctx: LayoutContext,
  settings: GlobalSettings,
  gap: number,
): TitleRegion {
  const { metrics } = ctx;
  const items: TextItem[] = [];

  if (settings.titleLayout === 'inline') {
    // Title and subtitle share one row, side by side (§4.5).
    const rowAscent = Math.max(
      title ? metrics.title.ascent : 0,
      subtitle ? metrics.subtitle.ascent : 0,
    );
    const inlineGap =
      ctx.tuning.spacing.titleInlineGapEm * ctx.tuning.baseSizePx;
    let x = 0;
    if (title) {
      items.push({ text: title, x, y: rowAscent, role: 'title' });
      x += titleW + inlineGap;
    }
    if (subtitle)
      items.push({ text: subtitle, x, y: rowAscent, role: 'subtitle' });
    const height = Math.max(
      title ? metrics.title.height : 0,
      subtitle ? metrics.subtitle.height : 0,
    );
    const width =
      (title ? titleW : 0) +
      (title && subtitle ? inlineGap : 0) +
      (subtitle ? subW : 0);
    return { items, offset: { x: 0, y: height + gap }, width, height };
  }

  // Stacked: title row, subtitle row beneath it (§4.5).
  let y = 0;
  if (title) {
    items.push({ text: title, x: 0, y: metrics.title.ascent, role: 'title' });
    y += metrics.title.height;
  }
  if (title && subtitle)
    y += ctx.tuning.spacing.titleStackGapFactor * metrics.subtitle.height;
  if (subtitle) {
    items.push({
      text: subtitle,
      x: 0,
      y: y + metrics.subtitle.ascent,
      role: 'subtitle',
    });
    y += metrics.subtitle.height;
  }
  return {
    items,
    offset: { x: 0, y: y + gap },
    width: Math.max(titleW, subW),
    height: y,
  };
}

/**
 * 'left' placement — CCW spine(s) left of the content (§4.5). Rotated 90° CCW
 * (`rotate: -90`): text reads bottom-to-top. Font line-height(s) set the band
 * WIDTH; the longer string sets the band HEIGHT. Top-aligned: a string shorter
 * than the band leaves blank space below (larger y). For `rotate(-90)` about the
 * anchor, a string extends UPWARD (−y) from its baseline-left origin, so the
 * anchor (first char) sits at the string's bottom (`y = stringWidth`).
 */
function spine(
  title: string | undefined,
  subtitle: string | undefined,
  titleW: number,
  subW: number,
  ctx: LayoutContext,
  settings: GlobalSettings,
  gap: number,
): TitleRegion {
  const { metrics } = ctx;
  const items: TextItem[] = [];

  if (settings.titleLayout === 'inline') {
    // One spine line: title then subtitle, reading bottom-to-top (§4.5).
    const inlineGap =
      ctx.tuning.spacing.titleInlineGapEm * ctx.tuning.baseSizePx;
    const bandWidth = Math.max(
      title ? metrics.title.height : 0,
      subtitle ? metrics.subtitle.height : 0,
    );
    const ascent = Math.max(
      title ? metrics.title.ascent : 0,
      subtitle ? metrics.subtitle.ascent : 0,
    );
    const total =
      (title ? titleW : 0) +
      (title && subtitle ? inlineGap : 0) +
      (subtitle ? subW : 0);
    if (title)
      items.push({
        text: title,
        x: ascent,
        y: total,
        role: 'title',
        rotate: -90,
      });
    if (subtitle)
      items.push({
        text: subtitle,
        x: ascent,
        y: subW,
        role: 'subtitle',
        rotate: -90,
      });
    return {
      items,
      offset: { x: bandWidth + gap, y: 0 },
      width: bandWidth,
      height: total,
    };
  }

  // Stacked: two parallel spines — title outer (leftmost), subtitle inner (§4.5).
  const titleBand = title ? metrics.title.height : 0;
  const subBand = subtitle ? metrics.subtitle.height : 0;
  if (title)
    items.push({
      text: title,
      x: metrics.title.ascent,
      y: titleW,
      role: 'title',
      rotate: -90,
    });
  if (subtitle) {
    items.push({
      text: subtitle,
      x: titleBand + metrics.subtitle.ascent,
      y: subW,
      role: 'subtitle',
      rotate: -90,
    });
  }
  const bandWidth = titleBand + subBand;
  return {
    items,
    offset: { x: bandWidth + gap, y: 0 },
    width: bandWidth,
    height: Math.max(titleW, subW),
  };
}
