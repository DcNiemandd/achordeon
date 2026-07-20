// Songbooks module smoke — Epic 6
// Spec: CONTEXT.md §Songbook, §Delete vs Remove; songbooks/index.mdx
//
// Selects only on `data-testid`, like the rest of the suite: the proof that the
// seam holds when the temporary UI is replaced. Assert behaviour, not looks.

import { expect, test, type Page } from '@playwright/test';

const ROOMY = { width: 1440, height: 900 };
/** Below the compact breakpoint but above the stack one: the builder must still
 * show both panes side by side rather than hide one behind a tab. */
const NARROW = { width: 800, height: 900 };
/** Below the stack breakpoint. */
const PHONE = { width: 390, height: 844 };

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
  // The rename is a write to IndexedDB, and `page.goto` is a full browser
  // navigation that can outrun it — the same reason `createSong` waits.
  await page.waitForTimeout(300);
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
    await expect(page.getByTestId('open-all-songs')).toBeVisible();
    // It has no record behind it, so it wears no identity actions.
    await page.getByTestId('songbook-row').hover();
    await expect(page.getByTestId('rename-all-songs')).toHaveCount(0);
    await expect(page.getByTestId('delete-all-songs')).toHaveCount(0);
    // "No songbooks yet" is about the ones you make — All songs is not one.
    await expect(page.getByTestId('songbooks-empty')).toBeVisible();
  });

  // It looks like a book you made and is not one, so it says so out loud.
  test('All songs explains itself, and sorting is all it can be told', async ({
    page,
  }) => {
    await createSong(page, 'Wonderwall');
    await page.goto('songbooks');

    await page.getByTestId('hint-all-songs').click();
    await expect(page.getByRole('tooltip')).toContainText('library');

    await page.getByTestId('open-all-songs').dblclick();
    // Pane B: sorting, and nothing that would edit an order it does not own.
    const entries = page.getByTestId('songbook-detail');
    await expect(entries.getByTestId('explorer-sort')).toBeVisible();
    await expect(entries.getByTestId('explorer-favorites-first')).toBeVisible();
    await expect(entries.getByTestId('explorer-search')).toHaveCount(0);
    await expect(page.getByTestId('entry-tools')).toHaveCount(0);
  });

  test('the virtual book sorts its own list without touching the library pane', async ({
    page,
  }) => {
    await createSong(page, 'Alpha');
    await createSong(page, 'Zeta');
    await page.goto('songbooks');
    await page.getByTestId('open-all-songs').dblclick();

    const entries = page.getByTestId('songbook-detail');
    await expect(page.getByTestId('entry-row').first()).toContainText('Alpha');

    await entries.getByTestId('explorer-sort-dir').click();
    await expect(page.getByTestId('entry-row').first()).toContainText('Zeta');
    // Pane A is a separate list and keeps its own order.
    await expect(page.getByTestId('song-row').first()).toContainText('Alpha');
  });

  test('All songs holds the whole library, read-only', async ({ page }) => {
    await createSong(page, 'Wonderwall');
    await createSong(page, 'Yesterday');

    await page.goto('songbooks');
    await page.getByTestId('open-all-songs').dblclick();

    await expect(page.getByTestId('entry-row')).toHaveCount(2);
    // No reorder strip, no per-row remove, nothing to add with.
    await expect(page.getByTestId('entry-tools')).toHaveCount(0);
    await expect(page.getByTestId('songbook-add')).toHaveCount(0);
    await expect(page.getByTestId('remove-0')).toHaveCount(0);
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
    // No ⋯ menu either — that is where duplicate, delete, download and export
    // now live, and the picking pane has none of them.
    await expect(page.getByTestId(`more-${id}`)).toHaveCount(0);
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
    await expect(page.getByTestId('selection-clear')).toContainText('1');

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
    await page.getByTestId('select-1').check();
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

    await page.getByTestId('select-1').check();
    await page.getByTestId('move-up').click();
    await expect(page.getByTestId('entry-row').first()).toContainText('Zeta');
    // The tick followed the slot, so pressing again acts on the same song.
    await expect(page.getByTestId('select-0')).toBeChecked();

    await page.getByTestId('move-end').click();
    await expect(page.getByTestId('entry-row').last()).toContainText('Zeta');

    await page.reload();
    await expect(page.getByTestId('entry-row').last()).toContainText('Zeta');
  });

  // The row's own buttons move THAT row — no ticking first, no untick after.
  test('a row reorders itself, leaving the slot selection alone', async ({
    page,
  }) => {
    await createSong(page, 'Alpha');
    await createSong(page, 'Zeta');
    await createSongbook(page, 'Campfire');
    await addSongs(page, ['Alpha', 'Zeta'], 'end');

    // A selection on a different row must survive a row move untouched.
    await page.getByTestId('select-0').check();

    const second = page.getByTestId('entry-row').nth(1);
    await second.hover();
    await page.getByTestId('row-start-1').click();

    await expect(page.getByTestId('entry-row').first()).toContainText('Zeta');
    // 'Alpha' was slot 0 and is now slot 1 — the tick went with it.
    await expect(page.getByTestId('select-1')).toBeChecked();
    await expect(page.getByTestId('select-0')).not.toBeChecked();
  });

  // Two affordances for one act, on one screen, would disagree: the strip
  // moves the block, a row button would move one row out of it.
  test('row move buttons stand down while a block is selected', async ({
    page,
  }) => {
    await createSong(page, 'Alpha');
    await createSong(page, 'Zeta');
    await createSongbook(page, 'Campfire');
    await addSongs(page, ['Alpha', 'Zeta'], 'end');

    await page.getByTestId('entry-row').first().hover();
    await expect(page.getByTestId('row-up-0')).toBeVisible();

    await page.getByTestId('select-0').check();
    await page.getByTestId('select-1').check();
    await page.getByTestId('entry-row').first().hover();
    await expect(page.getByTestId('row-up-0')).toHaveCount(0);
    // The row's remove stands down with them: the strip removes the block.
    await expect(page.getByTestId('remove-0')).toHaveCount(0);
  });

  // A song in three slots is three rows, not one row drawn three times.
  test('clicking one slot of a repeated song marks only that slot', async ({
    page,
  }) => {
    await createSong(page, 'Wonderwall');
    await createSongbook(page, 'Campfire');
    await addSongs(page, ['Wonderwall'], 'end');
    await addSongs(page, ['Wonderwall'], 'end');
    await addSongs(page, ['Wonderwall'], 'end');

    await page.getByTestId('open-1').click();
    await expect(page.getByTestId('entry-row').nth(1)).toHaveClass(
      /is-current/,
    );
    await expect(page.getByTestId('entry-row').first()).not.toHaveClass(
      /is-current/,
    );
    await expect(page.getByTestId('entry-row').nth(2)).not.toHaveClass(
      /is-current/,
    );

    // ...and the mark moves to the slot you click next, not back to the first.
    await page.getByTestId('open-2').click();
    await expect(page.getByTestId('entry-row').nth(2)).toHaveClass(
      /is-current/,
    );
    await expect(page.getByTestId('entry-row').nth(1)).not.toHaveClass(
      /is-current/,
    );
  });

  // A transfer list that hides one of its two lists behind a tab is a transfer
  // list you cannot transfer across — and, once drag & drop lands, cannot drag
  // across either.
  test('the builder never becomes a tab switcher', async ({ page }) => {
    await createSong(page, 'Wonderwall');
    await createSongbook(page, 'Campfire');

    await page.setViewportSize(NARROW);
    await expect(page.getByTestId('pane-a')).toBeVisible();
    await expect(page.getByTestId('pane-b')).toBeVisible();
    await expect(page.getByTestId('pane-switcher')).toHaveCount(0);
    // Side by side: pane B starts to the right of pane A.
    const a = await page.getByTestId('pane-a').boundingBox();
    const b = await page.getByTestId('pane-b').boundingBox();
    expect(b?.x).toBeGreaterThan(a?.x ?? 0);

    await page.setViewportSize(PHONE);
    await expect(page.getByTestId('pane-a')).toBeVisible();
    await expect(page.getByTestId('pane-b')).toBeVisible();
    await expect(page.getByTestId('pane-switcher')).toHaveCount(0);
    // Stacked: pane B is below pane A, and the divider is gone.
    const stackedA = await page.getByTestId('pane-a').boundingBox();
    const stackedB = await page.getByTestId('pane-b').boundingBox();
    expect(stackedB?.y).toBeGreaterThan(stackedA?.y ?? 0);
    await expect(page.getByTestId('split-resizer')).toHaveCount(0);
  });

  // Half a phone screen spent on a pane whose every button is off.
  test('All songs drops its library pane on a phone', async ({ page }) => {
    await createSong(page, 'Wonderwall');
    await page.goto('songbooks');
    await page.getByTestId('open-all-songs').dblclick();

    await page.setViewportSize(PHONE);
    await expect(page.getByTestId('songbook-detail')).toBeVisible();
    await expect(page.getByTestId('entry-row')).toHaveCount(1);
    // The library list and everything that fed it are gone.
    await expect(page.getByTestId('song-row')).toHaveCount(0);
    await expect(page.getByTestId('pane-b')).toBeHidden();
  });

  // Remove is not delete: the song stays in the library (CONTEXT.md).
  test('removing a slot keeps the song in the library', async ({ page }) => {
    await createSong(page, 'Wonderwall');
    await createSongbook(page, 'Campfire');
    await addSongs(page, ['Wonderwall'], 'end');

    await page.getByTestId('entry-row').hover();
    await page.getByTestId('remove-0').click();
    await expect(
      page.getByTestId('songbook-detail').getByTestId('explorer-empty'),
    ).toBeVisible();

    // Still in the explorer beside it, and still in the library after a reload.
    await expect(page.getByTestId('song-row')).toHaveCount(1);
    await page.goto('songs');
    await expect(page.getByTestId('song-row')).toHaveCount(1);
  });

  // The editor's gesture, on the editor's shape of screen: a thing you opened
  // from a list and step back out of.
  test('escape leaves the songbook for the list', async ({ page }) => {
    await createSongbook(page, 'Campfire');

    // Not while a field has the caret — there Escape reverts the edit.
    await page.getByTestId('module-title-input').focus();
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/songbooks\/.+$/);

    // Nor out of the screen while the settings dialog is open: that closes
    // first, so one key never does two things. Pressed from INSIDE the dialog,
    // which is where the key bubbled through both handlers and did both.
    await page.getByTestId('songbook-settings').click();
    await page.getByTestId('songbook-title').click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('songbook-settings-dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/songbooks\/.+$/);

    // ...and from its chrome, where only the page's own handler sees it.
    await page.getByTestId('songbook-settings').click();
    await page.getByTestId('dialog').click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('songbook-settings-dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/songbooks\/.+$/);

    await page.getByTestId('songbook-detail').click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('songbook-row').first()).toBeVisible();
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

  // The songs module's shape of screen, so its behaviour: a click picks and
  // previews, a double click goes in.
  test('a click previews the title page, a double click opens the songbook', async ({
    page,
  }) => {
    await createSongbook(page, 'Campfire');
    await page.goto('songbooks');

    const row = page
      .getByTestId('songbook-row')
      .filter({ hasText: 'Campfire' });
    const id = await row.getAttribute('data-song-id');
    await page.getByTestId(`open-${id}`).click();

    await expect(page).toHaveURL(/\/songbooks(\?.*)?$/);
    await expect(page.getByTestId('title-page')).toContainText('Campfire');

    await page.getByTestId(`open-${id}`).dblclick();
    await expect(page).toHaveURL(/\/songbooks\/.+$/);
  });

  // The title page shows the songbook's own fields, not any song's.
  test('the previewed title page shows the songbook title-page fields', async ({
    page,
  }) => {
    await createSongbook(page, 'Campfire');
    await page.getByTestId('songbook-settings').click();
    await page.getByTestId('songbook-title').fill('Campfire Classics');
    await page.getByTestId('songbook-author').fill('The Band');
    await page.getByTestId('songbook-author').blur();

    await page.goto('songbooks');
    const row = page
      .getByTestId('songbook-row')
      .filter({ hasText: 'Campfire' });
    const id = await row.getAttribute('data-song-id');
    await page.getByTestId(`open-${id}`).click();

    const titlePage = page.getByTestId('title-page');
    await expect(titlePage).toContainText('Campfire Classics');
    await expect(titlePage).toContainText('The Band');
  });

  test('deletes a songbook without touching its songs', async ({ page }) => {
    await createSong(page, 'Wonderwall');
    await createSongbook(page, 'Campfire');
    await addSongs(page, ['Wonderwall'], 'end');

    await page.goto('songbooks');
    const row = page
      .getByTestId('songbook-row')
      .filter({ hasText: 'Campfire' });
    const id = await row.getAttribute('data-song-id');
    await row.hover();
    // Delete moved onto the row's ⋯ menu (Epic 7), with download and export.
    await page.getByTestId(`more-${id}`).click();
    await page.getByTestId(`delete-${id}`).click();
    await page.getByTestId('songbook-delete-confirm').click();

    await expect(page.getByTestId('songbook-row')).toHaveCount(1);
    await page.goto('songs');
    await expect(page.getByTestId('song-row')).toHaveCount(1);
  });
});

