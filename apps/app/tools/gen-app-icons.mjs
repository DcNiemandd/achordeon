// Generates the PWA install icons in `public/icons` — Epic 11 ▸ PWA.
//
// Run it when the mark changes: `node tools/gen-app-icons.mjs` (from apps/app).
// The output is committed, because it is a static asset the manifest and the
// ngsw precache both name, and a build step that only ever produces the same
// bytes is a build step nobody should pay for.
//
// **This file is the single source of the mark**, not the SVG next to it: the SVG
// is emitted from the same description as the PNGs, so the vector and the raster
// cannot drift. Everything is drawn from rectangles and one corner radius, which
// is why a ~60-line rasteriser is enough and no image library is needed.
//
// The mark is a placeholder: chords over lyric lines, in the brand red. It says
// what the app is; it is not a designed logo.

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../public/icons');

/** Brand red — `--brand` at its light-theme lightness (styles/_tokens.scss). */
const BRAND = [0xc1, 0x35, 0x15];
const INK = [0xff, 0xff, 0xff];

/** The mark on a 512 grid: chord row, lyric row, twice. `dim` rows are lyrics. */
const BARS = [
  { x: 112, y: 128, w: 56, h: 24 },
  { x: 232, y: 128, w: 88, h: 24 },
  { x: 112, y: 200, w: 288, h: 24, dim: true },
  { x: 112, y: 264, w: 56, h: 24 },
  { x: 272, y: 264, w: 56, h: 24 },
  { x: 112, y: 336, w: 224, h: 24, dim: true },
];

/**
 * The same mark, cut for a 16px tab strip: two chords over one lyric line, at
 * roughly three times the stroke weight. Six thin rows at that size are a smudge,
 * and a favicon's only job is to be recognised at a glance.
 */
const FAVICON_BARS = [
  { x: 112, y: 144, w: 112, h: 88 },
  { x: 272, y: 144, w: 128, h: 88 },
  { x: 112, y: 296, w: 288, h: 88 },
];

/** Corner radius of the plate, on the same 512 grid. `0` is a full-bleed square. */
const PLATE_RADIUS = 96;

/** A maskable icon is cropped to a circle by the platform, so the mark has to sit
 * inside the middle 80% and the plate has to reach every edge (no rounding). */
const MASKABLE_INSET = 0.78;

function main() {
  mkdirSync(OUT, { recursive: true });

  writeFileSync(resolve(OUT, 'icon.svg'), svg({ radius: PLATE_RADIUS }));
  writeFileSync(
    resolve(OUT, 'icon-maskable.svg'),
    svg({ radius: 0, scale: MASKABLE_INSET }),
  );

  for (const size of [192, 512]) {
    writeFileSync(
      resolve(OUT, `icon-${size}.png`),
      png(size, { radius: PLATE_RADIUS }),
    );
  }
  writeFileSync(
    resolve(OUT, 'icon-maskable-512.png'),
    png(512, { radius: 0, scale: MASKABLE_INSET }),
  );
  // iOS ignores the manifest's icons for "Add to Home Screen" and reads
  // `apple-touch-icon` instead — and it composites onto its own rounded plate,
  // so this one is square-cornered too.
  writeFileSync(
    resolve(OUT, 'apple-touch-icon.png'),
    png(180, { radius: 0, scale: MASKABLE_INSET }),
  );

  // The favicon, from the same mark, at the root where `index.html` names it. At
  // 16px the two lyric rows collapse into a smudge, so the small sizes drop to a
  // bolder cut of the mark — legibility beats fidelity in a 16px tab strip.
  writeFileSync(
    resolve(OUT, '../favicon.ico'),
    ico(
      [16, 32, 48].map((size) => ({
        size,
        data: png(size, { radius: PLATE_RADIUS, bars: FAVICON_BARS }),
      })),
    ),
  );
  // A vector favicon for the browsers that prefer one (and for any future
  // dark-mode variant, which raster cannot express).
  writeFileSync(
    resolve(OUT, 'favicon.svg'),
    svg({ radius: PLATE_RADIUS, bars: FAVICON_BARS }),
  );
}

// --- SVG ---------------------------------------------------------------------

