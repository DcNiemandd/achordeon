// Cut the bundled faces down to the alphabets a songbook can set — ADR-0018
//
// Roughly half of every file the app ships is Cyrillic, Greek and Vietnamese.
// Roboto Mono — the body face, prefetched by the service worker, the one file
// every install pays for before it can show anything — is 51% alphabets this
// app has no interface language for. Hosting is GitHub Pages, which will not
// gzip a TTF and offers no `_headers` file to make it, so the 439 kB of
// prefetched faces arrive uncompressed and outweigh the entire application
// bundle on the wire by about six to one. Cutting them is the only lever there
// is.
//
// Run by hand, output committed, **in place**. Like `gen-font-index.mjs` this
// is a decision rather than a build step: it is lossy, and a build that quietly
// deleted glyphs would be one. The originals are two places away — this repo's
// own git history, and `google/fonts` — so nothing here is unrecoverable, but
// re-cutting with different ranges means restoring them first, because
// subsetting a subset can only ever take more away.
//
//   node apps/app/tools/subset-fonts.mjs
//
// harfbuzz (as wasm, via `subset-font`) rather than fontTools: it is the engine
// Google Fonts itself serves subsets with, and it keeps this a Node workspace
// with one toolchain instead of two.

import subsetFont from 'subset-font';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FONTS = join(dirname(fileURLToPath(import.meta.url)), '../public/fonts');

/**
 * What stays.
 *
 * `0000-024F` is ASCII, Latin-1, Latin Extended-A and Latin Extended-B, which
 * is where every Czech letter lives, and every other Latin-alphabet language
 * this app could plausibly grow an interface for. `0300-036F` is the combining
 * marks: precomposed `ě` is the one that gets typed, but a font is free to build
 * it as a composite and mark positioning needs the components to still exist.
 *
 * `2000-2BFF` is punctuation and symbols, kept whole rather than picked over
 * because the entire span is only 51-67 codepoints in any of these files —
 * while losing one curly quote, one ellipsis or one en dash would be a visible
 * regression in ordinary lyrics.
 */
const KEEP = [
  [0x0000, 0x024f],
  [0x0300, 0x036f],
  [0x2000, 0x2bff],
];

/**
 * The name records that have to survive.
 *
 * harfbuzz keeps 0-6 by default, which stops one short of the two the OFL cares
 * about: 13 is the licence text and 14 is the URL it points at. Neither is
 * large and both are required to travel with the bytes.
 */
const LICENCE_NAME_IDS = [13, 14];

/** Czech is the app's other language, and it is what this can silently break. */
const MUST_MAP = 'ěščřžýáíéúůďťňóĚŠČŘŽÝÁÍÉÚŮĎŤŇÓ‘’“”…–—';

/** Every codepoint to retain, as the string harfbuzz wants. */
const wanted = KEEP.flatMap(([from, to]) => {
  const chars = [];
  for (let cp = from; cp <= to; cp++) chars.push(String.fromCodePoint(cp));
  return chars;
}).join('');

/** Every codepoint a font maps, from its best unicode `cmap` subtable. */
function codepoints(buffer) {
  const count = buffer.readUInt16BE(4);
  let cmap = 0;
  for (let i = 0; i < count; i++) {
    const entry = 12 + i * 16;
    if (buffer.toString('latin1', entry, entry + 4) === 'cmap') {
      cmap = buffer.readUInt32BE(entry + 8);
    }
  }
  if (!cmap) return new Set();

  const subtables = buffer.readUInt16BE(cmap + 2);
  let best = null;
  for (let i = 0; i < subtables; i++) {
    const record = cmap + 4 + i * 8;
    const platform = buffer.readUInt16BE(record);
    const encoding = buffer.readUInt16BE(record + 2);
    const offset = cmap + buffer.readUInt32BE(record + 4);
    const format = buffer.readUInt16BE(offset);
    const isUnicode =
      platform === 3 ? encoding === 1 || encoding === 10 : platform === 0;
    if (!isUnicode) continue;
    // Format 12 wins where both are present: it is the one that reaches past
    // the BMP, and a font that has it has it for a reason.
    if (format === 12) best = { offset, format };
    else if (format === 4 && !best) best = { offset, format };
  }
  if (!best) return new Set();

  const mapped = new Set();
  if (best.format === 12) {
    const groups = buffer.readUInt32BE(best.offset + 12);
    for (let i = 0; i < groups; i++) {
      const group = best.offset + 16 + i * 12;
      const start = buffer.readUInt32BE(group);
      const end = buffer.readUInt32BE(group + 4);
      for (let cp = start; cp <= end; cp++) mapped.add(cp);
    }
  } else {
    const segments = buffer.readUInt16BE(best.offset + 6) / 2;
    const ends = best.offset + 14;
    const starts = ends + segments * 2 + 2;
    for (let s = 0; s < segments; s++) {
      const end = buffer.readUInt16BE(ends + s * 2);
      const start = buffer.readUInt16BE(starts + s * 2);
      if (start === 0xffff) continue;
      for (let cp = start; cp <= end; cp++) mapped.add(cp);
    }
  }
  return mapped;
}

/**
 * Read the bytes back and check the letters, rather than trusting the request.
 *
 * A retained set is a request; what a font ends up mapping is whatever it had in
 * that range to begin with, minus whatever the subsetter decided. The failure
 * this guards against is silent until someone prints a PDF, which is far too
 * late to notice.
 */
function verify(file, bytes) {
  const mapped = codepoints(bytes);
  const lost = [...MUST_MAP].filter((char) => !mapped.has(char.codePointAt(0)));
  if (lost.length > 0) {
    throw new Error(`${file} no longer maps ${lost.join(' ')}`);
  }
  return mapped.size;
}

const files = readdirSync(FONTS).filter((file) => file.endsWith('.ttf'));
let before = 0;
let after = 0;

for (const file of files) {
  const path = join(FONTS, file);
  const original = readFileSync(path);
  const subset = await subsetFont(original, wanted, {
    targetFormat: 'truetype',
    preserveNameIds: LICENCE_NAME_IDS,
  });

  const mapped = verify(file, subset);
  writeFileSync(path, subset);

  before += original.length;
  after += statSync(path).size;
  console.log(
    `${file.padEnd(26)} ${kb(original.length).padStart(6)} → ${kb(subset.length).padStart(6)}  ${mapped} codepoints`,
  );
}

console.log(`\n${files.length} files: ${kb(before)} → ${kb(after)}`);

function kb(bytes) {
  return `${Math.round(bytes / 1024)} kB`;
}
