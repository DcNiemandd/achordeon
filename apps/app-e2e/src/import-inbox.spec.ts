// Importing from a link, and from a file dropped anywhere — plan §4 / §7
//
// These are the two transports that belong to no page, so they are the ones a
// per-module test could never have covered: a link is read wherever the user
// lands, and a drop can happen on a screen that mounts no import panel at all.
//
// Every envelope below is HAND-WRITTEN — a version, two arrays, and per song a
// name and its content — which is also what makes these a test of the import
// boundary's tolerance (ADR-0014). Nothing here writes a complete record.
//
// Selects only on `data-testid`, like every other suite here.

import { expect, test, type Page } from '@playwright/test';
import { createSong } from './create-song';

/** The shortest valid Achordeon file: one song, nothing but what it needs. */
function envelope(...names: string[]): string {
  return JSON.stringify({
    schemaVersion: 1,
    data: {
      songs: names.map((name) => ({ name, content: `* ${name}` })),
      songbooks: [],
    },
  });
}

/** The plain form — the one a model can actually write (`j1`). */
function linkFragment(json: string): string {
  return `#j1=${encodeURIComponent(json)}`;
}

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

/**
 * Drop files on the window.
 *
 * Native HTML5 drag-and-drop has no Playwright shorthand for files coming from
 * outside the page, so the `DataTransfer` is built in the page and the events are
 * dispatched by hand. `body`, not a zone: the listeners are on the window, and
 * that is the point of the feature.
 */
async function dropFiles(
  page: Page,
  files: { name: string; content: string }[],
): Promise<void> {
  // The listeners are the app's, so they have to exist before the events fire.
  // Dispatching at a booting page succeeds silently and lands nowhere, which is
  // the one way this helper can lie.
  await page.locator('app-import-drop-overlay').waitFor({ state: 'attached' });
  const dataTransfer = await page.evaluateHandle((given) => {
    const transfer = new DataTransfer();
    for (const file of given) {
      transfer.items.add(
        new File([file.content], file.name, { type: 'application/json' }),
      );
    }
    return transfer;
  }, files);
  await page.dispatchEvent('body', 'dragenter', { dataTransfer });
  await page.dispatchEvent('body', 'dragover', { dataTransfer });
  await page.dispatchEvent('body', 'drop', { dataTransfer });
}

const row = (page: Page, name: string) =>
  page.getByTestId('song-row').filter({ hasText: name });

test.describe('a link carrying a song', () => {
  test('a cold load with a payload opens the preview', async ({ page }) => {
    await freshLibrary(page);
    await page.goto(`songs${linkFragment(envelope('Linked'))}`);

    await expect(page.getByTestId('import-summary')).toBeVisible();
    await page.getByTestId('import-confirm').click();
    await expect(row(page, 'Linked')).toHaveCount(1);
  });

  test('a payload arriving while the app is already running opens it too', async ({
    page,
  }) => {
    // The shape that gets missed: a navigation carrying a fragment rather than a
    // boot — the PWA already open, or a URL pasted into the address bar. A
    // one-shot read of `location.hash` at startup would catch only the other one.
    await freshLibrary(page);
    await expect(page.getByTestId('import-dialog')).toHaveCount(0);

    await page.goto(`songs${linkFragment(envelope('Pasted'))}`);
    await expect(page.getByTestId('import-summary')).toBeVisible();
    await page.getByTestId('import-confirm').click();
    await expect(row(page, 'Pasted')).toHaveCount(1);
  });

  test('the URL is clean before the dialog is answered', async ({ page }) => {
    // Cleared as soon as it is read: the payload is in memory by then, and left
    // in the address bar it gets bookmarked or copied by accident.
    await freshLibrary(page);
    await page.goto(`songs${linkFragment(envelope('Transient'))}`);

    await expect(page.getByTestId('import-summary')).toBeVisible();
    expect(page.url()).not.toContain('j1=');
    expect(new URL(page.url()).hash).toBe('');
  });

  test('a reload does not import it a second time', async ({ page }) => {
    await freshLibrary(page);
    await page.goto(`songs${linkFragment(envelope('Once'))}`);
    await page.getByTestId('import-confirm').click();
    await expect(row(page, 'Once')).toHaveCount(1);

    await page.reload();
    await expect(page.getByTestId('import-dialog')).toHaveCount(0);
    await expect(row(page, 'Once')).toHaveCount(1);
  });

  test('cancelling loses nothing but the import', async ({ page }) => {
    await freshLibrary(page);
    await page.goto(`songs${linkFragment(envelope('Declined'))}`);
    await page.getByTestId('import-cancel').click();

    await expect(page.getByTestId('import-dialog')).toHaveCount(0);
    await expect(row(page, 'Declined')).toHaveCount(0);
  });

  test('a payload that does not decode gets the ordinary failure dialog', async ({
    page,
  }) => {
    await freshLibrary(page);
    await page.goto('songs#z1=not-gzip-at-all');

    await expect(page.getByTestId('import-error-dialog')).toBeVisible();
    await page.getByTestId('import-error-close').click();
    await expect(page.getByTestId('song-row')).toHaveCount(0);
  });
});

