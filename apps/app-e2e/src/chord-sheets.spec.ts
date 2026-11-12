// Chord sheets in and out — plans/import-chord-sheets.md
//
// The conversion itself is pinned in libs/shared/domain (chord-sheet.spec.ts);
// these are the doors into it, end to end: a paste, the editor's two buttons,
// the Import dialog, a drop, the ChordPro download, and a Song site.
//
// The Song site is never the real one. The function is answered here, through
// `page.route`, so the suite runs offline and no test is a request to a site
// (ADR-0019). The real adapter has its own tests against recorded responses.
//
// Selects only on `data-testid`, like every other suite here.

import {
  expect,
  test,
  type Download,
  type Page,
  type Route,
} from '@playwright/test';
import { readFileSync } from 'node:fs';

const ROOMY = { width: 1440, height: 900 };

/** Chords on their own row, in English. */
const ENGLISH_SHEET = 'Am      F\nSome words here\nC       G\nmore words here';
const ENGLISH_CONVERTED = '[Am]Some wor[F]ds here\n[C]more wor[G]ds here';

/** The same shape, spelled the German way: `H` is B, `Fis` is F#, `mi` is m. */
const GERMAN_SHEET = 'H       Fis\nslova jedna\nAmi     E\nslova dva';
const GERMAN_CONVERTED = '[B]slova je[F#]dna\n[Am]slova dv[E]a';

async function freshLibrary(page: Page): Promise<void> {
  await page.goto('songs');
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase('achordeon');
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
      }),
  );
  await page.reload();
}

/** A new song, open in the editor, with the starter content cleared away. */
async function freshEditor(page: Page): Promise<void> {
  await page.getByTestId('songs-add').click();
  await expect(page).toHaveURL(/\/songs\/.+\/edit$/);
  await content(page).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('editor').locator('.cm-line')).toHaveCount(1);
}

const content = (page: Page) =>
  page.getByTestId('editor').locator('.cm-content');

/** The editor's text, line by line. `textContent`, so spaces stay spaces. */
const text = (page: Page) =>
  page
    .getByTestId('editor')
    .locator('.cm-line')
    .evaluateAll((lines) => lines.map((l) => l.textContent).join('\n'));

/**
 * Paste `pasted` into the editor, through CodeMirror's own paste handler.
 *
 * Built in the page rather than through the system clipboard, which a test can
 * only read in Chromium. `clipboardData` is defined on a plain event because
 * not every engine takes it from the `ClipboardEvent` constructor.
 */
async function paste(page: Page, pasted: string): Promise<void> {
  await content(page).click();
  await content(page).evaluate((element, data) => {
    const transfer = new DataTransfer();
    transfer.setData('text/plain', data);
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: transfer });
    element.dispatchEvent(event);
  }, pasted);
}

/** Type line by line, an Enter for each newline, the way a person does. */
async function typeLines(page: Page, typed: string): Promise<void> {
  await content(page).click();
  const [first, ...rest] = typed.split('\n');
  if (first) await page.keyboard.insertText(first);
  for (const line of rest) {
    await page.keyboard.press('Enter');
    if (line) await page.keyboard.insertText(line);
  }
}

const row = (page: Page, name: string) =>
  page.getByTestId('song-row').filter({ hasText: name });

/** Open a song from the list into the editor. By its id: on a desktop a click
 * on the row only picks it. */
async function openSong(page: Page, name: string): Promise<void> {
  await expect(row(page, name)).toHaveCount(1);
  const id = await row(page, name).getAttribute('data-song-id');
  await page.goto(`songs/${id}/edit`);
  await expect(page.getByTestId('editor')).toBeVisible();
}

/** Open the Import dialog on `from` and pick a chord-sheet file. */
async function importChordSheet(
  page: Page,
  from: 'songs' | 'songbooks',
  file: { name: string; buffer: Buffer },
): Promise<void> {
  await page.getByTestId(`${from}-import`).click();
  await expect(page.getByTestId('import-dialog')).toBeVisible();
  await page
    .getByTestId('import-chord-sheet-input')
    .setInputFiles({ ...file, mimeType: 'text/plain' });
  await expect(page.getByTestId('import-summary')).toBeVisible();
  await page.getByTestId('import-confirm').click();
}

