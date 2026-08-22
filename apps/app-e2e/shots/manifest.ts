// The shots — what each docs screenshot pictures, and how to get the app there.
//
// Add a screenshot by adding an entry. Most are `view` shots: navigate, wait for
// the marker, and the harness screenshots the page (or the `clip` element). The
// odd one out is `song-render`, an `export` shot: the app renders a song to a PNG
// and hands it over as a download, which is the picture the docs want.
//
// `locales` and `themes` each default to both, so a shot is captured four ways
// unless it says otherwise. A shot opts out of one only when that copy would be
// redundant or wrong — the icon-only rail is English-only, since its bytes do
// not change with the language (the labels that do are tooltips, not in the
// picture), and `song-render` is light-only, because it is sheet music: the
// export is ink on paper whatever the app around it is wearing.

import { type Page } from '@playwright/test';
import {
  DOCS_LOBBY_PIN,
  type Locale,
  type Theme,
  type Viewport,
  firstRowId,
  seedPerformance,
  seededGoto,
} from './harness';

/** The other devices a shot can open — a lobby needs a second one. */
export interface Peers {
  /**
   * Another device in this shot: its own context, same locale and theme,
   * already on `route` with the starter library seeded.
   */
  readonly open: (route: string, viewport?: Viewport) => Promise<Page>;
}

interface Common {
  /** File stem: writes `screenshot-<name>.png`, plus `-dark` for that theme. */
  readonly name: string;
  /** Which UI languages to capture. Defaults to both. */
  readonly locales?: readonly Locale[];
  /** Which app themes to capture. Defaults to both. */
  readonly themes?: readonly Theme[];
  readonly viewport?: Viewport;
  readonly deviceScaleFactor?: number;
  /**
   * What this shot needs that the workspace does not start for it. `backend`
   * means a reachable Supabase; those shots are skipped without one rather
   * than failing the run.
   */
  readonly needs?: 'backend';
  /** Drive the app to the moment of capture (navigate, open, seed extra). */
  readonly arrange: (page: Page, peers: Peers) => Promise<void>;
}

