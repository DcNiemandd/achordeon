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
import { createSong } from './create-song';
import { withStarterLibrary } from './starter-library';

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
 * A genuinely first-ever boot: no database, and seeding **on**.
 *
 * The suite opts out of seeding for every test (`storageState` in
 * playwright.config.ts) so that a fresh context means an empty library. Opting back
 * in is what a real first-time user is, and only the first-run tests want it.
 */
async function firstRun(page: Page): Promise<void> {
  await freshLibrary(page);
  await withStarterLibrary(page);
  await expect(page.getByTestId('song-row').first()).toBeVisible();
}

/**
 * Open a row's ⋯ menu — duplicate, download, export and delete moved behind it
 * (Epic 7). Edit and rename stay direct on the row.
 */
async function openRowMenu(page: Page, id: string | null): Promise<void> {
  await page
    .getByTestId('song-row')
    .filter({ has: page.getByTestId(`more-${id}`) })
    .first()
    .hover();
  await page.getByTestId(`more-${id}`).click();
  await expect(page.getByTestId(`more-${id}-panel`)).toBeVisible();
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

  // What a real first-time user meets. Every other test in the suite opts out of
  // seeding (`storageState` in playwright.config.ts), so this is the one place the
  // first-run path runs — and the empty-state test above is what the opt-out buys.
  test('a first run lands the starter library, the guide showing in the render pane', async ({
    page,
  }) => {
    await firstRun(page);

    // The guide song *and* the starter set, in one write — several rows, not one.
    const rows = page.getByTestId('song-row');
    const seeded = await rows.count();
    expect(seeded).toBeGreaterThan(1);
    await expect(rows.filter({ hasText: 'My first song' })).toHaveCount(1);
    // Preselected, and specifically the guide: it carries the newest timestamp of
    // everything written, so `autoSelect` opens the tour rather than whichever
    // sample happened to sort first.
    await expect(page.getByTestId('song-render')).toContainText(
      'My first song',
    );

    // A reload is not a second first run, and nothing duplicates.
    await page.reload();
    await expect(page.getByTestId('song-row')).toHaveCount(seeded);
  });

  // The songbook lands in the same write, so the songbooks module opens on content
  // instead of its own empty state.
  test('a first run lands the starter songbook too', async ({ page }) => {
    await firstRun(page);
    await page.goto('songbooks');
    await expect(page.getByTestId('songbook-row').first()).toBeVisible();
  });

  // The one song that teaches the language, so it has to show all of it and warn at
  // nobody on sight.
  test('the guide song holds the tutorial, and it parses cleanly', async ({
    page,
  }) => {
    await firstRun(page);
    const row = page
      .getByTestId('song-row')
      .filter({ hasText: 'My first song' });
    const id = await row.getAttribute('data-song-id');
    await row.hover();
    await page.getByTestId(`edit-${id}`).click();

    await expect(page).toHaveURL(/\/songs\/.+\/edit$/);
    const editor = page.getByTestId('editor');
    await expect(editor).toContainText('[[C]]');
    await expect(editor).toContainText('Softly:');
    await expect(editor).toContainText('***both***');
    await expect(editor).toContainText('R::');
    await expect(editor.locator('.cm-lintRange-warning')).toHaveCount(0);
  });

  // A sample the user threw away stays thrown away — the guide song is stamped, so
  // deleting it is a decision the next boot respects.
  test('a deleted guide song does not come back', async ({ page }) => {
    await firstRun(page);
    const rows = page.getByTestId('song-row');
    const seeded = await rows.count();
    const guide = rows.filter({ hasText: 'My first song' });
    const id = await guide.getAttribute('data-song-id');
    await openRowMenu(page, id);
    await page.getByTestId(`delete-${id}`).click();
    await page.getByTestId('delete-confirm').click();
    await expect(guide).toHaveCount(0);

    // Only the guide goes: the rest of the starter library is untouched, and the
    // next boot resurrects nothing.
    await page.reload();
    await expect(guide).toHaveCount(0);
    await expect(rows).toHaveCount(seeded - 1);
  });

  // A skeleton, not a lesson: the three things every song has, plus the one rule
  // nothing else in the UI can show — where a chord lands. The whole language is the
  // guide song's job, and it is sitting in the library.
  test('a new song opens holding the skeleton, and it parses cleanly', async ({
    page,
  }) => {
    await page.getByTestId('songs-add').click();
    const editor = page.getByTestId('editor');
    await expect(editor).toContainText('New song');
    await expect(editor).toContainText('Verse:');
    await expect(editor).toContainText('[C]');

    // Small enough to type over — the tour's constructs belong to the guide song.
    await expect(editor).not.toContainText('[[C]]');
    // And it has to be a *correct* example: a starter song that warns at the user on
    // sight teaches them the language is fussy rather than how it works.
    await expect(editor.locator('.cm-lintRange-warning')).toHaveCount(0);
    // And it has to render, or the example does not demonstrate anything.
    await expect(page.getByTestId('song-render')).toBeVisible();
  });

  // The list's rename is unreachable from the editor, so a song created and
  // written in stayed called "New song" until you navigated back out.
  test('renames the song from the editor title', async ({ page }) => {
    await page.getByTestId('songs-add').click();
    const title = page.getByTestId('module-title-input');
    await expect(title).toHaveValue('New song');

    await title.fill('Wonderwall');
    await title.press('Enter');
    await page.waitForTimeout(700);

    await page.goBack();
    await expect(page.getByTestId('song-row')).toContainText('Wonderwall');
  });

  test('escape leaves the editor for the library', async ({ page }) => {
    await page.getByTestId('songs-add').click();
    await expect(page).toHaveURL(/\/songs\/.+\/edit$/);

    // Not while a field has the caret: there Escape reverts the edit instead.
    await page.getByTestId('module-title-input').focus();
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/edit$/);

    await page.getByTestId('editor').locator('.cm-content').click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('explorer-list')).toBeVisible();
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

    await openRowMenu(page, id);
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

  // With a query that matches nothing there is no list left to navigate, so the
  // clear button is not a shortcut - it is the way back.
  test('clearing the query restores the list and empties the URL', async ({
    page,
  }) => {
    await createSong(page, 'Wonderwall');
    const clear = page.getByTestId('explorer-search-clear');
    await expect(clear).toHaveCount(0);

    await page.getByTestId('explorer-search').fill('zzzz');
    await expect(page.getByTestId('explorer-empty')).toBeVisible();
    await clear.click();

    await expect(page.getByTestId('song-row')).toHaveCount(1);
    await expect(page.getByTestId('explorer-search')).toHaveValue('');
    await expect(page).not.toHaveURL(/[?&]q=/);
    await expect(clear).toHaveCount(0);
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

  // A flag over the sort, not a sort of its own: sorting BY favourite left
  // everything else in tiebreak order, which is a list nobody asked for.
  test('favorites first floats starred songs without changing the sort', async ({
    page,
  }) => {
    await createSong(page, 'Alpha');
    await createSong(page, 'Yesterday');
    await createSong(page, 'Zeta');
    const rows = page.getByTestId('song-row');
    const last = await rows.last().getAttribute('data-song-id');

    await page.getByTestId(`favorite-${last}`).click();
    await page.getByTestId('explorer-favorites-first').click();

    await expect(rows.first()).toContainText('Zeta');
    // The rest keep the name order they had.
    await expect(rows.nth(1)).toContainText('Alpha');
    await expect(rows.nth(2)).toContainText('Yesterday');

    // It rides in the URL, so a reload lands on the same list.
    await expect(page).toHaveURL(/[?&]fav=1/);
    await page.reload();
    await expect(rows.first()).toContainText('Zeta');
  });

  // The bulk actions are always mounted and always in the same place — that is
  // the point of them being on the action row rather than in a bar that appears.
  // What a selection changes is whether they are enabled, not whether they exist.
  test('multi-select enables the bulk actions without moving the list', async ({
    page,
  }) => {
    await createSong(page, 'Wonderwall');
    await createSong(page, 'Yesterday');
    const rows = page.getByTestId('song-row');
    const first = await rows.first().getAttribute('data-song-id');

    const del = page.getByTestId('explorer-bulk-delete');
    const clear = page.getByTestId('selection-clear');
    await expect(del).toBeDisabled();
    // The count and its Clear are not there at all until something is picked.
    await expect(clear).toHaveCount(0);
    const before = await rows.first().boundingBox();

    await page.getByTestId(`select-${first}`).check();
    await expect(del).toBeEnabled();
    // The count rides the Clear button — one control, not a label beside it.
    await expect(clear).toContainText('1');
    // The row did not budge when the checkbox was ticked.
    expect((await rows.first().boundingBox())?.y).toBe(before?.y);

    await clear.click();
    await expect(del).toBeDisabled();
    await expect(clear).toHaveCount(0);
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

    await openRowMenu(page, id);
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

    await openRowMenu(page, id);
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

    await openRowMenu(page, id);
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

    await openRowMenu(page, id);
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

  // One decision for the selection, not a per-row flip: pressing it twice must
  // put you back where you started rather than inverting a mixed selection.
  test('bulk favorite fills the gaps, then clears them all', async ({
    page,
  }) => {
    await createSong(page, 'Wonderwall');
    await createSong(page, 'Yesterday');
    const ids = await page
      .getByTestId('song-row')
      .evaluateAll((rows) =>
        rows.map((row) => row.getAttribute('data-song-id')),
      );
    // A retrying expect, not a bare read: the write goes to IndexedDB and comes
    // back through a refetch, so the attribute lands a tick after the click.
    const expectFavorite = async (id: string | null, value: string) =>
      expect(page.getByTestId(`favorite-${id}`)).toHaveAttribute(
        'aria-pressed',
        value,
      );

    // A mixed selection: one on, one off.
    await page.getByTestId(`favorite-${ids[0]}`).click();
    await page.getByTestId(`select-${ids[0]}`).check();
    await page.getByTestId(`select-${ids[1]}`).check();

    await page.getByTestId('explorer-bulk-favorite').click();
    for (const id of ids) await expectFavorite(id, 'true');

    // All on now, so the same button clears them.
    await page.getByTestId('explorer-bulk-favorite').click();
    for (const id of ids) await expectFavorite(id, 'false');
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
    // The selection went with the songs — nothing left to act on.
    await expect(page.getByTestId('explorer-bulk-delete')).toBeDisabled();
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

  test('the editor returns to the list as it was left — search and sort kept', async ({
    page,
  }) => {
    await createSong(page, 'Alpha');

    // The list's state is its URL: filter and sort it.
    await page.goto('songs?q=Alp&sort=changed&dir=desc');
    const row = page.getByTestId('song-row').filter({ hasText: 'Alpha' });
    await expect(row).toBeVisible();
    const id = await row.getAttribute('data-song-id');

    // Open it, then come back by the link — the query rides along, so the list
    // is as it was, not a bare /songs.
    await row.hover();
    await page.getByTestId(`edit-${id}`).click();
    await expect(page).toHaveURL(/\/songs\/.+\/edit$/);
    await expect(page.getByTestId('editor-back')).toHaveAttribute(
      'href',
      /[?&]q=Alp(&|$)/,
    );
    await page.getByTestId('editor-back').click();
    await expect(page).toHaveURL(/[?&]q=Alp(&|$)/);
    await expect(page).toHaveURL(/[?&]sort=changed(&|$)/);

    // Escape does the same.
    await page.getByTestId('song-row').filter({ hasText: 'Alpha' }).hover();
    await page.getByTestId(`edit-${id}`).click();
    await expect(page).toHaveURL(/\/edit$/);
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/[?&]q=Alp(&|$)/);
  });

  test('the sort dropdown opens on the sort the URL holds', async ({
    page,
  }) => {
    await createSong(page, 'Alpha');

    // Landing on a sorted URL — a reload, a shared link — shows that sort, not
    // the first option.
    await page.goto('songs?sort=changed');
    await expect(page.getByTestId('explorer-sort')).toHaveValue('changed');

    // And picking one drives the URL and stays in step.
    await page.getByTestId('explorer-sort').selectOption('created');
    await expect(page).toHaveURL(/[?&]sort=created(&|$)/);
    await expect(page.getByTestId('explorer-sort')).toHaveValue('created');
  });
});