/** Press a control and hand back the file it produced, with its name. */
async function download(
  page: Page,
  act: () => Promise<void>,
): Promise<{ name: string; text: string }> {
  const waiting = page.waitForEvent('download', { timeout: 30_000 });
  await act();
  const file: Download = await waiting;
  const path = await file.path();
  if (!path) throw new Error('The download produced no file.');
  return {
    name: file.suggestedFilename(),
    text: readFileSync(path, 'utf8'),
  };
}

test.beforeEach(async ({ page }) => {
  // Force the anchor download, not the OS save picker, which Playwright cannot
  // drive (the same reason as in transfer.spec.ts).
  await page.addInitScript(() => {
    // @ts-expect-error deleting an optional platform API for the test
    delete window.showSaveFilePicker;
  });
  await page.setViewportSize(ROOMY);
  await freshLibrary(page);
});

test.describe('pasting a chord sheet', () => {
  test('offers to convert it, and one undo brings the paste back', async ({
    page,
  }) => {
    await freshEditor(page);
    await paste(page, ENGLISH_SHEET);

    // The paste lands as pasted. Converting is the person's call.
    expect(await text(page)).toBe(ENGLISH_SHEET);
    await expect(page.getByTestId('convert-bar')).toBeVisible();

    await page.getByTestId('convert-bar-convert').click();
    await expect.poll(() => text(page)).toBe(ENGLISH_CONVERTED);
    await expect(page.getByTestId('convert-bar')).toBeHidden();

    await content(page).click();
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => text(page)).toBe(ENGLISH_SHEET);
  });

  test('the cross keeps the paste as it is', async ({ page }) => {
    await freshEditor(page);
    await paste(page, ENGLISH_SHEET);

    await page.getByTestId('convert-bar-close').click();
    await expect(page.getByTestId('convert-bar')).toBeHidden();
    expect(await text(page)).toBe(ENGLISH_SHEET);
  });

  test('plain words pasted are not a chord sheet, so nothing is offered', async ({
    page,
  }) => {
    await freshEditor(page);
    await paste(page, 'Just words\nand more words');

    await expect.poll(() => text(page)).toBe('Just words\nand more words');
    await expect(page.getByTestId('convert-bar')).toBeHidden();
  });
});

test.describe('the editor converts on a click', () => {
  test('with nothing selected, Convert turns the whole song into English', async ({
    page,
  }) => {
    await freshEditor(page);
    await typeLines(page, GERMAN_SHEET);

    await page.getByTestId('chord-sheet-convert').click();
    await expect.poll(() => text(page)).toBe(GERMAN_CONVERTED);

    // One undo step for the whole conversion.
    await content(page).click();
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(() => text(page)).toBe(GERMAN_SHEET);
  });

  test('with a selection, Convert leaves the rest of the song alone', async ({
    page,
  }) => {
    await freshEditor(page);
    await typeLines(page, `* Title\n${GERMAN_SHEET}`);

    // Everything below the title.
    await page.keyboard.press('ControlOrMeta+Home');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Home');
    await page.keyboard.press('ControlOrMeta+Shift+End');

    await page.getByTestId('chord-sheet-convert').click();
    await expect.poll(() => text(page)).toBe(`* Title\n${GERMAN_CONVERTED}`);
  });

  test('German chords to English respells only the chords', async ({
    page,
  }) => {
    await freshEditor(page);
    await typeLines(page, '[H]jedna [Fis]dva [Ami]tři [B]čtyři');

    await page.getByTestId('chords-to-english').click();
    await expect
      .poll(() => text(page))
      .toBe('[B]jedna [F#]dva [Am]tři [Bb]čtyři');
  });
});

