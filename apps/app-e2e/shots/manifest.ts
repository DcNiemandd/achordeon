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

/**
 * The Font library block of Settings, heading and Add button included.
 *
 * The section carries no testid, and the component tag alone would cut off both
 * the heading that says where this is and the sentence under it. `:has()` picks
 * the section the list is in without an attribute being added to the app for a
 * screenshot's sake.
 */
const FONT_LIBRARY = 'section:has(> app-font-list)';

/**
 * The `Print` block of the songbook settings dialog, its heading included.
 *
 * `app-songbook-print-fields` is `display: contents` — it has no box of its own,
 * so there is nothing there to clip to — and the heading above it is what says
 * which half of the dialog these rows are. The same `:has()` trick FONT_LIBRARY
 * plays, and for the same reason: no attribute is added to the app for a
 * screenshot's sake.
 */
const PRINT_FIELDS = 'section:has(> app-songbook-print-fields)';

/** The starter library's first real songbook — not the synthetic "All songs". */
const firstBookId = (page: Page) =>
  firstRowId(page, 'songbook-row', (id) => id !== 'all-songs');

/**
 * Seed the library and hand back the guide song — the tour a fresh install is
 * born with, and the song the render-settings shot is taken on.
 *
 * Not `firstRowId(page, 'song-row')`: the list sorts by name, so that is
 * `Amazing Grace` — one four-line verse on an otherwise empty A4, and a settings
 * panel photographed beside a mostly white page says nothing about what the
 * settings are for. The guide song fills a page already cropped to its own
 * content, so the render in pane B is one the settings visibly did something to.
 *
 * Found by the current-row mark rather than by name, because the name is
 * translated and the id is a fresh UUID every seed: `Songs` selects the most
 * recently changed row on arrival (`SongsPresenter.autoSelect`), and the guide
 * song is seeded to be it.
 */
async function guideSongId(page: Page): Promise<string> {
  await seededGoto(page, 'songs');
  const row = page.locator('[data-testid="song-row"].is-current');
  await row.waitFor({ state: 'visible' });
  const id = await row.getAttribute('data-song-id');
  if (!id) throw new Error('The current song row carries no id.');
  return id;
}

/**
 * Put the caret inside the first chord bracket of the song in the open editor.
 *
 * ♯ and ♭ act on the ONE chord under the caret, so they are dead until there is
 * one (`caret().isInsideChord` — `song-editor.page.ts`), and a picture of the
 * transpose group with half of it greyed out teaches the reader that the buttons
 * do not work. There is nothing to click by selector: CodeMirror draws the source
 * as plain text with no chord element in it, so the bracket is found in the
 * document's own text nodes and clicked where it is actually painted.
 */
