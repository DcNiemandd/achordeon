// Page geometry — Epic 7 ▸ subtasks 4 and 6
// Spec: PRD-INFRASTRUCTURE.md §8 ("songs keep aspect ratio, scaled to fit"),
// PRD-RENDERING §4.1 (the render box's shape is the user's, always).
//
// Pure arithmetic, because it is the part of the download that has a right and a
// wrong answer. Everything around it — canvas, jsPDF, zip — is a device.
//
// Units are PostScript points (1/72"), which is what jsPDF measures in.

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Rect extends Size {
  readonly x: number;
  readonly y: number;
}

/** 1 mm in points, for margins — the one unit a person can picture. */
export const MM = 72 / 25.4;

/** The named page sizes the songbook PDF offers, portrait. */
export const PAGE_SIZES = {
  A4: { width: 210 * MM, height: 297 * MM },
  Letter: { width: 8.5 * 72, height: 11 * 72 },
  A5: { width: 148 * MM, height: 210 * MM },
} as const satisfies Record<string, Size>;

export type PageSizeName = keyof typeof PAGE_SIZES;

/** A page in the asked-for orientation. Landscape is the same paper turned. */
export function orient(size: Size, isLandscape = false): Size {
  return isLandscape
    ? { width: size.height, height: size.width }
    : { width: size.width, height: size.height };
}

/**
 * The page a **single song** prints on: its own shape, at a sane physical size.
 *
 * The song's aspect ratio is user-owned (§4.1) and a download must not quietly
 * re-crop it, so the page *is* the render box. What the box does not carry is a
 * size — it is in base units, medium-independent by design — so the short side
 * is pinned to A4's short side. An A4-shaped song therefore comes out as exactly
 * A4, which is the one case a user can check against a ruler.
 */
export function pageForBox(box: Size, shortSide = PAGE_SIZES.A4.width): Size {
  if (box.width <= 0 || box.height <= 0) return { ...PAGE_SIZES.A4 };
  const ratio = box.width / box.height;
  return ratio <= 1
    ? { width: shortSide, height: shortSide / ratio }
    : { width: shortSide * ratio, height: shortSide };
}

/**
 * `content` centred inside `page`, scaled to fit, aspect preserved.
 *
 * The songbook case: every song keeps its own shape and is scaled into the slot
 * the page leaves it (§8). Centred rather than hugged to a corner — the page
 * margin is symmetric, and a song that is wider than it is tall would otherwise
 * sit with all its slack at the bottom.
 */
export function fitInto(content: Size, page: Size, margin = 0): Rect {
  const slotW = Math.max(page.width - margin * 2, 0);
  const slotH = Math.max(page.height - margin * 2, 0);
  if (content.width <= 0 || content.height <= 0 || slotW === 0 || slotH === 0) {
    return { x: margin, y: margin, width: slotW, height: slotH };
  }
  const scale = Math.min(slotW / content.width, slotH / content.height);
  const width = content.width * scale;
  const height = content.height * scale;
  return {
    x: margin + (slotW - width) / 2,
    y: margin + (slotH - height) / 2,
    width,
    height,
  };
}
