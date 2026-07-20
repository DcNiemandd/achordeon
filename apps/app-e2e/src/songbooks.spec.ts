// Songbooks module smoke — Epic 6
// Spec: CONTEXT.md §Songbook, §Delete vs Remove; songbooks/index.mdx
//
// Selects only on `data-testid`, like the rest of the suite: the proof that the
// seam holds when the temporary UI is replaced. Assert behaviour, not looks.

import { expect, test, type Page } from '@playwright/test';

const ROOMY = { width: 1440, height: 900 };

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

/** Create a song and rename it, then come back — creating opens the editor. */
async function createSong(page: Page, name: string): Promise<void> {
  await page.goto('songs');
  await page.getByTestId('songs-add').click();
  const title = page.getByTestId('module-title-input');
  await expect(title).toHaveValue('New song');
  await title.fill(name);
  await title.press('Enter');
  // The editor's autosave is keystroke-debounced; the rename must have landed
  // before we navigate away from it.
  await page.waitForTimeout(700);
  await page.goto('songs');
  await expect(
    page.getByTestId('song-row').filter({ hasText: name }),
  ).toHaveCount(1);
}

/**
 * A songbook, created and named. Creating one opens it, like creating a song.
 *
 * The heading is waited for before it is typed into: it is a field bound to the
 * loaded record, so filling it before the record lands would have the arriving
 * name overwrite what was typed.
 */
async function createSongbook(page: Page, name: string): Promise<void> {
  await page.goto('songbooks');
  await page.getByTestId('songbooks-add').click();
  await expect(page).toHaveURL(/\/songbooks\/.+$/);

  const title = page.getByTestId('module-title-input');
  await expect(title).toHaveValue('New songbook');
  await title.fill(name);
  await title.press('Enter');
  await expect(title).toHaveValue(name);
}

/**
 * Tick songs in the left explorer and add them at `where`.
 *
 * The checkbox is the multi-select gesture; a click on the row body would
 * replace the whole selection with that one row.
 */
async function addSongs(
  page: Page,
  names: string[],
  where: 'start' | 'above' | 'below' | 'end',
): Promise<void> {
  for (const name of names) {
    const row = page.getByTestId('song-row').filter({ hasText: name }).first();
    const id = await row.getAttribute('data-song-id');
    await page.getByTestId(`select-${id}`).check();
  }

  const add = page.getByTestId(`add-${where}`);
  await expect(add).toBeEnabled();
  await add.click();
  // Adding clears the library selection, so the next add starts clean.
  await expect(add).toBeDisabled();
}