async function caretIntoChord(page: Page): Promise<void> {
  await page.locator('.cm-content').waitFor({ state: 'visible' });
  const point = await page.evaluate(() => {
    for (const line of Array.from(
      document.querySelectorAll('.cm-content .cm-line'),
    )) {
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        // A bracket with a note behind it: `[Solo]` is a bracket the caret would
        // sit in just as happily, and the buttons would stay dead in it.
        const at = /\[[A-H]/.exec(node.textContent ?? '')?.index;
        if (at !== undefined) {
          const range = document.createRange();
          range.setStart(node, at + 1);
          range.setEnd(node, at + 2);
          const box = range.getBoundingClientRect();
          return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        }
        node = walker.nextNode();
      }
    }
    return null;
  });
  if (!point) throw new Error('The open song has no chord bracket to click.');
  await page.mouse.click(point.x, point.y);
}

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

  // The transpose group in the editor's bar — four buttons a reader has to find
  // before any of the rest of that tutorial can happen. The two badged notes move
  // the whole song; ♯ and ♭ move the one chord the caret is in, which is why the
  // shot puts it in one (`caretIntoChord`): shown greyed they read as broken, and
  // the step they illustrate is precisely that they wake up inside a chord.
  //
  // The bar, not the group alone: a halo around four buttons crops the insert
  // group beside them mid-glyph — the `songbook-reorder` lesson. The bar has its
  // own edges, and it also answers the question the reader actually has, which is
  // where in the editor these live.
  //
  // English only: inside the clip there is not one translated word — the buttons
  // are glyphs, their labels are tooltips, and the heading is a starter song's
  // fixed name. The two locales came out byte-identical.
  {
    name: 'editor-transpose',
    locales: ['en'],
    arrange: async (page) => {
      await seededGoto(page, 'songs');
      const id = await firstRowId(page, 'song-row');
      await page.goto(`songs/${id}/edit`);
      await caretIntoChord(page);
    },
    // The buttons coming alive IS the arrange having worked: `chord-sharp` is
    // rendered disabled until the caret lands in a chord.
    ready: '[data-testid="chord-sharp"]:not([disabled])',
    capture: { mode: 'view', clip: '[data-testid="action-bar"]', pad: 12 },
  },

  // The render settings, open where they are actually used. Full window and no
  // clip, which is the entire reason this shot exists: the dialog is `container`
  // mode with no backdrop, so pane B keeps drawing the song beside it, and a
  // reader nudging a number is looking at the answer in the same frame. Clipped
  // to `.panel` it would be a settings form like any other, and the one fact the
  // tutorial is built on — you tune it while watching it — is the one that would
  // not be in the picture.
  {
    name: 'song-settings',
    arrange: async (page) => {
      const id = await guideSongId(page);
      await page.goto(`songs/${id}/edit`);
      await page.getByTestId('editor-settings').click();
    },
    ready: '[data-testid="song-settings-dialog"]',
    capture: { mode: 'view' },
  },

  // What `Columns` does, which is the one setting on this page a sentence
  // cannot sell. Clipped to the paper: the step is about what happened on the
  // page, and the editor around it is already `song-settings`'s job.
  //
  // `Feature Tour`, not the guide song the shot above uses. The renderer breaks
  // a column only at a block boundary (`column-layout.ts`), so three of the five
  // starter songs — one verse each — render at two columns exactly as they do at
  // one. The guide song has the blocks but not the shape: its lines are long
  // prose, so side by side they halve the fit scale and the two columns end up
  // touching. `Feature Tour` has four short-lined blocks, which is the case this
  // setting is for and the only one in the library that pictures it.
  //
  // It is *seeded* at two columns (`seed.ts`), so the shot resets the row and
  // splits it again: the picture is then the result of the gesture the step
  // describes, and it stays true if the seed ever ships this song at one.
  //
  // English only: a starter song is fixed source text with nothing to translate
  // (`seed.ts`), and the app's own chrome is outside the clip — the two locales
  // came out byte-identical, which is a second file promising a difference it
  // does not hold.
  {
    name: 'song-columns',
    locales: ['en'],
    arrange: async (page) => {
      await seededGoto(page, 'songs');
      const row = page
        .getByTestId('song-row')
        .filter({ hasText: 'Feature Tour' });
      await row.waitFor({ state: 'visible' });
      const id = await row.getAttribute('data-song-id');
      if (!id) throw new Error('The "Feature Tour" row carries no id.');
      await page.goto(`songs/${id}/edit`);
      await page.getByTestId('editor-settings').click();
      // Back to the inherited single column, then the stepper's `+` once.
      await page.getByTestId('reset-columns').click();
      await page.getByTestId('inc-columns').click();
      // The Reset button exists only while the song OWNS the setting
      // (`row.isOverridden`), so waiting for it back is waiting for the change
      // to have landed — the same render pass that redraws pane B. Waiting on
      // the SVG alone would happily photograph the one-column render.
      await page.getByTestId('reset-columns').waitFor({ state: 'visible' });
    },
    ready: '[data-testid="song-render"] svg',
    capture: { mode: 'view', clip: '[data-testid="song-page"]', pad: 12 },
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

  // The print half of that dialog on its own: what the book is MADE of — a title
  // page and its style, page numbers and where they sit, a contents list and
  // which side its numbers go. Six rows a print tutorial walks down in order,
  // where `songbook-settings` above is the whole dialog and shows this section
  // as three lines at the bottom of it.
  //
  // Every toggle is switched ON first, and that is the shot rather than a
  // preference: each one HIDES the row under it while it is off, so the default
  // book — summary off — pictures a style picker, a position picker, and a
  // checkbox with nothing beneath it. Three of the six rows would be missing
  // from a picture of all six.
  //
  // `check()` and not `click()`: the title page and the page numbers are on in a
  // book that has said nothing (`DEFAULT_SONGBOOK_PRINT`), and a click on a
  // ticked box switches it off.
  {
    name: 'songbook-print-fields',
    arrange: async (page) => {
      await seededGoto(page, 'songbooks');
      const bookId = await firstBookId(page);
      await page.goto(`songbooks/${bookId}`);
      await page.getByTestId('songbook-settings').click();
      await page.getByTestId('pdf-title-page').check();
      await page.getByTestId('pdf-page-numbers').check();
      await page.getByTestId('pdf-summary').check();
      // Off the box it just ticked — a hover-lit control in a docs picture reads
      // as the one to press.
      await page.mouse.move(20, 20);
    },
    // Tall for the same reason `songbook-settings` is: the dialog scrolls at
    // 900, and this section is the last one in it.
    viewport: { width: 1280, height: 1500 },
    // The numbering row exists only while the summary is on, so waiting for it
    // is waiting for the last of the three toggles to have landed on the record.
    ready: '[data-testid="pdf-summary-number"]',
    capture: { mode: 'view', clip: PRINT_FIELDS, pad: 12 },
  },

  // The book as paper: the Songbooks list's pane B, holding every sheet the PDF
  // would — the title page, the contents, then the songs, each with its folio in
  // the corner the settings put it in. The step is "look before you print", and
  // this is the thing to look at.
  //
  // Zoomed out to three columns, which is the only way the picture makes the
  // point: at one page per screen it is a title page and nothing to compare it
  // with, and the sentence being illustrated is about a SEQUENCE — front matter
  // first, numbering starting at the first song.
  //
  // The summary is switched on for it. Off, the book is a title page and three
  // songs and the contents step has no picture anywhere on the page.
  //
  // Back to the list by the rail rather than by `goto`: the print structure was
  // just written from a dialog, and a full page load races the app's own write
  // on the way out (the `font-remove` lesson).
  {
    name: 'songbook-print-preview',
    arrange: async (page) => {
      await seededGoto(page, 'songbooks');
      const bookId = await firstBookId(page);
      await page.goto(`songbooks/${bookId}`);
      await page.getByTestId('songbook-settings').click();
      await page.getByTestId('pdf-title-page').check();
      await page.getByTestId('pdf-summary').check();
      await page
        .getByTestId('pdf-summary-number')
        .waitFor({ state: 'visible' });
      await page.keyboard.press('Escape');
      await page.getByTestId('rail-songbooks').click();

      // A click picks a book and previews it; the double click is what opens it.
      await page.getByTestId(`open-${bookId}`).click();
      await page
        .locator('[data-testid="title-page"] svg')
        .waitFor({ state: 'visible' });

      // Zoom is a column count, and the magnifier reads the other way round:
      // "out" shows more, smaller pages. Twice → three across, which is the
      // whole five-sheet book in two rows.
      await page.getByTestId('preview-zoom-out').click();
      await page.getByTestId('preview-zoom-out').click();
      // Every song sheet inked. The pane draws lazily — a frame near the
      // viewport is a spinner until its SVG arrives — so the last of the three
      // songs having one is the book being finished rather than caught drawing.
      await page
        .locator('[data-testid="song-page"] svg')
        .nth(2)
        .waitFor({ state: 'visible' });
      await page.mouse.move(20, 20);
    },
    // Short on purpose. The desk fits its pages to its own height as well as to
    // the column width, so at the default 900 the five sheets sit in the top
    // two-thirds of the pane and the bottom third is bare desk — a third of a
    // docs picture spent on grey. This is the height at which two rows of three
    // fill it.
    viewport: { width: 1440, height: 780 },
    ready: '[data-testid="summary-page"] svg',
    // The pane, bar included: the zoom that produced this view and the "1–5 / 5"
    // readout are half of what the step is telling the reader to do. No padding —
    // the pane has its own edges, and 24px of halo is a strip of the songbook
    // list beside it with every row cut off mid-word.
    capture: { mode: 'view', clip: 'app-songbook-preview', pad: 0 },
  },

  // The songbook download dialog: the format that decides everything under it,
  // and — for a PDF — the paper. It is the last screen of the tutorial and the
  // only one the book's own settings do not reach: the structure travels with
  // the book, the paper stays on this device.
  //
  // Opened on a real book rather than All songs, so the format row offers the
  // link (All songs is the whole library and never fits in one).
  {
    name: 'songbook-download-dialog',
    arrange: async (page) => {
      await seededGoto(page, 'songbooks');
      const bookId = await firstBookId(page);
      await page.goto(`songbooks/${bookId}`);
      await page.getByTestId('songbook-detail-download').click();
      // Whether the book fits in a link is only knowable once the payload has
      // been built, and until it is, `Link` is greyed and a "too big" line may
      // yet appear under the row. Waiting for the answer is what keeps the
      // picture from depending on how fast the machine was.
      await page.waitForFunction(
        () =>
          document.querySelector<HTMLOptionElement>(
            '[data-testid="songbook-format"] option[value="share-link"]',
          )?.disabled === false,
      );
    },
    ready: '[data-testid="pdf-margin"]',
    // `.panel`, not the dialog host: the host carries the scrim, and clipping it
    // pictures the whole dimmed book behind it. No padding, because the panel IS
    // the picture — a halo is a strip of dimmed page with its labels cut in half.
    capture: {
      mode: 'view',
      clip: '[data-testid="songbook-download-dialog"] .panel',
      pad: 0,
    },
  },

  // Stage: the picker that lists what can be performed.
  {
    name: 'stage',
    arrange: (page) => seededGoto(page, 'stage'),
    ready: '[data-testid="stage-list"]',
    capture: { mode: 'view' },
  },

  // The other transpose: a performance shifted while it plays. Full window on
  // purpose — the offset on the bar means nothing without the song it is acting
  // on underneath it, and the whole point of this half is that the page moved
  // while the stored song did not.
  //
  // Stepped twice, because the control pictures itself at rest as a `0` between
  // two arrows: an offset of 0 is a picture of the feature not being used. The
  // readout wakes up off zero (it is the reset button, dead at the written key),
  // so waiting for it to become pressable is waiting for the shift to have
  // landed — the same trick `song-columns` plays with its Reset.
  //
  // Desktop, so the stepper is on the bar in the open. The phone puts it behind
  // ⋯ in a sheet, which is already pictured — from the viewer's side, on a phone
  // — by `audience-transpose`.
  //
  // English only: a performance is a starter song on a starter book, both fixed
  // text (`seed.ts`), and the bar around it is glyphs. Byte-identical in both.
  {
    name: 'stage-transpose',
    locales: ['en'],
    arrange: async (page) => {
      await seededGoto(page, 'songbooks');
      const bookId = await firstBookId(page);
      await page.goto(`stage/${bookId}`);
      await page.getByTestId('stage-render').waitFor({ state: 'visible' });
      await page.getByTestId('transpose-up').click();
      await page.getByTestId('transpose-up').click();
      await page
        .locator('[data-testid="transpose-value"]:not([disabled])')
        .waitFor({ state: 'visible' });
      // Off the button it just pressed: the pointer stays where it clicked, and
      // a hover-lit control in a docs picture reads as the one to press — the
      // same thing `settle` drops focus for.
      await page.mouse.move(720, 600);
    },
    ready: '[data-testid="stage-render"] svg',
    capture: { mode: 'view' },
  },

  // Settings: anchored on the page host, which renders signed in or out.
  {
    name: 'settings',
    arrange: (page) => seededGoto(page, 'settings'),
    ready: 'app-settings-page',
    capture: { mode: 'view' },
  },

  // The font library, with the built-in shelf opened. Shut it is one grey line
  // saying "4 fonts built into the app", which pictures a disclosure rather than
  // a library — open, the same shot carries the four families drawn in their own
  // letters AND the "n of 4 styles" line under each, which is the fact the whole
  // tutorial turns on. The section, not `app-font-list`: the heading and the
  // sentence about a font staying on this device are what say where in Settings
  // this is, and the Add button is the next thing the reader presses.
  {
    name: 'font-library',
    arrange: async (page) => {
      await seededGoto(page, 'settings');
      await page.getByTestId('font-built-in').click();
      await page.locator(FONT_LIBRARY).scrollIntoViewIfNeeded();
      // Off the summary it just clicked: a lit hover in a docs picture reads as
      // the control to press, and here that is the Add button below it.
      await page.mouse.move(20, 20);
    },
    // A bundled row, which exists only once the disclosure is open — waiting for
    // the list itself would photograph it still folded.
    ready: '[data-testid="font-roboto-mono"]',
    capture: { mode: 'view', clip: FONT_LIBRARY, pad: 12 },
  },

  // The add dialog with a search answered, which is the state the step is about:
  // the three ways in are all on screen, and the results underneath the field
  // show what a result actually promises. `crimson` is the query because its two
  // answers are one of each kind — Crimson Text installs as four static files
  // ("4 of 4 styles"), Crimson Pro ships as two variable ones and says so. Both
  // sentences the tutorial explains, in one picture, before anything is fetched.
  {
    name: 'add-font-dialog',
    arrange: async (page) => {
      await seededGoto(page, 'settings');
      await page.getByTestId('font-add').click();
      await page.getByTestId('add-font-search').fill('crimson');
    },
    ready: '[data-testid="add-font-results"]',
    // `.panel`, not the dialog host: the host carries the scrim, and clipping it
    // pictures the whole dimmed settings page instead of the dialog on it. And
    // no padding, because the panel IS the picture — a halo around it is a strip
    // of dimmed settings page with every label in it cut off mid-word.
    capture: {
      mode: 'view',
      clip: '[data-testid="add-font-dialog"] .panel',
      pad: 0,
    },
  },

  // What removing a font costs, in the app's own words. The count is the whole
  // picture, so the shot has to earn one: it installs a family, sets a song and
  // a book in it, and only then asks to remove it — with nothing set in it the
  // dialog says "Nothing is set in …", which is the one sentence this step is
  // not about.
  //
  // The family is fetched from jsDelivr, the only shot that reaches a third
  // party. Courier Prime because the repo ships it as four static files, so the
  // library row behind the dialog reads "4 of 4 styles" rather than needing the
  // variable-font caveat explained twice.
  //
  // The id is read back off the row rather than spelled here: it is slugged from
  // the family name inside the file (`customFontId`), which is the file's
  // property and not the search result's.
  {
    name: 'font-remove',
    arrange: async (page) => {
      await seededGoto(page, 'settings');
      await page.getByTestId('font-add').click();
      await page.getByTestId('add-font-search').fill('courier prime');
      await page.getByTestId('add-font-result-courierprime').click();

      const remove = page.locator('[data-testid^="remove-custom:"]').first();
      await remove.waitFor({ state: 'visible', timeout: 60_000 });
      const fontId = (await remove.getAttribute('data-testid'))?.slice(
        'remove-'.length,
      );
      if (!fontId) throw new Error('The added font row carries no id.');

      // One song and one book, so the count reads "2 of your songs and
      // songbooks" — the plural the sentence is written for, and the two scopes
      // the step before this one is about.
      //
      // Every hop out of a module is a click on the rail rather than a `goto`.
      // The editor's autosave is debounced (`SAVE_DEBOUNCE_MS`) and flushed when
      // the component is destroyed; a full page load destroys the whole document
      // instead, and the write it fires on the way out races the unload. Routing
      // inside the app leaves the page alive to finish it.
      await page.goto('songs');
      const songId = await firstRowId(page, 'song-row');
      await page.goto(`songs/${songId}/edit`);
      await page.getByTestId('editor-settings').click();
      await page.getByTestId('select-bodyFont').selectOption(fontId);
      // The Reset badge exists only while the song OWNS the setting, so waiting
      // for it is waiting for the change to have landed in the record.
      await page.getByTestId('reset-bodyFont').waitFor({ state: 'visible' });
      await page.keyboard.press('Escape');
      await page.getByTestId('rail-songbooks').click();

      const bookId = await firstBookId(page);
      await page.goto(`songbooks/${bookId}`);
      await page.getByTestId('songbook-settings').click();
      await page.getByTestId('select-bodyFont').selectOption(fontId);
      await page.getByTestId('reset-bodyFont').waitFor({ state: 'visible' });
      await page.keyboard.press('Escape');

      await page.getByTestId('rail-settings').click();
      await page.getByTestId(`remove-${fontId}`).click();
    },
    ready: '[data-testid="font-remove-dialog"]',
    // No padding, for the same reason as the add dialog above.
    capture: {
      mode: 'view',
      clip: '[data-testid="font-remove-dialog"] .panel',
      pad: 0,
    },
  },

  // The audience dialog one step BEFORE the lobby: the sentence explaining what
  // sharing does, the Premium marker on the button, and the button itself. The
  // live lobby (`stage-lobby`) is the same dialog with everything already
  // decided, so it cannot answer "what do I press, and what will it cost me" —
  // that question only has a picture here. No lobby is created, so no backend is
  // touched: the shot stops at `create`, the state the dialog opens in.
  {
    name: 'stage-audience-create',
    arrange: async (page) => {
      await seededGoto(page, 'songbooks');
      const bookId = await firstBookId(page);
      await page.goto(`stage/${bookId}`);
      await page.getByTestId('stage-render').waitFor({ state: 'visible' });
      await page.getByTestId('stage-audience').click();
    },
    ready: '[data-testid="stage-create-lobby"]',
    // `.panel`, not the dialog host: the host carries the scrim, and clipping it
    // pictures the whole dimmed performance instead of the dialog on it.
    capture: {
      mode: 'view',
      clip: '[data-testid="stage-audience-dialog"] .panel',
    },
  },

  // The viewer's front door: the PIN prompt on a bare `/audience`. The other
  // audience pictures all start after a join, so this is the only one that shows
  // the field the reader is being told to type into — and the hint that a QR
  // code is the other way in. Free and lobby-less: the prompt is what the module
  // renders with no PIN, so nothing has to be hosted for it.
  //
  // The PIN is typed in rather than left blank, for two reasons: an empty field
  // greys Join out, and a docs picture of a dead primary button reads as a
  // broken screen; and it is `DOCS_LOBBY_PIN`, so the five characters here are
  // the same five the lobby picture shows the performer holding up.
  {
    name: 'audience-join',
    arrange: async (page) => {
      await seededGoto(page, 'audience');
      await page.getByTestId('audience-pin-input').fill(DOCS_LOBBY_PIN);
    },
    ready: '[data-testid="audience-join"]',
    // Clipped to the form: the rest of the route is an empty page, and a
    // full-window shot would be a 320px card adrift in it.
    capture: { mode: 'view', clip: '[data-testid="audience-join"]' },
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
      // On a phone the bar carries fullscreen, the song list and a More menu —
      // transpose is inside it. Which is itself worth picturing: the reader has
      // to open that menu to find this at all.
      await page.getByTestId('audience-menu').click();
      await page.getByTestId('audience-transpose').click();
      await page.getByTestId('transpose-up').click();
    },
    viewport: { width: 420, height: 860 },
    ready: '[data-testid="audience-transpose-sheet"]',
    capture: { mode: 'view' },
  },
];
