// layout — Epic 3 ▸ subtask 3 (the geometry brain, assembled)
// Spec: PRD-RENDERING §1 (pipeline), §5 (the `layout` call). Composes the
// passes — title region, balanced columns, scale-to-fit — into one pure
// `RenderPlan`. Imports no `@angular/*`: `measure` and the `FontBook` are
// injected platform dependencies, bound once via `createLayout` (the Angular
// `RenderService` is the partial application, §5). `opts` is per-render viewer
// state (`hideChords`).

import type { GlobalSettings, SongAst } from '@achordeon/shared/domain';
import type { RenderPlan, RenderOpts, TextItem } from './render-plan';
import type { TextMeasurer } from './text-measurer';
import { resolveTuning, type RenderTuning, type DeepPartial } from './tuning';
import { EMPTY_FONT_BOOK, buildFontBook, type FontResolver } from './fonts';
import { createContext } from './context';
import { layoutTitle } from './title-layout';
import { layoutColumns } from './column-layout';
import { parseAspectRatio } from './aspect';
import { fitContent, type AlignX, type AlignY } from './fit';

/**
 * The content anchor for this render: the title-page override wins over the
 * song's own `contentX`/`contentY`, which win over the `left`/`top` default.
 *
 * `opts.align` is only ever set for a page that is not a song (a songbook title
 * page), so a real song always falls through to its settings.
 */
function resolveAlign(
  settings: GlobalSettings,
  override: RenderOpts['align'],
): { alignX: AlignX; alignY: AlignY } {
  if (override === 'center') return { alignX: 'center', alignY: 'middle' };
  if (override === 'top-left') return { alignX: 'left', alignY: 'top' };
  return {
    alignX: (settings.contentX as AlignX) ?? 'left',
    alignY: (settings.contentY as AlignY) ?? 'top',
  };
}

/** Platform dependencies bound once (§5): the measurer, embedded fonts, tuning. */
export interface LayoutConfig {
  tuning?: DeepPartial<RenderTuning>;
  /**
   * Bytes per face, asked for only once the styles are resolved — a song's
   * `titleFont` decides which faces this render needs, so the platform injects a
   * lookup rather than a fixed book (see `fonts.ts`).
   */
  fonts?: FontResolver;
}

/**
 * The pure geometry brain: AST + resolved settings → `RenderPlan`. `measure`
 * stays explicit (trivially fakeable). The title region is reserved first and
 * NOT balanced (§4.5); content columns fill what remains and are translated to
 * clear it; the whole content box is then fit into the aspect-ratio render box.
 */
export function layoutCore(
  ast: SongAst,
  settings: GlobalSettings,
  measure: TextMeasurer,
  opts: RenderOpts = {},
  config: LayoutConfig = {},
): RenderPlan {
  const tuning = resolveTuning(config.tuning);
  const ctx = createContext(
    settings,
    measure,
    tuning,
    opts.hideChords ?? false,
  );

  const title = layoutTitle(ast, ctx, settings);
  const columns = layoutColumns(ast.blocks, settings.columns, ctx);

  // Content clears the title region: `offset` is {0, regionH+gap} for 'top' and
  // {band+gap, 0} for the 'left' spine — the direction is baked into `title.offset`.
  const offset = title.offset;

  // The page's white border (§4.11). `padding` is in em, so it is a base-unit
  // inset: every item shifts in by it and the content box grows by twice it on
  // each axis. Being inside the box is what keeps the render box exactly the
  // user's `aspectRatio` — padding never reshapes the page, it only pushes the
  // song away from its edges. Being in base units is what makes it scale with
  // the fit, so the border reads the same at any scale.
  //
  // A song with nothing in it stays a ZERO box rather than a box of pure
  // padding: padding is a border around content, and there is no content.
  const bareW = Math.max(title.width, offset.x + columns.width);
  const bareH = Math.max(title.height, offset.y + columns.height);
  const isEmpty = bareW <= 0 || bareH <= 0;
  const pad = isEmpty
    ? 0
    : Math.max(0, Number(settings.padding) || 0) * tuning.baseSizePx;

  const items: TextItem[] = [
    ...title.items,
    ...columns.items.map((it) => ({
      ...it,
      x: it.x + offset.x,
      y: it.y + offset.y,
    })),
  ].map((it) => ({ ...it, x: it.x + pad, y: it.y + pad }));

  const contentW = bareW + pad * 2;
  const contentH = bareH + pad * 2;

  const ratio = parseAspectRatio(settings.aspectRatio);
  const { alignX, alignY } = resolveAlign(settings, opts.align);
  const { box, fit, origin } = fitContent(
    contentW,
    contentH,
    ratio,
    settings.scale,
    tuning.minBoxEm * tuning.baseSizePx,
    alignX,
    alignY,
  );

  return {
    box,
    fit,
    origin,
    items,
    styles: ctx.styles,
    fonts: config.fonts
      ? buildFontBook(ctx.styles, config.fonts)
      : EMPTY_FONT_BOOK,
  };
}

/** A bound `layout` — measurer + platform config applied once (§5 portability). */
export type Layout = (
  ast: SongAst,
  settings: GlobalSettings,
  opts?: RenderOpts,
) => RenderPlan;

/**
 * Bind the platform measurer + config once; returns the per-render `layout`.
 * The framework-neutral surface (the Angular `RenderService` wraps this).
 */
export function createLayout(
  measure: TextMeasurer,
  config: LayoutConfig = {},
): Layout {
  return (ast, settings, opts) =>
    layoutCore(ast, settings, measure, opts, config);
}