/** A screenshot of the page, or of the box around `clip` if given. */
interface ViewShot extends Common {
  readonly capture: {
    readonly mode: 'view';
    readonly clip?: string;
    /** Room left around `clip`, in CSS pixels. Defaults to `DEFAULT_PAD`. */
    readonly pad?: number;
  };
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

/**
 * Put a performance on a peer device and open its lobby, so the shot's own page
 * has one to join. Returns once the host is publishing: a viewer that joins
 * before that sees a lobby with no song in it, which is a picture of a bug.
 */
async function hostLobby(peers: Peers): Promise<Page> {
  const host = await peers.open('songbooks');
  const bookId = await firstBookId(host);
  await seedPerformance(host, { bookId, pin: DOCS_LOBBY_PIN });
  await host.goto(`stage/${bookId}`);
  await host.getByTestId('stage-render').waitFor({ state: 'visible' });
  return host;
}

export const SHOTS: readonly Shot[] = [
  // The showcase render: the app's own SVG→PNG export of a song, not a
  // screenshot of the screen. The starter song's content is itself translated,
  // so the render differs by locale — both are captured (the default).
  //
  // Light only: the export is the printable sheet, which the app renders on
  // paper regardless of its own theme. A `-dark` copy would be the same pixels
  // under a name that promises different ones.
  {
    name: 'song-render',
    themes: ['light'],
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
    // No padding: the rail IS the picture, and a halo would just be a strip of
    // the page beside it (the viewport is already cut to the rail's height).
    capture: { mode: 'view', clip: '[data-testid="rail"]', pad: 0 },
  },

  // The download dialog, opened over the songs page — its format options are
  // localized, so both locales are captured.
  {
    name: 'download-dialog',
    arrange: async (page) => {
      await seededGoto(page, 'songs');
      await page.getByTestId('song-row').first().waitFor({ state: 'visible' });
      await page.getByTestId('songs-download').click();
    },
    ready: '[data-testid="download-dialog"]',
    capture: { mode: 'view', clip: '[data-testid="download-dialog"]' },
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

  // The book's reorder tools, live. The four buttons are dead until slots are
  // ticked, so the shot picks one first — a picture of a disabled toolbar would
  // teach the reader the wrong thing. Clipped: this is a step about four
  // buttons, not about the module around them.
  {
    name: 'songbook-reorder',
    arrange: async (page) => {
      await seededGoto(page, 'songbooks');
      const bookId = await firstBookId(page);
      await page.goto(`songbooks/${bookId}`);
      const slotKey = await firstRowId(page, 'entry-row');
      await page.getByTestId(`select-${slotKey}`).click();
    },
    ready: '[data-testid="entry-tools"] button:not([disabled])',
    // The book's header strip, not the toolbar alone: a 24px halo around four
    // buttons only crops the neighbours mid-word. The strip has its own edges,
    // so nothing in the picture is cut, and the four buttons are shown where
    // they actually live — beside the book's name and its perform/download.
    capture: { mode: 'view', clip: '[data-testid="action-bar"]', pad: 12 },
  },

  // The song preview over the builder — the dialog a row's preview opens, with
  // its Edit. It reopens from the URL (`?preview=`), which is how this gets
  // there: the song id comes from the library, since an entry row's id is a
  // slot key and not a song's.
  {
    name: 'songbook-preview',
    arrange: async (page) => {
      await seededGoto(page, 'songs');
      const songId = await firstRowId(page, 'song-row');
      await page.goto('songbooks');
      const bookId = await firstBookId(page);
      await page.goto(`songbooks/${bookId}?preview=${songId}`);
    },
    // The whole window on purpose: the step is "look at a song WITHOUT leaving
    // the list", and the dimmed builder behind the dialog is half of that
    // sentence. Clipped to the panel it would just be a render.
    ready: '[data-testid="song-preview-dialog"] svg',
    capture: { mode: 'view' },
  },

  // The book's own settings dialog — the songbook scope of the cascade, which
  // is what a tutorial step about restyling a whole book points at.
  {
    name: 'songbook-settings',
    arrange: async (page) => {
      await seededGoto(page, 'songbooks');
      const bookId = await firstBookId(page);
      await page.goto(`songbooks/${bookId}`);
      await page.getByTestId('songbook-settings').click();
    },
    // Tall on purpose: the dialog scrolls at 900, and a picture of a settings
    // panel cut off mid-list teaches the reader that the list ends there.
    viewport: { width: 1280, height: 1500 },
    ready: '[data-testid="songbook-settings-dialog"]',
    capture: {
      mode: 'view',
      clip: '[data-testid="songbook-settings-dialog"] .panel',
    },
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

  // ---------------------------------------------------------------------------
  // Lobby shots. Two devices each, and a Supabase to carry the song between
  // them — `needs: 'backend'`, so a run without one skips these four and takes
  // everything else.
  //
  // Hosting needs no account: `lobby_publish` and `lobby_end` are granted to
  // `anon` (supabase/migrations/20260724000000_lobbies.sql), and the PIN is
  // allocated on the device. So the whole set works signed out, against local
  // `supabase start` or a deployed project — whichever the app's own config
  // names, or whatever `SUPABASE_URL` overrides it with.
  //
  // The PIN is seeded rather than pressed for (`DOCS_LOBBY_PIN`): a real one is
  // five random characters, and a docs picture of a lobby has to show the same
  // PIN as the picture beside it.
  // ---------------------------------------------------------------------------

  // The performer's lobby, live: PIN, link, QR, and a count that says somebody
  // is actually there. The count is why this shot has a viewer at all — a lobby
  // pictured with nobody on it is a lobby that looks like it failed.
  {
    name: 'stage-lobby',
    needs: 'backend',
    arrange: async (page, peers) => {
      await seededGoto(page, 'songbooks');
      const bookId = await firstBookId(page);
      await seedPerformance(page, { bookId, pin: DOCS_LOBBY_PIN });
      await page.goto(`stage/${bookId}`);
      await page.getByTestId('stage-render').waitFor({ state: 'visible' });
      await page.getByTestId('stage-audience').click();

      // The viewer joins after the host is publishing, so it lands on a song
      // rather than on an empty lobby it would have to be told about later.
      const viewer = await peers.open(`audience/${DOCS_LOBBY_PIN}`);
      await viewer
        .getByTestId('audience-render')
        .waitFor({ state: 'visible', timeout: 30_000 });

      // Presence, not the join: the count is what the picture is for.
      await page
        .getByTestId('stage-lobby-count')
        .filter({ hasText: /[1-9]/ })
        .waitFor({ state: 'visible', timeout: 30_000 });
    },
    // Tall: PIN, count, link and QR are a four-row list, and a QR cut in half
    // is a QR nobody can scan out of the docs.
    viewport: { width: 1280, height: 1400 },
    ready: '[data-testid="stage-lobby-qr"]',
    capture: {
      mode: 'view',
      clip: '[data-testid="stage-audience-dialog"] .panel',
    },
  },

  // The viewer's screen, following the performance. A phone, because that is
  // what an audience holds — and because the narrow layout is the one that puts
  // the viewer's controls in the bottom bar.
  {
    name: 'audience-following',
    needs: 'backend',
    arrange: async (page, peers) => {
      await hostLobby(peers);
      await page.goto(`audience/${DOCS_LOBBY_PIN}`);
    },
    viewport: { width: 420, height: 860 },
    ready: '[data-testid="audience-render"] svg',
    capture: { mode: 'view' },
  },

  // The set list as the audience gets it: the same book, read-only, with its
  // own search. It travels once on join, which is why a viewer can open it
  // without asking the performer for anything.
  {
    name: 'audience-summary',
    needs: 'backend',
    arrange: async (page, peers) => {
      await hostLobby(peers);
      await page.goto(`audience/${DOCS_LOBBY_PIN}`);
      await page.getByTestId('audience-render').waitFor({ state: 'visible' });
      await page.getByTestId('audience-summary').click();
    },
    viewport: { width: 420, height: 860 },
    ready: '[data-testid="audience-summary-list"]',
    capture: { mode: 'view' },
  },

  // A viewer transposing their own screen. Full window on purpose: the step is
  // that the chords behind the sheet moved and the performer's did not, which
  // is a sentence about two things being in one picture.
  {
    name: 'audience-transpose',
    needs: 'backend',
    arrange: async (page, peers) => {
      await hostLobby(peers);
      await page.goto(`audience/${DOCS_LOBBY_PIN}`);
      await page.getByTestId('audience-render').waitFor({ state: 'visible' });
      await page.getByTestId('audience-transpose').click();
      await page.getByTestId('transpose-up').click();
    },
    viewport: { width: 420, height: 860 },
    ready: '[data-testid="audience-transpose-sheet"]',
    capture: { mode: 'view' },
  },
];
