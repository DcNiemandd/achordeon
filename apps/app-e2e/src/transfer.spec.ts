// Export / Import / Download — Epic 7
// Spec: PRD-INFRASTRUCTURE.md §8; PRD-RENDERING §3 (the svg2pdf guardrail)
//
// These are the tests that cannot be written anywhere else: rasterizing an SVG,
// registering a TTF with jsPDF and packing a ZIP all need a real browser, and
// the guardrail is a claim about the *bytes of the file* rather than about a
// call being made. So every assertion below reads the downloaded file.
//
// Selects only on `data-testid`, like every other suite here.

import { expect, test, type Download, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const ROOMY = { width: 1440, height: 900 };

/** A word from the starter content — what a rendered song must actually say. */
const TUTORIAL_WORD = 'brackets';

async function freshLibrary(page: Page): Promise<void> {
  await page.goto('songs');
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase('achordeon');
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => resolve();
      }),
  );
  await page.reload();
}

/** Create a song and name it, coming back to the explorer (creating opens the
 * editor). The row is found by name, never by position — the list is sorted. */
async function createSong(page: Page, name: string): Promise<void> {
  await page.getByTestId('songs-add').click();
  await expect(page).toHaveURL(/\/songs\/.+\/edit$/);
  await page.goBack();

  const row = page
    .getByTestId('song-row')
    .filter({ hasText: 'New song' })
    .first();
  await expect(row).toBeVisible();
  const id = await row.getAttribute('data-song-id');

  await row.hover();
  await page.getByTestId(`rename-${id}`).click();
  await page.getByTestId(`rename-input-${id}`).fill(name);
  await page.getByTestId(`rename-input-${id}`).press('Enter');
  await expect(
    page.getByTestId('song-row').filter({ hasText: name }),
  ).toHaveCount(1);
}

async function selectRow(page: Page, name: string): Promise<void> {
  const row = page.getByTestId('song-row').filter({ hasText: name }).first();
  const id = await row.getAttribute('data-song-id');
  await page.getByTestId(`select-${id}`).check();
}

/** The bytes of whatever the page just downloaded. */
async function bytesOf(download: Download): Promise<Buffer> {
  const path = await download.path();
  if (!path) throw new Error('The download produced no file.');
  return readFileSync(path);
}

/**
 * Press a control and hand back the file it produced.
 *
 * The render loop and the PDF are real work, so the wait is generous — the
 * alternative is a suite that fails on a slow machine and says nothing useful.
 */
async function download(page: Page, act: () => Promise<void>): Promise<Buffer> {
  const waiting = page.waitForEvent('download', { timeout: 30_000 });
  await act();
  return bytesOf(await waiting);
}

test.beforeEach(async ({ page }) => {
  // Force the anchor download, not the OS save picker. `showSaveFilePicker` is
  // native UI Playwright cannot drive — left in place it opens and blocks, and
  // no `download` event ever fires. Deleting it makes `saveFile` take its
  // fallback, which is the path that produces a file a test can read. The picker
  // itself is a browser-behaviour concern, not ours to test here.
  await page.addInitScript(() => {
    // @ts-expect-error deleting an optional platform API for the test
    delete window.showSaveFilePicker;
  });
  await page.setViewportSize(ROOMY);
  await freshLibrary(page);
});

