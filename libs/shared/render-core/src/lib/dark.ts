// Dark-page ink — the colour arithmetic behind performing in the dark
// Spec: PRD-RENDERING §4.10 (chord colour is the user's); PRD-UI-SHELL.md §6
// (the render is a document — see the note in `tuning.ts` on why the dark page
// is a viewer option and not a theme).
//
// A dark page is not an inverted page. Inverting flips hues — a red chord comes
// back cyan — and it would flip any image the renderer ever draws. What a dark
// page actually needs is the same INK, re-lit: the hue and the saturation the
// author chose, at whatever lightness that hue needs to be read off black.
//
// That is exactly the move `_tokens.scss` already makes for the brand colour
// ("#C13515 is 5.6:1 on white but only 3.8:1 on black; at l=55% it reaches
// 5.7:1. Lightness only — hue and saturation are the brand"). This file is that
// rule, written once, for the one ink the renderer does not own: `chordColor`.
//
// No `@angular/*`, no DOM, no CSS: `render-core` is pure geometry and pure
// arithmetic, and it stays portable (PRD-RENDERING §1).

interface Rgb {
  /** 0..1 */
  r: number;
  g: number;
  b: number;
}

interface Hsl {
  /** 0..360 */
  h: number;
  /** 0..1 */
  s: number;
  /** 0..1 */
  l: number;
}

/** How many halvings the lift search takes. 2^-24 of a lightness unit is far
 * finer than the 1/255 the result is quantised to anyway. */
const SEARCH_STEPS = 24;

/**
 * `#rgb` or `#rrggbb` → channels, or `null` for anything else.
 *
 * Returning `null` rather than throwing is deliberate: `chordColor` is a stored
 * user value and a hand-edited record can hold anything. A song must still
 * render — a colour we cannot read is one we leave alone (see `liftInkForPaper`).
 */
export function parseHexColor(hex: string): Rgb | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const digits = m[1];
  const full =
    digits.length === 3
      ? digits
          .split('')
          .map((d) => d + d)
          .join('')
      : digits;
  return {
    r: parseInt(full.slice(0, 2), 16) / 255,
    g: parseInt(full.slice(2, 4), 16) / 255,
    b: parseInt(full.slice(4, 6), 16) / 255,
  };
}

function toHex({ r, g, b }: Rgb): string {
  const channel = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return { h: h < 0 ? h + 360 : h, s, l };
}

function hslToRgb({ h, s, l }: Hsl): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    hp < 1
      ? [c, x, 0]
      : hp < 2
        ? [x, c, 0]
        : hp < 3
          ? [0, c, x]
          : hp < 4
            ? [0, x, c]
            : hp < 5
              ? [x, 0, c]
              : [c, 0, x];
  return { r: r + m, g: g + m, b: b + m };
}

/** The sRGB transfer function, undone — WCAG 2.x, and what luminance needs. */
function toLinear(channel: number): number {
  return channel <= 0.03928
    ? channel / 12.92
    : Math.pow((channel + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance, 0 (black) … 1 (white). */
export function relativeLuminance(rgb: Rgb): number {
  return (
    0.2126 * toLinear(rgb.r) +
    0.7152 * toLinear(rgb.g) +
    0.0722 * toLinear(rgb.b)
  );
}

/** WCAG contrast ratio, 1 (identical) … 21 (black on white). Order-free. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The user's ink, made legible on `paper` — and otherwise untouched.
 *
 * **Hue and saturation are never changed.** A performer who set their chords to
 * a deep red has to still recognise them as *their* red on the dark page; the
 * only thing this is allowed to move is how bright that red is. Nor is the ink
 * ever moved further than it must be: if it already clears `minRatio` against
 * the paper, it comes back byte-identical. This is a floor, not a restyling.
 *
 * `minRatio` defaults to nothing here on purpose — the caller names it, because
 * the number is a policy (see `RenderTuning.dark.minChordContrast`) and policy
 * belongs in tuning.
 *
 * The direction of the lift is derived rather than assumed, so the same
 * function serves a black page and a white one: whichever of pure black or pure
 * white contrasts more with the paper is the end the search walks toward. Since
 * luminance rises monotonically with HSL lightness at a fixed hue/saturation, a
 * bisection finds the *smallest* move that clears the floor.
 *
 * A colour that cannot reach the floor at all (a mid grey on a mid-grey page)
 * comes back at the extreme — the most legible thing available. Failing a
 * render over a contrast target would be the wrong trade: an unreadable chord
 * is a bad page, a missing page is no page.
 */
export function liftInkForPaper(
  ink: string,
  paper: string,
  minRatio: number,
): string {
  const inkRgb = parseHexColor(ink);
  const paperRgb = parseHexColor(paper);
  // Not a colour we can reason about (a `var(--x)`, an `rgb()`, a typo). Leave
  // it exactly as written rather than guessing.
  if (!inkRgb || !paperRgb) return ink;
  if (contrastRatio(inkRgb, paperRgb) >= minRatio) return ink;

  const { h, s, l } = rgbToHsl(inkRgb);
  const towardsWhite =
    contrastRatio({ r: 1, g: 1, b: 1 }, paperRgb) >=
    contrastRatio({ r: 0, g: 0, b: 0 }, paperRgb);
  const target = towardsWhite ? 1 : 0;

  // The search runs on the **quantised** colour — the 8-bit hex that will
  // actually be written into the SVG — and not on the continuous one. Rounding
  // to the nearest byte moves the ink by up to half a step, which is enough to
  // land a hair under a floor the maths had just cleared. What ships is what
  // has to pass.
  const inkAt = (lightness: number) => toHex(hslToRgb({ h, s, l: lightness }));
  const clears = (hex: string) => {
    const parsed = parseHexColor(hex);
    return parsed !== null && contrastRatio(parsed, paperRgb) >= minRatio;
  };

  // The extreme is the best this hue can do. If even that falls short, take it.
  const extreme = inkAt(target);
  if (!clears(extreme)) return extreme;

  // Bisect between where the ink is and the extreme: `lo` always fails the
  // floor, `hi` always clears it, so the answer converges on the least change.
  let lo = l;
  let hi = target;
  for (let i = 0; i < SEARCH_STEPS; i++) {
    const mid = (lo + hi) / 2;
    if (clears(inkAt(mid))) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return inkAt(hi);
}