// Drag & drop — Epic 14
//
// The pointer half of the builder. Every act here already has a button (Epic 6),
// so these prove the drag reaches the SAME command — an order, not an animation.
test.describe('drag & drop', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(ROOMY);
    await freshLibrary(page);
  });

  /**
   * Drag a row by its handle and let go at `y` inside `target`.
   *
   * Hand-driven rather than `dragAndDrop`: the CDK starts a drag from pointer
   * events past a movement threshold, and the insertion line is tracked from
   * pointermove — a single teleporting move satisfies neither.
   */
  async function dragTo(
    page: Page,
    handleTestid: string,
    target: ReturnType<Page['getByTestId']>,
    y: number,
  ): Promise<void> {
    const handle = page.getByTestId(handleTestid);
    const from = await handle.boundingBox();
    const to = await target.boundingBox();
    if (!from || !to) {
      throw new Error('drag source or target is not on screen');
    }
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + y, { steps: 12 });
    // A second move at rest: the last step and the drop must not be the same
    // event, or the boundary is read before the list has been entered.
    await page.mouse.move(to.x + to.width / 2, to.y + y);
    await page.mouse.up();
  }

  test('drags a slot to a new position in the songbook', async ({ page }) => {
    await createSong(page, 'Alpha');
    await createSong(page, 'Zeta');
    await createSongbook(page, 'Campfire');
    await addSongs(page, ['Alpha', 'Zeta'], 'end');

    // Slot 1 (Zeta), dropped on the top edge of the list: above everything.
    await dragTo(page, 'drag-1', page.getByTestId('songbook-detail'), 2);

    await expect(page.getByTestId('entry-row').first()).toContainText('Zeta');
    await expect(page.getByTestId('entry-row').last()).toContainText('Alpha');
  });

  test('drags a song out of the library and into the songbook', async ({
    page,
  }) => {
    await createSong(page, 'Alpha');
    await createSong(page, 'Zeta');
    await createSongbook(page, 'Campfire');
    await addSongs(page, ['Zeta'], 'end');

    const alpha = page.getByTestId('song-row').filter({ hasText: 'Alpha' });
    const id = await alpha.getAttribute('data-song-id');
    await dragTo(page, `drag-${id}`, page.getByTestId('songbook-detail'), 2);

    await expect(page.getByTestId('entry-row')).toHaveCount(2);
    await expect(page.getByTestId('entry-row').first()).toContainText('Alpha');
  });

  // The Add buttons' rule, reached by the other gesture: a dragged row that is
  // part of the selection brings the selection with it.
  test('a drag of a selected row carries the whole selection', async ({
    page,
  }) => {
    await createSong(page, 'Alpha');
    await createSong(page, 'Zeta');
    await createSongbook(page, 'Campfire');

    for (const name of ['Alpha', 'Zeta']) {
      const row = page.getByTestId('song-row').filter({ hasText: name });
      await page
        .getByTestId(`select-${await row.getAttribute('data-song-id')}`)
        .check();
    }
    const alpha = page.getByTestId('song-row').filter({ hasText: 'Alpha' });
    const id = await alpha.getAttribute('data-song-id');
    await dragTo(page, `drag-${id}`, page.getByTestId('songbook-detail'), 2);

    await expect(page.getByTestId('entry-row')).toHaveCount(2);
  });

  /**
   * The list is virtualised, so the row a drop lands next to may never have been
   * in the DOM beside the row being dragged. The boundary is arithmetic over the
   * **scroll offset**, not a reading of what happens to be rendered — and this
   * is the assertion that says so: dropped at the top *edge* of a scrolled
   * viewport, the row must land where the list has scrolled to, never at 0.
   */
  test('a drop lands by scroll position, not by what is on screen', async ({
    page,
  }) => {
    // Short enough that the entry list has to scroll, wide enough to stay a
    // two-pane builder.
    await page.setViewportSize({ width: 1000, height: 400 });
    for (const name of ['Alpha', 'Mid', 'Zeta']) {
      await createSong(page, name);
    }
    await createSongbook(page, 'Campfire');
    for (let round = 0; round < 3; round++) {
      await addSongs(page, ['Alpha', 'Mid', 'Zeta'], 'end');
    }
    await expect(page.getByTestId('entry-row')).toHaveCount(9);

    const list = page
      .getByTestId('songbook-detail')
      .getByTestId('explorer-list');
    await list.evaluate((el) => el.scrollTo({ top: 200 }));
    await page.waitForTimeout(100);

    // The last slot, dropped on the viewport's top edge — which is no longer
    // the top of the list.
    await dragTo(page, 'drag-8', page.getByTestId('songbook-detail'), 2);

    await expect(page.getByTestId('entry-row').first()).toContainText('Alpha');
  });

  // The library is a source, never a destination: its order is a sort, so there
  // is no "here" to drop something at.
  test('the library refuses a drop, and takes nothing out of the songbook', async ({
    page,
  }) => {
    await createSong(page, 'Alpha');
    await createSongbook(page, 'Campfire');
    await addSongs(page, ['Alpha'], 'end');

    const library = page.getByTestId('explorer-list').first();
    await dragTo(page, 'drag-0', library, 4);

    await expect(page.getByTestId('entry-row')).toHaveCount(1);
    await expect(page.getByTestId('song-row')).toHaveCount(1);
  });

  // Dragging is never the only way to reorder (WCAG 2.1.1) — and where there is
  // no order to change, there is no handle at all.
  test('no handle where the order is not the user’s', async ({ page }) => {
    await createSong(page, 'Alpha');

    // The Songs library: a list sorted by a chosen axis, not an arrangement.
    await page.goto('songs');
    const song = page.getByTestId('song-row').filter({ hasText: 'Alpha' });
    const id = await song.getAttribute('data-song-id');
    await expect(page.getByTestId(`drag-${id}`)).toHaveCount(0);

    // All songs: a read-only order, so its slots stay put.
    await page.goto('songbooks');
    await page.getByTestId('open-all-songs').dblclick();
    await expect(page.getByTestId('drag-0')).toHaveCount(0);
  });

  // WCAG 2.1.1: dragging must not be the only way to reorder. Epic 6's buttons
  // are that other way, and this is the assertion that keeps them there.
  test('every drag has a button that does the same thing', async ({ page }) => {
    await createSong(page, 'Alpha');
    await createSongbook(page, 'Campfire');
    await addSongs(page, ['Alpha'], 'end');

    // The handle and the row's own move buttons live on the same row.
    await expect(page.getByTestId('drag-0')).toBeVisible();
    await page.getByTestId('entry-row').first().hover();
    for (const where of ['start', 'up', 'down', 'end']) {
      await expect(page.getByTestId(`row-${where}-0`)).toBeVisible();
    }
    // And the Add buttons are the keyboard path across the gap.
    await expect(page.getByTestId('add-end')).toBeVisible();
  });
});