test.describe('export & import', () => {
  test('exports the focused song as a readable library file', async ({
    page,
  }) => {
    await createSong(page, 'Alpha');
    const file = await download(page, () =>
      page.getByTestId('songs-export').click(),
    );

    const snapshot = JSON.parse(file.toString('utf8'));
    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.data.songs).toHaveLength(1);
    expect(snapshot.data.songs[0].name).toBe('Alpha');
    // The content, not a picture of it — this is the computer format.
    expect(snapshot.data.songs[0].content).toContain(TUTORIAL_WORD);
    // A file must never re-base the receiver's global render defaults.
    expect(snapshot.data.user).toEqual([]);
  });

  test('exports every ticked song, not just the focused one', async ({
    page,
  }) => {
    await createSong(page, 'Alpha');
    await createSong(page, 'Beta');
    await selectRow(page, 'Alpha');
    await selectRow(page, 'Beta');

    const file = await download(page, () =>
      page.getByTestId('songs-export').click(),
    );
    const names = JSON.parse(file.toString('utf8')).data.songs.map(
      (song: { name: string }) => song.name,
    );
    expect(names.sort()).toEqual(['Alpha', 'Beta']);
  });

  test('round-trips: an export imported into an empty library is the song again', async ({
    page,
  }) => {
    await createSong(page, 'Alpha');
    const file = await download(page, () =>
      page.getByTestId('songs-export').click(),
    );

    await freshLibrary(page);
    await expect(page.getByTestId('song-row')).toHaveCount(0);

    await page.getByTestId('songs-import-input').setInputFiles({
      name: 'library.json',
      mimeType: 'application/json',
      buffer: file,
    });
    await expect(page.getByTestId('import-summary')).toBeVisible();
    await page.getByTestId('import-confirm').click();

    await expect(
      page.getByTestId('song-row').filter({ hasText: 'Alpha' }),
    ).toHaveCount(1);
  });

  test('names the collisions and can keep both copies', async ({ page }) => {
    await createSong(page, 'Alpha');
    const file = await download(page, () =>
      page.getByTestId('songs-export').click(),
    );

    await page.getByTestId('songs-import-input').setInputFiles({
      name: 'library.json',
      mimeType: 'application/json',
      buffer: file,
    });
    // Named, not counted: which songs collide is what makes the choice
    // answerable at all.
    await expect(page.getByTestId('import-conflicts')).toContainText('1');
    await page.getByTestId('import-new').click();
    await page.getByTestId('import-confirm').click();

    await expect(
      page.getByTestId('song-row').filter({ hasText: 'Alpha' }),
    ).toHaveCount(2);
  });

  test('keeps mine when told to ignore', async ({ page }) => {
    await createSong(page, 'Alpha');
    const file = await download(page, () =>
      page.getByTestId('songs-export').click(),
    );

    await page.getByTestId('songs-import-input').setInputFiles({
      name: 'library.json',
      mimeType: 'application/json',
      buffer: file,
    });
    await page.getByTestId('import-ignore').click();
    await page.getByTestId('import-confirm').click();

    await expect(
      page.getByTestId('song-row').filter({ hasText: 'Alpha' }),
    ).toHaveCount(1);
  });

  test('says so, and writes nothing, when the file is not a library', async ({
    page,
  }) => {
    await createSong(page, 'Alpha');
    await page.getByTestId('songs-import-input').setInputFiles({
      name: 'notes.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"nope":true}'),
    });

    await expect(page.getByTestId('import-error-dialog')).toBeVisible();
    await expect(page.getByTestId('import-dialog')).toHaveCount(0);
    await page.getByTestId('import-error-close').click();
    await expect(
      page.getByTestId('song-row').filter({ hasText: 'Alpha' }),
    ).toHaveCount(1);
  });
});

test.describe('a row acts on itself', () => {
  test('a row exports just that song from its menu', async ({ page }) => {
    await createSong(page, 'Alpha');
    await createSong(page, 'Beta');

    const row = page.getByTestId('song-row').filter({ hasText: 'Alpha' });
    const id = await row.getAttribute('data-song-id');
    await row.hover();
    await page.getByTestId(`more-${id}`).click();

    const file = await download(page, () =>
      page.getByTestId(`export-${id}`).click(),
    );
    const names = JSON.parse(file.toString('utf8')).data.songs.map(
      (song: { name: string }) => song.name,
    );
    // Only the row's own song, not the selection and not the whole library.
    expect(names).toEqual(['Alpha']);
  });

  test('a row downloads just that song from its menu', async ({ page }) => {
    await createSong(page, 'Alpha');
    const row = page.getByTestId('song-row').filter({ hasText: 'Alpha' });
    const id = await row.getAttribute('data-song-id');
    await row.hover();
    await page.getByTestId(`more-${id}`).click();
    await page.getByTestId(`download-${id}`).click();

    // The row's menu opens the same format dialog the bulk button does.
    await expect(page.getByTestId('download-dialog')).toBeVisible();
    const file = await download(page, () =>
      page.getByTestId('download-pdf').click(),
    );
    expect(file.toString('latin1').startsWith('%PDF-')).toBe(true);
  });
});