test.describe('what arrived, not just how much', () => {
  test('a song whose markup is wrong is named before it is written', async ({
    page,
  }) => {
    // Two title lines: only the last shows and the first is silently lost.
    // Import compares ids and never looks at the content, so without this the
    // song lands quietly and is discovered on the page.
    await freshLibrary(page);
    const file = JSON.stringify({
      schemaVersion: 1,
      data: {
        songs: [
          { name: 'Muddled', content: '* First\n* Second\n\nSome words' },
          { name: 'Clean', content: '* Fine\n\nSome [Am]words' },
        ],
        songbooks: [],
      },
    });
    await page.goto(`songs${linkFragment(file)}`);

    await expect(page.getByTestId('import-flagged')).toContainText('1');
    await page.getByTestId('import-confirm').click();
    // It still imports — the point is to look afterwards, not to be stopped.
    await expect(row(page, 'Muddled')).toHaveCount(1);
  });

  test('a clean file says nothing about markup', async ({ page }) => {
    await freshLibrary(page);
    await page.goto(`songs${linkFragment(envelope('Tidy'))}`);

    await expect(page.getByTestId('import-summary')).toBeVisible();
    await expect(page.getByTestId('import-flagged')).toHaveCount(0);
  });
});

test.describe('sharing a song as a link', () => {
  test('the link the app writes is the link the app reads', async ({
    page,
    context,
  }) => {
    // The round trip worth having above all the others: build a link with §5,
    // open it with §4, and assert the song that lands is the song that left. It
    // exercises the encoder, the reader, `normalise`, `migrate` and `planImport`
    // in one test.
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await freshLibrary(page);
    await createSong(page, 'Shared');

    await page.getByTestId('songs-download').click();
    const copy = page.getByTestId('download-share-link');
    await expect(copy).toBeEnabled();
    await copy.click();

    const url = await page.evaluate(() => navigator.clipboard.readText());
    expect(url).toContain('#z1=');

    // A different library entirely — the link has to carry the song, not point
    // at it.
    await freshLibrary(page);
    await expect(page.getByTestId('song-row')).toHaveCount(0);
    await page.goto(`songs${new URL(url).hash}`);

    await expect(page.getByTestId('import-summary')).toBeVisible();
    await page.getByTestId('import-confirm').click();
    await expect(row(page, 'Shared')).toHaveCount(1);
  });
});

