// emit — Epic 3 ▸ subtask 8 (RenderPlan → SVG)
// Spec: PRD-RENDERING §1 (dumb serializer, calls `measure` NEVER), §2 (screen vs
// export SVG differ only by `inlineFonts`), §4.10 (font embedded both ways),
// §5 (one transform applies the fit).
//
// A flat walk over `RenderPlan.items`: no layout decisions, no measuring. All
// items are base-unit coords wrapped in one `<g translate(origin) scale(fit)>`,
// so the emitter is scale-agnostic. `inlineFonts` base64-inlines the `@font-face`
// bytes (export/PNG, self-contained per §2); omitted, the SVG relies on a
// CSS-loaded face + the generic fallback (screen).

import type { RenderPlan, TextItem, EmbeddedFont } from './render-plan';

export interface EmitOpts {
  /** Base64-inline the embedded fonts as `@font-face` (export). Default false (screen). */
  inlineFonts?: boolean;
}

const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => XML_ESCAPES[c]);
}

/** `@font-face` block for each embedded face carrying bytes (§4.10). */
function fontFaceCss(fonts: EmbeddedFont[]): string {
  return fonts
    .filter((f) => f.base64)
    .map(
      (f) =>
        `@font-face{font-family:'${f.family}';font-weight:${f.weight};font-style:${f.style};` +
        `src:url(data:font/ttf;base64,${f.base64}) format('truetype');}`,
    )
    .join('');
}

function familyAttr(family: string, fallback?: string): string {
  const quoted = `'${family}'`;
  return fallback ? `${quoted}, ${fallback}` : quoted;
}

function emitItem(item: TextItem, plan: RenderPlan): string {
  const style = plan.styles[item.role];
  const size = style.sizePx * (item.sizeScale ?? 1);
  const attrs = [
    `x="${item.x}"`,
    `y="${item.y}"`,
    // SVG's default is `xml:space="default"`, which STRIPS leading and trailing
    // whitespace and collapses runs of it to one space. That silently broke the
    // signature behaviour: `layout` measures chord x against the real string —
    // spaces and all, because `measureText` counts them — and then the browser
    // drew a shorter string. A lyric indented to sit under a chord lost its
    // indent and every chord on that line pointed at the wrong character.
    // Preserving is not a style choice here; the geometry was computed for the
    // untouched text, so the untouched text is what has to be drawn.
    `xml:space="preserve"`,
    `font-family="${familyAttr(style.family, style.fallback)}"`,
    `font-size="${size}"`,
    `font-weight="${style.weight}"`,
    `fill="${style.fill}"`,
  ];
  if (style.style && style.style !== 'normal')
    attrs.push(`font-style="${style.style}"`);
  // CCW spine: rotate about the item's own anchor (§4.5).
  if (item.rotate)
    attrs.push(`transform="rotate(${item.rotate} ${item.x} ${item.y})"`);
  return `<text ${attrs.join(' ')}>${escapeXml(item.text)}</text>`;
}

/**
 * Serialize a `RenderPlan` to a self-contained SVG string. The `<g>` applies the
 * uniform fit once (§5); every item writes raw base-unit `x/y`.
 */
export function emit(plan: RenderPlan, opts: EmitOpts = {}): string {
  const { width, height } = plan.box;
  const defs = opts.inlineFonts
    ? `<defs><style>${fontFaceCss(plan.fonts)}</style></defs>`
    : '';
  const body = plan.items.map((it) => emitItem(it, plan)).join('');
  const group = `<g transform="translate(${plan.origin.x} ${plan.origin.y}) scale(${plan.fit})">${body}</g>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" ` +
    `width="${width}" height="${height}">${defs}${group}</svg>`
  );
}