test.describe('a chord sheet file', () => {
  test('a ChordPro file with several songs comes in as several songs', async ({
    page,
  }) => {
    await importChordSheet(page, 'songs', {
      name: 'set.cho',
      buffer: Buffer.from(
        '{title: One}\n{artist: A}\n[Am]Words\n{new_song}\n{title: Two}\nMore\n',
      ),
    });

    await expect(row(page, 'One – A')).toHaveCount(1);
    await expect(row(page, 'Two')).toHaveCount(1);
    await openSong(page, 'One – A');
    await expect.poll(() => text(page)).toBe('* One\n** A\n\n[Am]Words\n');
  });

  test('an old Czech Windows text file imports from the Songbooks page', async ({
    page,
  }) => {
    // "kůň běží / kůň stojí" in windows-1250 (ů F9, ň F2, ě EC, ž 9E, í ED):
    // not valid UTF-8, so a reader that only knew UTF-8 would bring in
    // replacement characters.
    const lines =
      'Am      F\nk\xf9\xf2 b\xec\x9e\xed\nC       G\nk\xf9\xf2 stoj\xed\n';
    await page.goto('songbooks');
    await importChordSheet(page, 'songbooks', {
      name: 'kun.txt',
      buffer: Buffer.from(lines, 'latin1'),
    });

    await page.getByTestId('rail-songs').click();
    await openSong(page, 'kun');
    await expect
      .poll(() => text(page))
      .toBe('[Am]kůň běží[F]\n[C]kůň stoj[G]í\n');
  });

  test('a ChordPro file dropped on the page goes to the preview', async ({
    page,
  }) => {
    await page
      .locator('app-import-drop-overlay')
      .waitFor({ state: 'attached' });
    const dataTransfer = await page.evaluateHandle(() => {
      const transfer = new DataTransfer();
      transfer.items.add(
        new File(['{title: Dropped}\n[C]Words\n'], 'dropped.cho', {
          type: 'text/plain',
        }),
      );
      return transfer;
    });
    await page.dispatchEvent('body', 'dragenter', { dataTransfer });
    await page.dispatchEvent('body', 'dragover', { dataTransfer });
    await page.dispatchEvent('body', 'drop', { dataTransfer });

    await expect(page.getByTestId('import-summary')).toBeVisible();
    await page.getByTestId('import-confirm').click();
    await expect(row(page, 'Dropped')).toHaveCount(1);
  });
});

test.describe('download as ChordPro', () => {
  test('a song goes out as a .cho and comes back as the same content', async ({
    page,
  }) => {
    // Ends in a newline, as the conversion's output always does: a song
    // without one comes back with one added.
    const song = '* Pluck\n** Band\n\n[Am]Words [F]here\n';
    await freshEditor(page);
    await paste(page, song);
    await expect.poll(() => text(page)).toBe(song);
    await page.getByTestId('editor-back').click();
    await expect(row(page, 'Pluck')).toHaveCount(1);

    await page.getByTestId('songs-download').click();
    await expect(page.getByTestId('download-dialog')).toBeVisible();
    const file = await download(page, () =>
      page.getByTestId('download-chordpro').click(),
    );

    expect(file.name).toMatch(/^achordeon-.+\.cho$/);
    expect(file.text).toContain('{title: Pluck}');
    expect(file.text).toContain('{subtitle: Band}');

    await freshLibrary(page);
    await importChordSheet(page, 'songs', {
      name: file.name,
      buffer: Buffer.from(file.text),
    });
    // The name travels in the file, so the song is the one that left.
    await openSong(page, 'New song');
    await expect.poll(() => text(page)).toBe(song);
  });

  test('a songbook goes out as one .cho, its songs in book order', async ({
    page,
  }) => {
    await importChordSheet(page, 'songs', {
      name: 'two.cho',
      buffer: Buffer.from(
        '{title: Zulu}\nLast\n{new_song}\n{title: Alpha}\nFirst\n',
      ),
    });
    await expect(page.getByTestId('song-row')).toHaveCount(2);

    await page.goto('songbooks');
    await page.getByTestId('songbooks-add').click();
    await expect(page).toHaveURL(/\/songbooks\/.+$/);
    // Zulu first: book order, not the alphabet.
    for (const name of ['Zulu', 'Alpha']) {
      await row(page, name).first().click();
      await page.getByTestId('add').click();
    }
    await expect(page.getByTestId('entry-row')).toHaveCount(2);

    await page.getByTestId('songbook-detail-download').click();
    await page.getByTestId('songbook-format').selectOption('chordpro');
    const file = await download(page, () =>
      page.getByTestId('songbook-download-confirm').click(),
    );

    expect(file.name).toMatch(/\.cho$/);
    const zulu = file.text.indexOf('{title: Zulu}');
    const between = file.text.indexOf('{new_song}');
    const alpha = file.text.indexOf('{title: Alpha}');
    expect(zulu).toBeGreaterThanOrEqual(0);
    expect(between).toBeGreaterThan(zulu);
    expect(alpha).toBeGreaterThan(between);
  });
});

