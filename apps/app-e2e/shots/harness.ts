// Screenshot harness — the shared machinery every shot runs through.
//
// A "shot" (see `manifest.ts`) says WHAT to picture; this file is HOW: seed the
// library, force a language and a theme, wait for the app to settle, then
// either screenshot the page or capture the PNG the app itself downloads.
//
// Nothing here touches the docs `.mdx` — a run only writes image files into
// `apps/docs/static/img/` (English) and `apps/docs/static/img/cs/` (Czech).

import { type Browser, type Download, type Page } from '@playwright/test';
import { workspaceRoot } from '@nx/devkit';
import { mkdirSync, copyFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type Locale = 'en' | 'cs';
export type Theme = 'light' | 'dark';

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
 * The file a shot named `name` writes for `locale` in `theme`.
 *
 * English keeps the bare `screenshot-<name>.png` the docs already expect; Czech
 * gets the same file name under `img/cs/`, so one `<Image src>` swap per locale
 * is all the wiring a shot needs later.
 *
 * The light theme keeps that bare name and dark adds a `-dark` postfix, so the
 * two themes of one shot stay one name apart and `<Image srcDark>` is a
 * mechanical edit rather than a lookup.
 */
export function outputPath(name: string, locale: Locale, theme: Theme): string {
  const dir = locale === 'cs' ? join(IMG_DIR, 'cs') : IMG_DIR;
  mkdirSync(dir, { recursive: true });
  const postfix = theme === 'dark' ? '-dark' : '';
  return join(dir, `screenshot-${name}${postfix}.png`);
}

/**
 * A fresh context in `locale` and `theme`, with the OS save picker removed so
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
  theme: Theme,
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
            { name: 'achordeon.theme', value: theme },
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
 * caret, drop focus, and wait for web fonts so glyphs are not swapped in after
 * capture.
 *
 * Focus is dropped because a dialog captures it on open (`cdkTrapFocusAutoCapture`)
 * and the ring lands on its close button — a docs picture with one control
 * ringed reads as "press this", which is not what the step is pointing at.
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
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
  });
  await page.evaluate(() => document.fonts.ready);
}

/** How much room a clipped shot leaves around its subject, in CSS pixels. */
export const DEFAULT_PAD = 24;

/**
 * The box to screenshot for a clipped shot: the element's own, grown by `pad`
 * on every side and clamped to the viewport.
 *
 * A locator screenshot is the element and nothing else, which for a small
 * subject — four buttons, one field — crops so tight that the picture loses what
 * the thing sits in. Padding puts it back on its shelf. Clamping matters because
 * an element against an edge would otherwise ask for a box that starts at a
 * negative coordinate, which is not a clip Playwright will take.
 */
export async function paddedClip(
  page: Page,
  selector: string,
  pad: number = DEFAULT_PAD,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`"${selector}" has no box to clip.`);
  const view = page.viewportSize() ?? { width: box.width, height: box.height };
  const x = Math.max(0, box.x - pad);
  const y = Math.max(0, box.y - pad);
  const right = Math.min(view.width, box.x + box.width + pad);
  const bottom = Math.min(view.height, box.y + box.height + pad);
  return { x, y, width: right - x, height: bottom - y };
}

/**
 * The Supabase a lobby shot needs, if there is one.
 *
 * Read out of the app's own generated config rather than hard-coded, so a run
 * points at whatever the app it is shooting points at - local `supabase start`
 * or the deployed project. `SUPABASE_URL` overrides it for a run against one
 * the config does not name.
 */
function backendUrl(): string {
  const override = process.env['SUPABASE_URL'];
  if (override) return override;
  try {
    const config = readFileSync(
      join(workspaceRoot, 'apps', 'app', 'src', 'app', 'supabase.config.ts'),
      'utf8',
    );
    return /"url":\s*"([^"]+)"/.exec(config)?.[1] ?? '';
  } catch {
    return '';
  }
}

let backendProbe: Promise<boolean> | null = null;

/**
 * Whether a lobby can actually be hosted right now.
 *
 * A lobby shot is the only kind that needs something the workspace does not
 * start for it, so it is the only kind that can be legitimately unrunnable: the
 * runner skips those tests rather than failing them, and a run with no backend
 * still produces every other picture. Probed once per process.
 */
export async function isBackendUp(): Promise<boolean> {
  backendProbe ??= (async () => {
    const url = backendUrl();
    if (!url) return false;
    try {
      const response = await fetch(`${url}/auth/v1/health`, {
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  })();
  return backendProbe;
}

/**
 * The lobby PIN every audience shot uses.
 *
 * Fixed, because a real one is allocated at random and would make every rerun
 * write a different picture of the same thing - and because a PIN in the docs
 * is read, typed and recognised across three images, which a fresh five
 * characters each time cannot be. Spelled from the PIN alphabet (no `0/O`,
 * no `1/I/L`), so it is a PIN the app itself could have handed out.
 */
export const DOCS_LOBBY_PIN = 'STAGE';

/**
 * Put a performance in place before the page that reads it loads.
 *
 * `StageSession` restores itself from this record at construction, lobby PIN
 * included, which is what makes a *hosted* lobby reachable without clicking
 * through the dialog - and what makes the PIN a value the shot chooses rather
 * than one it has to read back off the screen. The route is then loaded fresh:
 * the record is read once, at construction, not watched.
 */
export async function seedPerformance(
  page: Page,
  performance: { bookId: string; index?: number; pin?: string },
): Promise<void> {
  await page.evaluate((state) => {
    localStorage.setItem(
      'achordeon.stage',
      JSON.stringify({
        bookId: state.bookId,
        index: state.index ?? 0,
        lobbyPin: state.pin ?? '',
        songDark: null,
        savedAt: Date.now(),
      }),
    );
  }, performance);
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