test.describe('songbooks', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(ROOMY);
    await freshLibrary(page);
  });

  // Always present, and never absent from the list: it IS the library.
  test('All songs is always listed, and cannot be renamed or deleted', async ({
    page,
  }) => {
    await page.goto('songbooks');

    await expect(page.getByTestId('songbook-row')).toHaveCount(1);
    await expect(page.getByTestId('songbook-open-all-songs')).toBeVisible();
    await expect(page.getByTestId('songbook-rename-all-songs')).toHaveCount(0);
    await expect(page.getByTestId('songbook-delete-all-songs')).toHaveCount(0);
    // "No songbooks yet" is about the ones you make — All songs is not one.
    await expect(page.getByTestId('songbooks-empty')).toBeVisible();
  });

  test('All songs holds the whole library, read-only', async ({ page }) => {
    await createSong(page, 'Wonderwall');
    await createSong(page, 'Yesterday');

    await page.goto('songbooks');
    await page.getByTestId('songbook-open-all-songs').click();

    await expect(page.getByTestId('entry-row')).toHaveCount(2);
    // No reorder strip, no per-row remove, nothing to add with.
    await expect(page.getByTestId('entry-tools')).toHaveCount(0);
    await expect(page.getByTestId('songbook-add')).toHaveCount(0);
    await expect(page.getByTestId('entry-remove-0')).toHaveCount(0);
  });

  test('creates a songbook, names it, and it survives a reload', async ({
    page,
  }) => {
    await createSongbook(page, 'Campfire');

    await page.goto('songbooks');
    await expect(
      page.getByTestId('songbook-row').filter({ hasText: 'Campfire' }),
    ).toHaveCount(1);
  });

  test('the left explorer is reduced: no edit, rename, duplicate or delete', async ({
    page,
  }) => {
    await createSong(page, 'Wonderwall');
    await createSongbook(page, 'Campfire');

    const row = page.getByTestId('song-row').first();
    const id = await row.getAttribute('data-song-id');
    await row.hover();

    await expect(page.getByTestId(`edit-${id}`)).toHaveCount(0);
    await expect(page.getByTestId(`rename-${id}`)).toHaveCount(0);
    await expect(page.getByTestId(`duplicate-${id}`)).toHaveCount(0);
    await expect(page.getByTestId(`delete-${id}`)).toHaveCount(0);
    // What stays: search, sort, select and favorite.
    await expect(page.getByTestId('explorer-search')).toBeVisible();
    await expect(page.getByTestId(`favorite-${id}`)).toBeVisible();
    await expect(page.getByTestId(`select-${id}`)).toBeVisible();
  });

  test('adds selected songs, and the same song may fill several slots', async ({
    page,
  }) => {
    await createSong(page, 'Wonderwall');
    await createSongbook(page, 'Campfire');

    await addSongs(page, ['Wonderwall'], 'end');
    await expect(page.getByTestId('entry-row')).toHaveCount(1);

    // Twice is a set that plays it again, not a mistake to swallow.
    await addSongs(page, ['Wonderwall'], 'end');
    await expect(page.getByTestId('entry-row')).toHaveCount(2);

    await page.reload();
    await expect(page.getByTestId('entry-row')).toHaveCount(2);
  });

  // The gesture that used to do nothing: clicking a song, then pressing Add.
  test('clicking a row selects it, so Add works without the checkbox', async ({
    page,
  }) => {
    await createSong(page, 'Wonderwall');
    await createSongbook(page, 'Campfire');

    const row = page.getByTestId('song-row').first();
    const id = await row.getAttribute('data-song-id');
    await page.getByTestId(`open-${id}`).click();

    const add = page.getByTestId('add-end');
    await expect(add).toBeEnabled();
    await add.click();
    await expect(page.getByTestId('entry-row')).toHaveCount(1);
  });

  // The row is "only this one"; the checkbox is "this one as well".
  test('a row click replaces the selection, a checkbox extends it', async ({
    page,
  }) => {
    await createSong(page, 'Alpha');
    await createSong(page, 'Zeta');
    await createSongbook(page, 'Campfire');

    const ids = await page
      .getByTestId('song-row')
      .evaluateAll((rows) =>
        rows.map((row) => row.getAttribute('data-song-id')),
      );

    await page.getByTestId(`select-${ids[0]}`).check();
    await page.getByTestId(`select-${ids[1]}`).check();
    await expect(page.getByTestId('selection-clear')).toContainText('2');

    // Clicking a row throws the pair away and keeps just that row.
    await page.getByTestId(`open-${ids[1]}`).click();
    await expect(page.getByTestId('selection-clear')).toContainText('1');
    await expect(page.getByTestId(`select-${ids[0]}`)).not.toBeChecked();
    await expect(page.getByTestId(`select-${ids[1]}`)).toBeChecked();
  });

  // Nothing is shared between the modules: a selection is a fact about one list
  // on one screen.
  test('a library selection does not follow you into a songbook', async ({
    page,
  }) => {
    await createSong(page, 'Wonderwall');
    await page.goto('songs');
    const id = await page
      .getByTestId('song-row')
      .first()
      .getAttribute('data-song-id');
    await page.getByTestId(`select-${id}`).check();
    await expect(page.getByTestId('selection-count')).toContainText('1');

    await createSongbook(page, 'Campfire');
    await expect(page.getByTestId(`select-${id}`)).not.toBeChecked();
    await expect(page.getByTestId('selection-clear')).toHaveCount(0);
    await expect(page.getByTestId('add-end')).toBeDisabled();
  });

  test('adds to the start, and above a selected slot', async ({ page }) => {
    await createSong(page, 'Alpha');
    await createSong(page, 'Zeta');
    await createSongbook(page, 'Campfire');

    await addSongs(page, ['Alpha'], 'end');
    await addSongs(page, ['Zeta'], 'start');
    await expect(page.getByTestId('entry-row').first()).toContainText('Zeta');

    // Above the second slot puts it between the two.
    await page.getByTestId('entry-select-1').check();
    await addSongs(page, ['Zeta'], 'above');
    await expect(page.getByTestId('entry-row')).toHaveCount(3);
    await expect(page.getByTestId('entry-row').nth(1)).toContainText('Zeta');
  });

  test('reorders slots, and the selection travels with them', async ({
    page,
  }) => {
    await createSong(page, 'Alpha');
    await createSong(page, 'Zeta');
    await createSongbook(page, 'Campfire');
    await addSongs(page, ['Alpha', 'Zeta'], 'end');

    await page.getByTestId('entry-select-1').check();
    await page.getByTestId('move-up').click();
    await expect(page.getByTestId('entry-row').first()).toContainText('Zeta');
    // The tick followed the slot, so pressing again acts on the same song.
    await expect(page.getByTestId('entry-select-0')).toBeChecked();

    await page.getByTestId('move-end').click();
    await expect(page.getByTestId('entry-row').last()).toContainText('Zeta');

    await page.reload();
    await expect(page.getByTestId('entry-row').last()).toContainText('Zeta');
  });

  // Remove is not delete: the song stays in the library (CONTEXT.md).
  test('removing a slot keeps the song in the library', async ({ page }) => {
    await createSong(page, 'Wonderwall');
    await createSongbook(page, 'Campfire');
    await addSongs(page, ['Wonderwall'], 'end');

    await page.getByTestId('entry-row').hover();
    await page.getByTestId('entry-remove-0').click();
    await expect(page.getByTestId('entries-empty')).toBeVisible();

    // Still in the explorer beside it, and still in the library after a reload.
    await expect(page.getByTestId('song-row')).toHaveCount(1);
    await page.goto('songs');
    await expect(page.getByTestId('song-row')).toHaveCount(1);
  });

  test('songbook settings and title-page fields persist', async ({ page }) => {
    await createSongbook(page, 'Campfire');

    await page.getByTestId('songbook-settings').click();
    await page.getByTestId('songbook-title').fill('Campfire Classics');
    await page.getByTestId('songbook-author').fill('The Band');
    // The fields commit on change, which needs the blur — a reload straight out
    // of a focused field would drop the last one typed.
    await page.getByTestId('songbook-author').blur();
    // Songbook scope may override chord size; page settings are song-scoped and
    // must not appear here at all (ADR-0006).
    await expect(page.getByTestId('setting-chordSize')).toBeVisible();
    await expect(page.getByTestId('setting-columns')).toHaveCount(0);

    await page.reload();
    await page.getByTestId('songbook-settings').click();
    await expect(page.getByTestId('songbook-title')).toHaveValue(
      'Campfire Classics',
    );
    await expect(page.getByTestId('songbook-author')).toHaveValue('The Band');
  });

  test('deletes a songbook without touching its songs', async ({ page }) => {
    await createSong(page, 'Wonderwall');
    await createSongbook(page, 'Campfire');
    await addSongs(page, ['Wonderwall'], 'end');

    await page.goto('songbooks');
    const row = page
      .getByTestId('songbook-row')
      .filter({ hasText: 'Campfire' });
    const id = await row.getAttribute('data-songbook-id');
    await row.hover();
    await page.getByTestId(`songbook-delete-${id}`).click();
    await page.getByTestId('songbook-delete-confirm').click();

    await expect(page.getByTestId('songbook-row')).toHaveCount(1);
    await page.goto('songs');
    await expect(page.getByTestId('song-row')).toHaveCount(1);
  });
});
