// Generates the images that represent the project where its own CSS cannot
// reach — the README banner, the link-preview card search engines and chat
// clients read out of `og:image`, and the app screenshots the README shows.
//
//   node tools/gen-brand-images.mjs            # banner + social card
//   node tools/gen-brand-images.mjs --screens  # also the app screenshots
//
// The output is committed, like `apps/app/tools/gen-app-icons.mjs`'s is, for the
// same reason: a README on github.com and a crawler fetching `og:image` are both
// outside any build we run, so the bytes have to exist in the repository.
//
// The two cards are drawn from the markup below rather than from a binary
// somebody exported once — the wordmark, the brand red and the chord-over-lyric
// motif all live here in text, so changing the tagline is an edit and a rerun,
// not a trip through a design tool. The mark itself is the same rectangle
// geometry as `gen-app-icons.mjs` draws, at the same proportions.
//
// The screenshots need the app actually running (`pnpm dev:app`) because the
// point of them is the real thing: the real renderer, the real seeded library.

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../apps/docs/static/img');
const FONTS = resolve(here, '../apps/app/public/fonts');

/** Brand red — `--brand` at its light-theme lightness (app styles/_tokens.scss). */
const BRAND = '#c13515';
/** The card ground. Dark on purpose: a README banner is shown on a white page and
 *  a black one, and only a card that brings its own background survives both. */
const GROUND = '#16161a';

/** Where the app is while `--screens` runs. Its own baseHref, not the origin. */
const APP = process.env.APP_URL || 'http://localhost:4200/app/';

/** The mark, on the same 512 grid as `gen-app-icons.mjs`: chords over lyrics, twice. */
const MARK = `<svg class="mark" viewBox="0 0 512 512">
  <rect x="112" y="128" width="56" height="24" rx="12" />
  <rect x="232" y="128" width="88" height="24" rx="12" />
  <rect x="112" y="200" width="288" height="24" rx="12" opacity="0.55" />
  <rect x="112" y="264" width="56" height="24" rx="12" />
  <rect x="272" y="264" width="56" height="24" rx="12" />
  <rect x="112" y="336" width="224" height="24" rx="12" opacity="0.55" />
</svg>`;

/**
 * A few lines of a real song, spelled the way the app renders them: the chord
 * sits above the letter it changes on. Written as literal spaces in a monospace
 * face, which is the whole trick the app is about — so the card is a small,
 * honest sample of the output rather than a drawing of one.
 */
const sheet = (lines) =>
  `<div class="sheet">${lines
    .map(
      ([chords, words]) =>
        `<span class="chords">${chords}</span><span class="row">${words}</span>`,
    )
    .join('')}</div>`;

const AMAZING = [
  [
    '        G       G7          C         G',
    'Amazing grace, how sweet the sound',
  ],
  ['      G      Em         D', 'that saved a wretch like me.'],
  ['    G       G7      C     G', 'I once was lost, but now am found,'],
  ['    Em          D7    G', 'was blind, but now I see.'],
];

const html = `<!doctype html><meta charset="utf-8"><style>
@font-face { font-family: RM; font-weight: 400; src: url('${pathToFileURL(resolve(FONTS, 'RobotoMono-Regular.ttf')).href}'); }
@font-face { font-family: RM; font-weight: 700; src: url('${pathToFileURL(resolve(FONTS, 'RobotoMono-Bold.ttf')).href}'); }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: RM, monospace; background: #333; }
.card { background: ${GROUND}; color: #fff; overflow: hidden; display: flex; }
.mark { border-radius: 18.75%; background: ${BRAND}; flex: none; }
.mark rect { fill: #fff; }
.wordmark { font-weight: 700; letter-spacing: -0.03em; line-height: 1; }
.tagline { color: #9b9ba4; line-height: 1.5; }
.url { color: ${BRAND}; font-weight: 700; }
.sheet { color: #e8e8ec; white-space: pre; line-height: 1.15; }
.sheet .row { display: block; }
.sheet .chords { display: block; font-size: 0.62em; height: 1.1em; color: #e8543a; font-weight: 700; }

#banner { width: 1280px; height: 360px; align-items: center; padding: 0 64px; gap: 40px; }
#banner .mark { width: 108px; height: 108px; }
#banner .left { display: flex; flex-direction: column; justify-content: center; gap: 22px; }
#banner .wordmark { font-size: 68px; }
#banner .tagline { font-size: 19px; }
/* Faded into the ground rather than cut off square: the sheet is a texture here,
   and a hard edge would read as a screenshot that did not fit. */
#banner .sheet { font-size: 21px; margin-left: auto; opacity: 0.9;
  mask-image: linear-gradient(90deg, transparent, #000 22%, #000 100%); }

#social { width: 1200px; height: 630px; margin-top: 40px; flex-direction: column;
  justify-content: center; padding: 0 80px; gap: 34px; }
#social .head { display: flex; align-items: center; gap: 32px; }
#social .mark { width: 116px; height: 116px; }
#social .wordmark { font-size: 82px; }
#social .tagline { font-size: 27px; max-width: 20em; }
#social .sheet { font-size: 22px; opacity: 0.85; }
#social .url { font-size: 24px; }
</style>

<div class="card" id="banner">
  ${MARK}
  <div class="left">
    <div class="wordmark">Achordeon</div>
    <div class="tagline">Write, arrange and perform your songs — chords and all.</div>
  </div>
  ${sheet(AMAZING)}
</div>

<div class="card" id="social">
  <div class="head">${MARK}<div class="wordmark">Achordeon</div></div>
  <div class="tagline">Write songs with the chords where you play them. Bind them
    into songbooks, perform them offline, share the screen with your audience.</div>
  ${sheet(AMAZING.slice(0, 2))}
  <div class="url">achordeon.eu</div>
</div>`;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  // A file on disk, not `setContent`: the @font-face URLs are absolute file://
  // URLs, and a page served from `about:blank` is not allowed to read them.
  const tmp = resolve(here, '.brand-images.html');
  writeFileSync(tmp, html);
  try {
    const page = await browser.newPage({ deviceScaleFactor: 2 });
    await page.goto(pathToFileURL(tmp).href, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    for (const [id, name] of [
      ['banner', 'banner.png'],
      ['social', 'social-card.png'],
    ]) {
      await page.locator(`#${id}`).screenshot({ path: resolve(OUT, name) });
      console.log('wrote', name);
    }
    await page.close();
  } finally {
    rmSync(tmp, { force: true });
  }

  if (process.argv.includes('--screens')) {
    // A fresh context seeds the starter library by default (see the app's seed
    // logic), so these are the six songs a first-time visitor also sees.
    const page = await browser.newPage({
      viewport: { width: 1440, height: 810 },
      deviceScaleFactor: 2,
      colorScheme: 'light',
    });
    const go = async (route) => {
      await page.goto(new URL(route, APP).href, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);
    };
    const pick = () => page.getByText('Amazing Grace', { exact: true }).first();

    await go('songs');
    await pick().click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: resolve(OUT, 'screenshot-songs.png') });
    console.log('wrote screenshot-songs.png');

    await pick().dblclick();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: resolve(OUT, 'screenshot-editor.png') });
    console.log('wrote screenshot-editor.png');
    await page.close();
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
