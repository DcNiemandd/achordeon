// The shots — what each docs screenshot pictures, and how to get the app there.
//
// Add a screenshot by adding an entry. Most are `view` shots: navigate, wait for
// the marker, and the harness screenshots the page (or the `clip` element). The
// odd one out is `song-render`, an `export` shot: the app renders a song to a PNG
// and hands it over as a download, which is the picture the docs want.
//
// `locales` defaults to both. A shot opts out of one only when it would be
// redundant — the icon-only rail is English-only, since its bytes do not change
// with the language (the labels that do are tooltips, not in the picture).

import { type Page } from '@playwright/test';
import { type Locale, type Viewport, firstRowId, seededGoto } from './harness';

interface Common {
  /** File stem: writes `screenshot-<name>.png`. */
  readonly name: string;
  /** Which UI languages to capture. Defaults to both. */
  readonly locales?: readonly Locale[];
  readonly viewport?: Viewport;
  readonly deviceScaleFactor?: number;
  /** Drive the app to the moment of capture (navigate, open, seed extra). */
  readonly arrange: (page: Page) => Promise<void>;
}

/** A screenshot of the page, or of `clip` if given. */
interface ViewShot extends Common {
  readonly capture: { readonly mode: 'view'; readonly clip?: string };
  /** A selector that is present once the view is ready to be pictured. */
  readonly ready: string;
}

/** A PNG the app produces itself, captured from the download it triggers. */
interface ExportShot extends Common {
  readonly capture: {
    readonly mode: 'export';
    readonly act: (page: Page) => Promise<void>;
  };
}

export type Shot = ViewShot | ExportShot;

/** Narrows a shot to the screenshot kind (vs. the app-download kind). */
export const isView = (shot: Shot): shot is ViewShot =>
  shot.capture.mode === 'view';

/** The starter library's first real songbook — not the synthetic "All songs". */
const firstBookId = (page: Page) =>
  firstRowId(page, 'songbook-row', (id) => id !== 'all-songs');

export const SHOTS: readonly Shot[] = [
  // The showcase render: the app's own SVG→PNG export of a song, not a
  // screenshot of the screen. The starter song's content is itself translated,
  // so the render differs by locale — both are captured (the default).
  {
    name: 'song-render',
    arrange: (page) => seededGoto(page, 'songs'),
    capture: {
      mode: 'export',
      act: async (page) => {
        await page.getByTestId('songs-download').click();
        await page.getByTestId('download-png').click();
      },
    },
  },

  // The nav rail on its own. The rail fills the viewport and pins Settings to
  // the bottom (space-between), so on a tall screen there is a wide gap. We
  // measure the two icon groups and shrink the viewport to their combined
  // height, leaving almost no space between the modules and Settings. Width
  // stays wide to keep the desktop rail — a narrow viewport would switch the
  // shell to its mobile module-switcher. Icons do not localize (only tooltips
  // do), so the two locales are byte-identical — English only.
  {
    name: 'sidebar',
    locales: ['en'],
    arrange: async (page) => {
      await seededGoto(page, 'songs');
      await page.getByTestId('rail').waitFor({ state: 'visible' });
      const height = await page.evaluate(() => {
        const groups = document.querySelectorAll('[data-testid="rail"] ul');
        return Math.ceil(
          Array.from(groups).reduce(
            (h, g) => h + g.getBoundingClientRect().height,
            0,
          ),
        );
      });
      const { width } = page.viewportSize() ?? { width: 1440 };
      await page.setViewportSize({ width, height });
    },
    ready: '[data-testid="rail"]',
    capture: { mode: 'view', clip: '[data-testid="rail"]' },
  },

  // Songs: the explorer with a song focused in the preview pane.
  {
    name: 'songs',
    arrange: (page) => seededGoto(page, 'songs'),
    ready: '[data-testid="song-render"] svg',
    capture: { mode: 'view' },
  },

  // The editor, opened on the first seeded song.
  {
    name: 'editor',
    arrange: async (page) => {
      await seededGoto(page, 'songs');
      const id = await firstRowId(page, 'song-row');
      await page.goto(`songs/${id}/edit`);
    },
    ready: '[data-testid="song-render"] svg',
    capture: { mode: 'view' },
  },

  // Songbooks: the list of books.
  {
    name: 'songbooks',
    arrange: (page) => seededGoto(page, 'songbooks'),
    ready: '[data-testid="songbook-row"]',
    capture: { mode: 'view' },
  },

  // A single songbook opened, with its entries and preview.
  {
    name: 'songbook-detail',
    arrange: async (page) => {
      await seededGoto(page, 'songbooks');
      const id = await firstBookId(page);
      await page.goto(`songbooks/${id}`);
    },
    ready: '[data-testid="songbook-detail"]',
    capture: { mode: 'view' },
  },

  // Stage: the picker that lists what can be performed.
  {
    name: 'stage',
    arrange: (page) => seededGoto(page, 'stage'),
    ready: '[data-testid="stage-list"]',
    capture: { mode: 'view' },
  },

  // Settings: anchored on the page host, which renders signed in or out.
  {
    name: 'settings',
    arrange: (page) => seededGoto(page, 'settings'),
    ready: 'app-settings-page',
    capture: { mode: 'view' },
  },
];
