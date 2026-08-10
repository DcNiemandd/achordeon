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
  // Default centre when a stored settings bag predates these keys (§4.1).
  return {
    alignX: (settings.contentX as AlignX) ?? 'center',
    alignY: (settings.contentY as AlignY) ?? 'middle',
  };
}

/**
 * The tuning this one render draws with — **the seam between the two registries**.
 *
 * `RenderTuning` is the renderer author's control surface and `SETTINGS` is the
 * user's, and they are deliberately separate things (see `tuning.ts`). A handful
 * of magnitudes belong to both: the author picks the number the app ships with,
 * and the user is allowed to move it. This is where the second happens, and it is
 * the ONLY place — every layout pass goes on reading `ctx.tuning`, so promoting a
 * knob is a row in the registry and a line here, never a change to the geometry.
 *
 * Three layers, least specific first:
 *
 * 1. `DEFAULT_TUNING` — the author's constants (applied by `resolveTuning`).
 * 2. the **settings** below — already cascaded Global → Songbook → Song by
 *    `resolveSettings`, so by the time they arrive there is one value per key.
 * 3. `config.tuning` — the dev's A/B override, and it wins. It exists precisely to
 *    pin a magnitude while a change of taste is being judged, and an experiment
 *    a stored setting could silently overrule would not be one. Nothing in the
 *    app passes it; `RenderService` binds only the fonts.
 */
function tuningFor(
  settings: GlobalSettings,
  dev?: DeepPartial<RenderTuning>,
): RenderTuning {
  return resolveTuning({
    ...dev,
    spacing: { ...spacingFromSettings(settings), ...dev?.spacing },
  });
}

/** The spacing magnitudes that are settings rather than constants (§4.7). */
function spacingFromSettings(
  settings: GlobalSettings,
): DeepPartial<RenderTuning['spacing']> {
  const blockGap = Number(settings.blockGap);
  // A value the form could not have produced — a hand-written import, a bag from
  // an app that spells this key differently — is not a reason to draw a broken
  // page. Naming no field at all is how it falls back to the author's constant.
  return Number.isFinite(blockGap) && blockGap >= 0
    ? { interBlockGapFactor: blockGap }
    : {};
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
  const tuning = tuningFor(settings, config.tuning);
  const isDark = opts.dark ?? false;
  const ctx = createContext(
    settings,
    measure,
    tuning,
    opts.hideChords ?? false,
    isDark,
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
      ? buildFontBook(ctx.styles, config.fonts, items)
      : EMPTY_FONT_BOOK,
    // Only a dark page carries its own ground; a light one leaves the paper to
    // the medium it lands on (see `RenderPlan.paper`).
    ...(isDark ? { paper: tuning.dark.paper } : {}),
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
