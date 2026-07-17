// Song explorer smoke — Epic 5
// Spec: CONTEXT.md §Song explorer; PRD-UI-SHELL.md §4
//
// Selects only on `data-testid`, like the shell suite: this is the proof that the
// explorer's seam holds when the temporary UI is replaced. Assert behaviour, not
// looks.
//
// Every test starts from a clean library — IndexedDB survives a reload, so
// without this each test would inherit the previous one's songs.

import { expect, test, type Page } from '@playwright/test';

const ROOMY = { width: 1440, height: 900 };
const COMPACT = { width: 390, height: 844 };

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
 * Create a song, name it, and come back to the explorer — creating opens the
 * editor.
 *
 * The new row is found by its default name, never by position: the list is
 * sorted, so "the one I just made" is not "the last one".
 */
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

/**
 * Put a songbook holding `songName` into IndexedDB directly.
 *
 * The Songbooks module is Epic 6, so there is no UI to build one with yet — but
 * the delete cascade and its warning are Epic 5's, and they are only real if a
 * songbook actually references the song. Writing the row is the smallest way to
 * tell the truth here; when Epic 6 lands, this becomes a UI flow.
 */
async function seedSongbook(
  page: Page,
  bookName: string,
  songName: string,
): Promise<void> {
  const songId = await page
    .getByTestId('song-row')
    .filter({ hasText: songName })
    .first()
    .getAttribute('data-song-id');

  await page.evaluate(
    ({ book, song }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('achordeon');
        open.onsuccess = () => {
          const db = open.result;
          const now = Date.now();
          const tx = db.transaction('songbooks', 'readwrite');
          tx.objectStore('songbooks').put({
            id: crypto.randomUUID(),
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
            name: book,
            title: '',
            subtitle: '',
            author: '',
            settings: {},
            entries: [song],
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        open.onerror = () => reject(open.error);
      }),
    { book: bookName, song: songId },
  );
  await page.reload();
}

test.describe('song explorer', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(ROOMY);
    await freshLibrary(page);
  });

  test('an empty library shows the empty state, not an empty list', async ({
    page,
  }) => {
    await expect(page.getByTestId('explorer-empty')).toBeVisible();
    await expect(page.getByTestId('explorer-list')).toHaveCount(0);
  });

  test('creates a song and opens it in the editor', async ({ page }) => {
    await page.getByTestId('songs-add').click();

    await expect(page).toHaveURL(/\/songs\/.+\/edit$/);
    await page.goBack();
    await expect(page.getByTestId('song-row')).toHaveCount(1);
  });

  test('renames a song in place, and the rename survives a reload', async ({
    page,
  }) => {
    await createSong(page, 'Wonderwall');
    await expect(page.getByTestId('song-row')).toContainText('Wonderwall');

    await page.reload();
    await expect(page.getByTestId('song-row')).toContainText('Wonderwall');
  });

  test('duplicates a song into a second, independent row', async ({ page }) => {
    await createSong(page, 'Wonderwall');
    const id = await page.getByTestId('song-row').getAttribute('data-song-id');

    await page.getByTestId('song-row').hover();
    await page.getByTestId(`duplicate-${id}`).click();

    await expect(page.getByTestId('song-row')).toHaveCount(2);
    await expect(page.getByTestId('song-row').nth(1)).toContainText('(copy)');
  });

  test('favorites a song, and the flag survives a reload', async ({ page }) => {
    await createSong(page, 'Wonderwall');
    const id = await page.getByTestId('song-row').getAttribute('data-song-id');

    await page.getByTestId(`favorite-${id}`).click();
    await expect(page.getByTestId(`favorite-${id}`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.reload();
    await expect(page.getByTestId(`favorite-${id}`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('search filters the list and rides in the URL', async ({ page }) => {
    await createSong(page, 'Wonderwall');
    await createSong(page, 'Yesterday');
    await expect(page.getByTestId('song-row')).toHaveCount(2);

    await page.getByTestId('explorer-search').fill('yester');

    await expect(page.getByTestId('song-row')).toHaveCount(1);
    await expect(page.getByTestId('song-row')).toContainText('Yesterday');
    // The URL is the source of truth: a reload lands on the same list.
    await expect(page).toHaveURL(/[?&]q=yester/);
    await page.reload();
    await expect(page.getByTestId('song-row')).toHaveCount(1);
  });

  test('a search matching nothing says so, rather than looking empty', async ({
    page,
  }) => {
    await createSong(page, 'Wonderwall');
    await page.getByTestId('explorer-search').fill('zzzz');

    await expect(page.getByTestId('explorer-empty')).toBeVisible();
  });

  test('sorting rides in the URL and reorders the list', async ({ page }) => {
    await createSong(page, 'Zeta');
    await createSong(page, 'Alpha');

    await expect(page.getByTestId('song-row').first()).toContainText('Alpha');

    await page.getByTestId('explorer-sort').selectOption('created');
    await expect(page).toHaveURL(/[?&]sort=created/);
    // Newest-first is the natural default for a date axis.
    await expect(page.getByTestId('song-row').first()).toContainText('Alpha');

    await page.getByTestId('explorer-sort-dir').click();
    await expect(page.getByTestId('song-row').first()).toContainText('Zeta');
  });

  test('multi-select drives the bulk bar', async ({ page }) => {
    await createSong(page, 'Wonderwall');
    await createSong(page, 'Yesterday');
    const first = await page
      .getByTestId('song-row')
      .first()
      .getAttribute('data-song-id');

    await expect(page.getByTestId('explorer-bulk')).toHaveCount(0);

    await page.getByTestId(`select-${first}`).check();
    await expect(page.getByTestId('explorer-bulk')).toBeVisible();

    await page.getByTestId('explorer-bulk-clear').click();
    await expect(page.getByTestId('explorer-bulk')).toHaveCount(0);
  });

  test('bulk favorite sets, never toggles', async ({ page }) => {
    await createSong(page, 'Wonderwall');
    await createSong(page, 'Yesterday');
    const ids = await page
      .getByTestId('song-row')
      .evaluateAll((rows) =>
        rows.map((row) => row.getAttribute('data-song-id')),
      );

    // One is already a favorite: a toggle would turn it back off.
    await page.getByTestId(`favorite-${ids[0]}`).click();
    await page.getByTestId(`select-${ids[0]}`).check();
    await page.getByTestId(`select-${ids[1]}`).check();
    await page.getByTestId('explorer-bulk-favorite').click();

    for (const id of ids) {
      await expect(page.getByTestId(`favorite-${id}`)).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    }
  });

  test('auto-selects the most recently updated song on entry', async ({
    page,
  }) => {
    await createSong(page, 'Wonderwall');
    await createSong(page, 'Yesterday');
    // Sorted by name, so the newest song is NOT the first row — which is the
    // whole reason `live()[0]` could not answer this.
    await page.reload();

    await expect(page.getByTestId('song-row').nth(1)).toHaveClass(/is-current/);
  });

  test('delete asks first, and cancelling keeps the song', async ({ page }) => {
    await createSong(page, 'Wonderwall');
    const id = await page.getByTestId('song-row').getAttribute('data-song-id');

    await page.getByTestId('song-row').hover();
    await page.getByTestId(`delete-${id}`).click();
    await expect(page.getByTestId('delete-dialog')).toBeVisible();
    // Nothing is in use, so no warning is shown.
    await expect(page.getByTestId('delete-in-use')).toHaveCount(0);

    await page.getByTestId('delete-cancel').click();
    await expect(page.getByTestId('song-row')).toHaveCount(1);
  });

  test('confirming deletes the song for good', async ({ page }) => {
    await createSong(page, 'Wonderwall');
    const id = await page.getByTestId('song-row').getAttribute('data-song-id');

    await page.getByTestId('song-row').hover();
    await page.getByTestId(`delete-${id}`).click();
    await page.getByTestId('delete-confirm').click();

    await expect(page.getByTestId('explorer-empty')).toBeVisible();
    // A tombstone is a delete, not a hide: it must survive a reload as gone.
    await page.reload();
    await expect(page.getByTestId('explorer-empty')).toBeVisible();
  });

  test('warns when the song is in use, and links to the songbook', async ({
    page,
  }) => {
    await createSong(page, 'Wonderwall');
    await seedSongbook(page, 'Campfire', 'Wonderwall');
    const id = await page.getByTestId('song-row').getAttribute('data-song-id');

    await page.getByTestId('song-row').hover();
    await page.getByTestId(`delete-${id}`).click();

    await expect(page.getByTestId('delete-in-use')).toBeVisible();
    const link = page.getByTestId(/^in-use-/);
    await expect(link).toContainText('Campfire');

    // The link opens the songbook instead of deleting anything.
    await link.click();
    await expect(page).toHaveURL(/\/songbooks\/.+$/);
    await page.goBack();
    await expect(page.getByTestId('song-row')).toHaveCount(1);
  });

  test('deleting cascades the song out of every songbook', async ({ page }) => {
    await createSong(page, 'Wonderwall');
    await seedSongbook(page, 'Campfire', 'Wonderwall');
    const id = await page.getByTestId('song-row').getAttribute('data-song-id');

    await page.getByTestId('song-row').hover();
    await page.getByTestId(`delete-${id}`).click();
    await page.getByTestId('delete-confirm').click();
    await expect(page.getByTestId('explorer-empty')).toBeVisible();

    // The songbook must not be left holding a slot pointing at a tombstone.
    const entries = await page.evaluate(
      () =>
        new Promise<string[][]>((resolve, reject) => {
          const open = indexedDB.open('achordeon');
          open.onsuccess = () => {
            const db = open.result;
            const request = db
              .transaction('songbooks')
              .objectStore('songbooks')
              .getAll();
            request.onsuccess = () => {
              db.close();
              resolve(request.result.map((book) => book.entries));
            };
            request.onerror = () => reject(request.error);
          };
          open.onerror = () => reject(open.error);
        }),
    );
    expect(entries).toEqual([[]]);
  });

  test('bulk delete warns once for the whole selection', async ({ page }) => {
    await createSong(page, 'Wonderwall');
    await createSong(page, 'Yesterday');
    const ids = await page
      .getByTestId('song-row')
      .evaluateAll((rows) =>
        rows.map((row) => row.getAttribute('data-song-id')),
      );

    await page.getByTestId(`select-${ids[0]}`).check();
    await page.getByTestId(`select-${ids[1]}`).check();
    await page.getByTestId('explorer-bulk-delete').click();
    await page.getByTestId('delete-confirm').click();

    await expect(page.getByTestId('explorer-empty')).toBeVisible();
    // The selection went with the songs — the bulk bar has nothing left to act on.
    await expect(page.getByTestId('explorer-bulk')).toHaveCount(0);
  });

  test('below the breakpoint: the explorer is full width, with no render pane', async ({
    page,
  }) => {
    await createSong(page, 'Wonderwall');
    await page.setViewportSize(COMPACT);

    await expect(page.getByTestId('pane-a')).toBeVisible();
    // There is no second pane to switch to until a song is open (§4).
    await expect(page.getByTestId('pane-b')).toBeHidden();
    await expect(page.getByTestId('split-resizer')).toHaveCount(0);
  });
});
