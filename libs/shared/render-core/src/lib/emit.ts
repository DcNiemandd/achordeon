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

import {
  faceOf,
  type RenderPlan,
  type TextItem,
  type EmbeddedFont,
} from './render-plan';

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
  // A markdown run overrides the role's weight/style, which normally picks
  // another face of the SAME family — unless the family has not got it, in which
  // case `faceOf` names the family lending it (§4.10 donor).
  const weight = item.weight ?? style.weight;
  const fontStyle = item.style ?? style.style;
  const face = faceOf(style, weight, fontStyle ?? 'normal');
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
    `font-family="${familyAttr(face.family, face.fallback)}"`,
    `font-size="${size}"`,
    `font-weight="${weight}"`,
    `fill="${style.fill}"`,
  ];
  if (fontStyle && fontStyle !== 'normal')
    attrs.push(`font-style="${fontStyle}"`);
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
  // Outside the `<g>`, and deliberately: the ground is the *box*, not the
  // content, so the fit transform must not touch it. Emitted only when the plan
  // names one — a light render stays transparent, byte for byte as before.
  const paper = plan.paper
    ? `<rect x="0" y="0" width="${width}" height="${height}" fill="${plan.paper}"/>`
    : '';
  const body = plan.items.map((it) => emitItem(it, plan)).join('');
  const group = `<g transform="translate(${plan.origin.x} ${plan.origin.y}) scale(${plan.fit})">${body}</g>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" ` +
    `width="${width}" height="${height}">${defs}${paper}${group}</svg>`
  );
}

/**
 * The same drawing, a quarter turn counter-clockwise — a landscape song laid
 * sideways on a portrait sheet (ADR-0013).
 *
 * **A wrapper, not a re-render.** Nothing is laid out again: the emitted
 * document is nested whole inside a new one whose axes are swapped, so the
 * turned sheet is the same glyphs in the same places, seen from the side. That
 * is what keeps this a *placement* decision rather than a render setting — there
 * is no second layout that could disagree with the first.
 *
 * The turn matches the CCW title spine (`rotate: -90` in `title-layout.ts`), so
 * the two sideways things Achordeon draws are read with the same tilt of the
 * head. `translate` runs before `rotate` here because SVG applies a transform
 * list outermost-first: rotating `[0,w]×[0,h]` about the origin lands it in
 * `[0,h]×[-w,0]`, and the translate lifts it back into view.
 */
export function turnedSvg(
  svg: string,
  box: { width: number; height: number },
): string {
  const { width, height } = box;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${height} ${width}" ` +
    `width="${height}" height="${width}">` +
    `<g transform="translate(0 ${width}) rotate(-90)">${svg}</g></svg>`
  );
}