test.describe('a file dropped on the page', () => {
  test('imports from anywhere in the window', async ({ page }) => {
    await freshLibrary(page);
    await dropFiles(page, [
      { name: 'a.achordeon', content: envelope('Dropped') },
    ]);

    await expect(page.getByTestId('import-summary')).toBeVisible();
    await page.getByTestId('import-confirm').click();
    await expect(row(page, 'Dropped')).toHaveCount(1);
  });

  test('works on a page that mounts no import panel', async ({ page }) => {
    // The case the app-level owner exists for. Settings has an Import button for
    // nothing — it has a restore picker, which is a different act entirely — so
    // before this there was nobody on the page to hand the file to.
    await freshLibrary(page);
    await page.goto('settings');
    await expect(page.getByTestId('songs-import-input')).toHaveCount(0);

    await dropFiles(page, [
      { name: 'a.achordeon', content: envelope('FromSettings') },
    ]);
    await expect(page.getByTestId('import-summary')).toBeVisible();
    await page.getByTestId('import-confirm').click();
    // The dialog closes when the write is done — navigating before that would
    // abandon it mid-flight, which is a race in the test rather than in the app.
    await expect(page.getByTestId('import-dialog')).toHaveCount(0);

    // Always Import, never Restore: a dropped file is someone handing you songs.
    await page.goto('songs');
    await expect(row(page, 'FromSettings')).toHaveCount(1);
  });

  test('several files are previewed one after another', async ({ page }) => {
    await freshLibrary(page);
    await dropFiles(page, [
      { name: 'a.achordeon', content: envelope('First') },
      { name: 'b.achordeon', content: envelope('Second') },
    ]);

    await expect(page.getByTestId('import-summary')).toContainText('1');
    await page.getByTestId('import-confirm').click();
    // The second file's preview, not a closed dialog.
    await expect(page.getByTestId('import-summary')).toBeVisible();
    await page.getByTestId('import-confirm').click();

    await expect(page.getByTestId('import-dialog')).toHaveCount(0);
    await expect(row(page, 'First')).toHaveCount(1);
    await expect(row(page, 'Second')).toHaveCount(1);
  });

  test('cancel means "not this one" — the queue moves on', async ({ page }) => {
    await freshLibrary(page);
    await dropFiles(page, [
      { name: 'a.achordeon', content: envelope('Unwanted') },
      { name: 'b.achordeon', content: envelope('Wanted') },
    ]);

    await page.getByTestId('import-cancel').click();
    await expect(page.getByTestId('import-summary')).toBeVisible();
    await page.getByTestId('import-confirm').click();

    await expect(row(page, 'Wanted')).toHaveCount(1);
    await expect(row(page, 'Unwanted')).toHaveCount(0);
  });

  test('"cancel all" leaves everything still waiting', async ({ page }) => {
    await freshLibrary(page);
    await dropFiles(page, [
      { name: 'a.achordeon', content: envelope('Keep') },
      { name: 'b.achordeon', content: envelope('Skip') },
      { name: 'c.achordeon', content: envelope('Never') },
    ]);

    // Two behind this one, so the way out offers all three.
    await expect(page.getByTestId('import-cancel-all')).toHaveText(/3/);
    await page.getByTestId('import-confirm').click(); // Keep

    // One behind this one now — and cancelling all takes both.
    await expect(page.getByTestId('import-cancel-all')).toHaveText(/2/);
    await page.getByTestId('import-cancel-all').click();

    await expect(page.getByTestId('import-dialog')).toHaveCount(0);
    await expect(row(page, 'Keep')).toHaveCount(1);
    await expect(row(page, 'Skip')).toHaveCount(0);
    await expect(row(page, 'Never')).toHaveCount(0);
  });

  test('a single file offers no "cancel all" — there is nothing to cancel', async ({
    page,
  }) => {
    await freshLibrary(page);
    await dropFiles(page, [{ name: 'a.achordeon', content: envelope('Solo') }]);

    await expect(page.getByTestId('import-summary')).toBeVisible();
    await expect(page.getByTestId('import-cancel-all')).toHaveCount(0);
  });

  test('the overlay says what a drop would do, and gets out of the way', async ({
    page,
  }) => {
    await freshLibrary(page);
    await page
      .locator('app-import-drop-overlay')
      .waitFor({ state: 'attached' });
    const dataTransfer = await page.evaluateHandle(() => {
      const transfer = new DataTransfer();
      transfer.items.add(new File(['{}'], 'x.achordeon'));
      return transfer;
    });
    await page.dispatchEvent('body', 'dragenter', { dataTransfer });
    await expect(page.getByTestId('import-drop-overlay')).toBeVisible();

    await page.dispatchEvent('body', 'dragleave', { dataTransfer });
    await expect(page.getByTestId('import-drop-overlay')).toHaveCount(0);
  });
});