test.describe('a song from a song site', () => {
  const SITES = [{ site: 1, name: 'Test site', urlHint: 'site.example' }];
  const PLUCK = {
    site: 1,
    title: 'Pluck',
    artist: 'Band',
    text: '{title: Pluck}\n{artist: Band}\n[Am]First words\n',
    versions: [
      {
        label: 'Version 1',
        text: '{title: Pluck}\n{artist: Band}\n[Am]First words\n',
      },
      {
        label: 'Capo 2',
        text: '{title: Pluck}\n{artist: Band}\n[C]Other words\n',
      },
    ],
    format: 'chordpro',
    url: 'https://site.example/pluck',
  };

  /**
   * Answer the song-sites function. `answer` gets the request body and returns
   * a status and a body; every call is counted by its action.
   */
  async function songSites(
    page: Page,
    answer: (body: { action: string; q?: string }) => {
      status: number;
      body: unknown;
    },
  ): Promise<Record<string, number>> {
    const calls: Record<string, number> = {};
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'POST, OPTIONS',
    };
    await page.route('**/functions/v1/song-sites', async (route: Route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: cors });
        return;
      }
      const body = route.request().postDataJSON();
      calls[body.action] = (calls[body.action] ?? 0) + 1;
      const { status, body: reply } = answer(body);
      await route.fulfill({
        status,
        headers: cors,
        contentType: 'application/json',
        body: JSON.stringify(reply),
      });
    });
    return calls;
  }

  const ok = (body: { action: string }) => ({
    status: 200,
    body:
      body.action === 'sites'
        ? SITES
        : body.action === 'search'
          ? [
              {
                site: 1,
                results: [{ id: 'pluck', title: 'Pluck', artist: 'Band' }],
              },
            ]
          : PLUCK,
  });

  test('search, preview, back to the same results, and import into the editor', async ({
    page,
  }) => {
    const calls = await songSites(page, ok);

    await page.getByTestId('songs-song-site').click();
    await expect(page.getByTestId('song-site-dialog')).toBeVisible();
    await page.getByTestId('song-site-query').fill('band');
    await page.getByTestId('song-site-search').click();

    const result = page.getByTestId('song-site-result');
    await expect(result).toHaveCount(1);
    await expect(page.getByTestId('song-site-group')).toContainText(
      'Test site',
    );
    await result.click();

    // The preview replaces the search, it does not stack on it (Q18).
    const preview = page.getByTestId('song-preview-dialog');
    await expect(preview).toBeVisible();
    await expect(page.getByTestId('song-site-dialog')).toBeHidden();
    await expect(page.getByTestId('song-preview-source')).toHaveAttribute(
      'href',
      PLUCK.url,
    );

    // Back is the same list, not a new search.
    await page.getByTestId('song-preview-back').click();
    await expect(page.getByTestId('song-site-query')).toHaveValue('band');
    await expect(result).toHaveCount(1);
    expect(calls['search']).toBe(1);

    // The second version is the one that comes in.
    await result.click();
    await page.getByTestId('song-preview-version').selectOption('1');
    await page.getByTestId('song-preview-import').click();

    await expect(page).toHaveURL(/\/songs\/.+\/edit$/);
    await expect(page.getByTestId('song-preview-dialog')).toBeHidden();
    await expect.poll(() => text(page)).toContain('[C]Other words');
    await page.getByTestId('editor-back').click();
    await expect(row(page, 'Pluck – Band')).toHaveCount(1);
  });

  test('says so when the searches run out', async ({ page }) => {
    await songSites(page, (body) =>
      body.action === 'search'
        ? { status: 429, body: { reason: 'rate-limited' } }
        : ok(body),
    );

    await page.getByTestId('songs-song-site').click();
    await page.getByTestId('song-site-query').fill('band');
    await page.getByTestId('song-site-search').click();

    await expect(page.getByTestId('song-site-failure')).toContainText(
      'Too many searches',
    );
  });

  test('offline, the button is off', async ({ page, context }) => {
    await expect(page.getByTestId('songs-song-site')).toBeEnabled();
    await context.setOffline(true);
    await expect(page.getByTestId('songs-song-site')).toBeDisabled();
    await context.setOffline(false);
    await expect(page.getByTestId('songs-song-site')).toBeEnabled();
  });
});