/** `scale` shrinks the mark about the centre without moving the plate. */
function svg({ radius, scale = 1, bars: source = BARS }) {
  const bars = source
    .map((bar) => {
      const b = scaled(bar, scale);
      const opacity = bar.dim ? ' opacity="0.55"' : '';
      return `    <rect x="${r(b.x)}" y="${r(b.y)}" width="${r(b.w)}" height="${r(b.h)}" rx="${r(b.h / 2)}"${opacity} />`;
    })
    .join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Achordeon">
  <title>Achordeon</title>
  <rect width="512" height="512"${radius ? ` rx="${radius}"` : ''} fill="#${hex(BRAND)}" />
  <g fill="#${hex(INK)}">
${bars}
  </g>
</svg>
`;
}

// --- PNG ---------------------------------------------------------------------

/** RGBA8 raster of the mark at `size`, PNG-encoded. */
function png(size, { radius, scale = 1, bars: source = BARS }) {
  const k = size / 512;
  const plateRadius = radius * k;
  const bars = source.map((bar) => {
    const b = scaled(bar, scale);
    return {
      x: b.x * k,
      y: b.y * k,
      w: b.w * k,
      h: b.h * k,
      alpha: bar.dim ? 0.55 : 1,
    };
  });

  // 4×4 supersampling. Every edge here is a rounded corner, and a hard-edged
  // corner at 192px reads as a mistake; averaging 16 samples per pixel is the
  // whole of the anti-aliasing story.
  const STEPS = 4;

  /** The opaque colour at a point, plus how much of the plate covers it. */
  function sample(px, py) {
    if (!insideRounded(px, py, size, plateRadius)) return null;
    for (const bar of bars) {
      if (insideRounded(px - bar.x, py - bar.y, bar.w, bar.h / 2, bar.h)) {
        // Ink over plate: a translucent lyric row composites against the brand
        // rather than punching a hole through the icon.
        return BRAND.map((plate, i) => mix(INK[i], plate, bar.alpha));
      }
    }
    return BRAND;
  }

  // One filter byte (0 = none) then RGBA per pixel, per scanline.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    let at = y * (size * 4 + 1) + 1;
    for (let x = 0; x < size; x++) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let covered = 0;
      for (let sy = 0; sy < STEPS; sy++) {
        for (let sx = 0; sx < STEPS; sx++) {
          const hit = sample(x + (sx + 0.5) / STEPS, y + (sy + 0.5) / STEPS);
          if (hit === null) continue;
          red += hit[0];
          green += hit[1];
          blue += hit[2];
          covered++;
        }
      }
      const samples = STEPS * STEPS;
      // Off the plate entirely: transparent, and the colour is irrelevant.
      raw[at++] = covered ? Math.round(red / covered) : 0;
      raw[at++] = covered ? Math.round(green / covered) : 0;
      raw[at++] = covered ? Math.round(blue / covered) : 0;
      raw[at++] = Math.round((covered / samples) * 255);
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr(size)),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Pack already-encoded PNGs into one `.ico`.
 *
 * An ICO directory may point at a PNG rather than a BMP (Vista onwards, and every
 * browser in use), which is why nothing here re-encodes anything: the container is
 * a 6-byte header, one 16-byte entry per image, then the images.
 */
function ico(images) {
  const HEADER = 6;
  const ENTRY = 16;
  const header = Buffer.alloc(HEADER);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(images.length, 4);

  let offset = HEADER + ENTRY * images.length;
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(ENTRY);
    entry[0] = size === 256 ? 0 : size; // 0 means 256 in a byte-wide field
    entry[1] = size === 256 ? 0 : size;
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

function ihdr(size) {
  const buf = Buffer.alloc(13);
  buf.writeUInt32BE(size, 0);
  buf.writeUInt32BE(size, 4);
  buf[8] = 8; // bit depth
  buf[9] = 6; // colour type: RGBA
  return buf;
}

function chunk(type, data) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([head, body, crc]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// --- geometry ----------------------------------------------------------------

/** Is (`x`,`y`) inside a `w`×`h` rounded rect at the origin? Square by default. */
function insideRounded(x, y, w, radius, h = w) {
  if (x < 0 || y < 0 || x > w || y > h) return false;
  if (radius <= 0) return true;
  const cx = Math.min(Math.max(x, radius), w - radius);
  const cy = Math.min(Math.max(y, radius), h - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

/** Shrink a bar about the 512 grid's centre. */
function scaled(bar, scale) {
  const c = 256;
  return {
    x: c + (bar.x - c) * scale,
    y: c + (bar.y - c) * scale,
    w: bar.w * scale,
    h: bar.h * scale,
  };
}

const mix = (ink, plate, alpha) =>
  Math.round(ink * alpha + plate * (1 - alpha));
const hex = ([r0, g0, b0]) =>
  [r0, g0, b0].map((v) => v.toString(16).padStart(2, '0')).join('');
const r = (n) => Math.round(n * 100) / 100;

main();