test.describe('download a song', () => {
  test('the PNG is a PNG, and carries the song inside it', async ({ page }) => {
    await createSong(page, 'Alpha');
    await page.getByTestId('songs-download').click();
    const file = await download(page, () =>
      page.getByTestId('download-png').click(),
    );

    expect(file.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    // The tEXt chunk: one file that is both the picture and the song.
    const text = file.toString('latin1');
    expect(text).toContain('achordeon');
    expect(text).toContain('"schemaVersion"');
  });

  test('a downloaded PNG imports back as the song it pictures', async ({
    page,
  }) => {
    await createSong(page, 'Alpha');
    await page.getByTestId('songs-download').click();
    const file = await download(page, () =>
      page.getByTestId('download-png').click(),
    );

    await freshLibrary(page);
    await page.getByTestId('songs-import-input').setInputFiles({
      name: 'alpha.png',
      mimeType: 'image/png',
      buffer: file,
    });
    await page.getByTestId('import-confirm').click();

    await expect(
      page.getByTestId('song-row').filter({ hasText: 'Alpha' }),
    ).toHaveCount(1);
  });

  /**
   * **The §3 guardrail, as a test.** The spike proved svg2pdf could do this; this
   * proves the production pipeline still does, on every run:
   *
   * - the text is **text**, not outlines and not a raster image, so it can be
   *   selected and searched;
   * - the font is **embedded** (`/FontFile2` — a TrueType font file inside the
   *   PDF), because the PDF path has no generic fallback and a missing
   *   registration silently becomes Helvetica, with every chord landing over the
   *   wrong character.
   */
  test('the PDF is vector, with selectable text and an embedded font', async ({
    page,
  }) => {
    await createSong(page, 'Alpha');
    await page.getByTestId('songs-download').click();
    const file = await download(page, () =>
      page.getByTestId('download-pdf').click(),
    );

    const raw = file.toString('latin1');
    expect(raw.startsWith('%PDF-')).toBe(true);
    expect(raw).toContain('/FontFile2');
    // Real glyphs drawn as text operators, and no raster page behind them.
    expect(raw).toMatch(/\bTj|\bTJ/);
    expect(raw).not.toContain('/Subtype /Image');
  });

  test('several songs pack into one ZIP', async ({ page }) => {
    await createSong(page, 'Alpha');
    await createSong(page, 'Beta');
    await selectRow(page, 'Alpha');
    await selectRow(page, 'Beta');

    await page.getByTestId('songs-download').click();
    const file = await download(page, () =>
      page.getByTestId('download-zip-pdf').click(),
    );

    expect(file.subarray(0, 2).toString('latin1')).toBe('PK');
    const raw = file.toString('latin1');
    expect(raw).toContain('Alpha.pdf');
    expect(raw).toContain('Beta.pdf');
  });

  test('several songs can be one document instead', async ({ page }) => {
    await createSong(page, 'Alpha');
    await createSong(page, 'Beta');
    await selectRow(page, 'Alpha');
    await selectRow(page, 'Beta');

    await page.getByTestId('songs-download').click();
    const file = await download(page, () =>
      page.getByTestId('download-pdf').click(),
    );

    const raw = file.toString('latin1');
    expect(raw.startsWith('%PDF-')).toBe(true);
    expect(countPages(raw)).toBe(2);
  });
});

test.describe('download a songbook', () => {
  test('the PDF is the title page plus a page per song', async ({ page }) => {
    await createSong(page, 'Alpha');
    await createSong(page, 'Beta');

    await page.goto('songbooks');
    await page.getByTestId('songbooks-add').click();
    await expect(page).toHaveURL(/\/songbooks\/.+$/);

    // Add both songs to the new book, from the library pane.
    for (const name of ['Alpha', 'Beta']) {
      await page
        .getByTestId('song-row')
        .filter({ hasText: name })
        .first()
        .click();
      await page.getByTestId('add-end').click();
    }
    await expect(page.getByTestId('entry-row')).toHaveCount(2);

    await page.getByTestId('songbook-detail-download').click();
    const file = await download(page, () =>
      page.getByTestId('songbook-download-confirm').click(),
    );

    const raw = file.toString('latin1');
    expect(raw.startsWith('%PDF-')).toBe(true);
    // Title page + two songs. The title page is a render like any other, which
    // is why it costs a page rather than a header.
    expect(countPages(raw)).toBe(3);
    expect(raw).toContain('/FontFile2');
  });

  test('drops the title page when it is switched off', async ({ page }) => {
    await createSong(page, 'Alpha');
    await page.goto('songbooks');
    await page.getByTestId('songbooks-add').click();
    await page.getByTestId('song-row').filter({ hasText: 'Alpha' }).click();
    await page.getByTestId('add-end').click();

    await page.getByTestId('songbook-detail-download').click();
    await page.getByTestId('pdf-title-page').uncheck();
    const file = await download(page, () =>
      page.getByTestId('songbook-download-confirm').click(),
    );

    expect(countPages(file.toString('latin1'))).toBe(1);
  });

  test('the summary is typeset in an embedded face and links to the songs', async ({
    page,
  }) => {
    // A Czech name, because that is the failure this guards: jsPDF's built-in
    // Helvetica is WinAnsi and has no `ě ř ů`, so a summary drawn in it comes
    // out with holes while the songs beside it are perfect.
    // jsPDF does not throw when `setFont` names a face it cannot find — it logs
    // and quietly falls back to Helvetica, which is the exact failure this test
    // exists to catch. So the log is part of the assertion.
    const complaints: string[] = [];
    page.on('console', (message) => {
      if (/font/i.test(message.text())) complaints.push(message.text());
    });

    await createSong(page, 'Řeka ěščř');
    await page.goto('songbooks');
    await page.getByTestId('songbooks-add').click();
    await page.getByTestId('song-row').filter({ hasText: 'Řeka' }).click();
    await page.getByTestId('add-end').click();

    await page.getByTestId('songbook-detail-download').click();
    await page.getByTestId('pdf-summary').check();
    const file = await download(page, () =>
      page.getByTestId('songbook-download-confirm').click(),
    );

    const raw = file.toString('latin1');
    // Title page + summary + the song.
    expect(countPages(raw)).toBe(3);
    // The body face is embedded — which is what the summary is set in. (jsPDF
    // always lists Helvetica in its catalog whether or not anything uses it, so
    // the absence of a fallback cannot be asserted; the presence of the real
    // face can.)
    expect(raw).toContain('/FontFile2');
    // The contents list is clickable: an internal link annotation per entry.
    expect(raw).toContain('/Link');
    expect(complaints).toEqual([]);
  });

  test('All songs offers no download or export — it has no ⋯ menu at all', async ({
    page,
  }) => {
    await createSong(page, 'Alpha');
    await page.goto('songbooks');
    const all = page
      .getByTestId('songbook-row')
      .filter({ hasText: 'All songs' });
    const id = await all.getAttribute('data-song-id');
    await all.hover();
    // The read-only virtual book has no record, so no title page, author or
    // order to print — and the row menu (where download and export live) is not
    // built for it.
    await expect(page.getByTestId(`more-${id}`)).toHaveCount(0);

    // A real songbook does have it.
    await page.getByTestId('songbooks-add').click();
    await expect(page).toHaveURL(/\/songbooks\/.+$/);
    await page.goto('songbooks');
    const real = page.getByTestId('songbook-row').filter({
      hasText: 'New songbook',
    });
    const realId = await real.getAttribute('data-song-id');
    await real.hover();
    await expect(page.getByTestId(`more-${realId}`)).toBeVisible();
  });
});

/** Pages in an uncompressed PDF — `/Type /Page` without the `/Pages` node. */
function countPages(raw: string): number {
  return (raw.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}
