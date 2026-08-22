// Screenshot harness — the shared machinery every shot runs through.
//
// A "shot" (see `manifest.ts`) says WHAT to picture; this file is HOW: seed the
// library, force a language and the light theme, wait for the app to settle,
// then either screenshot the page or capture the PNG the app itself downloads.
//
// Nothing here touches the docs `.mdx` — a run only writes image files into
// `apps/docs/static/img/` (English) and `apps/docs/static/img/cs/` (Czech).

import { type Browser, type Download, type Page } from '@playwright/test';
import { workspaceRoot } from '@nx/devkit';
import { mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

export type Locale = 'en' | 'cs';

export interface Viewport {
  readonly width: number;
  readonly height: number;
}

/** The page size and density a shot gets unless it asks for its own. */
export const DEFAULT_VIEWPORT: Viewport = { width: 1440, height: 900 };
export const DEFAULT_SCALE = 2;

/** Where the PNGs land — English at the root, Czech in its own subfolder. */
const IMG_DIR = join(workspaceRoot, 'apps', 'docs', 'static', 'img');

/**
 * The file a shot named `name` writes for `locale`.
 *
 * English keeps the bare `screenshot-<name>.png` the docs already expect; Czech
 * gets the same file name under `img/cs/`, so one `<Image src>` swap per locale
 * is all the wiring a shot needs later.
 */
export function outputPath(name: string, locale: Locale): string {
  const dir = locale === 'cs' ? join(IMG_DIR, 'cs') : IMG_DIR;
  mkdirSync(dir, { recursive: true });
  return join(dir, `screenshot-${name}.png`);
}

/**
 * A fresh context in `locale`, light-themed, with the OS save picker removed so
 * export shots produce a real `download` event (the picker is native UI
 * Playwright cannot drive — see `transfer.spec.ts`).
 *
 * Language and theme are localStorage the app reads BEFORE it paints
 * (`achordeon.language`, `achordeon.theme`), so they must be in place for the
 * very first load — hence `storageState` rather than a post-load switch, which
 * runtime `$localize` could not honour without a reload anyway.
 */
export async function contextFor(
  browser: Browser,
  locale: Locale,
  viewport: Viewport,
  deviceScaleFactor: number,
  baseURL: string,
): Promise<Page> {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor,
    baseURL,
    storageState: {
      cookies: [],
      origins: [
        {
          origin: new URL(baseURL).origin,
          localStorage: [
            { name: 'achordeon.language', value: locale },
            { name: 'achordeon.theme', value: 'light' },
          ],
        },
      ],
    },
  });
  await context.addInitScript(() => {
    // @ts-expect-error dropping an optional platform API so downloads fire
    delete window.showSaveFilePicker;
  });
  return context.newPage();
}

/**
 * Boot `route` with the starter library.
 *
 * A fresh context defaults to seeding on, but the workspace's Playwright config
 * turns it off; clearing that key and reloading is the proven opt-back-in (see
 * `starter-library.ts`). The language/theme localStorage survives the reload.
 */
export async function seededGoto(page: Page, route: string): Promise<void> {
  await page.goto(route);
  await page.evaluate(() => localStorage.removeItem('achordeon.seed'));
  await page.reload();
}

/** The `data-song-id` of the first row of `testid`, matching `predicate`. */
export async function firstRowId(
  page: Page,
  testid: string,
  predicate: (id: string) => boolean = () => true,
): Promise<string> {
  const rows = page.getByTestId(testid);
  // The rows render after the reload settles; read ids only once one is present.
  await rows.first().waitFor({ state: 'visible' });
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    const id = await rows.nth(i).getAttribute('data-song-id');
    if (id && predicate(id)) return id;
  }
  throw new Error(`No "${testid}" row matched.`);
}

/**
 * Make the frame reproducible: freeze animations and transitions, hide the text
 * caret, and wait for web fonts so glyphs are not swapped in after capture.
 */
export async function settle(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        scroll-behavior: auto !important;
        caret-color: transparent !important;
      }
    `,
  });
  await page.evaluate(() => document.fonts.ready);
}

/** Copy the file a download produced to `dest`. */
export async function saveDownload(
  download: Download,
  dest: string,
): Promise<void> {
  const path = await download.path();
  if (!path) throw new Error('The download produced no file.');
  copyFileSync(path, dest);
}
