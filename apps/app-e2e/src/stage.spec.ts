// Stage — swipe to turn the page on a touch screen
//
// **These dispatch touch through CDP, not `page.mouse`.** A mouse drag produces
// a tidy pointerdown/pointermove/pointerup and would have passed while the real
// gesture was broken on every Android phone: with `touch-action` left at its
// default, Chrome watches the first few pixels of a touch drag, decides it is a
// pan, hands it to the compositor and fires **pointercancel** — no pointerup,
// so the handler that turns the page never runs. `Input.dispatchTouchEvent`
// goes through Chromium's real input pipeline, so touch-action and the gesture
// recogniser both apply, which is the only way this test can fail for the
// reason it exists.
//
// `data-testid` only, like the rest of the suite.

import { expect, test, type Page } from '@playwright/test';

const COMPACT = { width: 390, height: 844 };

/** A songbook of three seeded songs, written straight into IndexedDB — the
 * Songbooks UI has its own specs, and building a book by hand here would test
 * that instead of the gesture. Returns the id to perform. */
async function seedBook(page: Page): Promise<string> {
  await page.goto('songs?seed');
  await expect(page.getByTestId('song-row').first()).toBeVisible();

  return page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const open = indexedDB.open('achordeon');
        open.onsuccess = () => {
          const db = open.result;
          const read = db.transaction('songs', 'readonly');
          const all = read.objectStore('songs').getAll();
          all.onsuccess = () => {
            const songs = all.result
              .filter((s: { deletedAt: number | null }) => s.deletedAt === null)
              .slice(0, 3);
            const id = 'stage-swipe-book';
            const now = Date.now();
            const tx = db.transaction('songbooks', 'readwrite');
            tx.objectStore('songbooks').put({
              id,
              createdAt: now,
              updatedAt: now,
              deletedAt: null,
              name: 'Swipe test',
              title: '',
              subtitle: '',
              author: '',
              settings: {},
              entries: songs.map((s: { id: string }) => s.id),
            });
            tx.oncomplete = () => resolve(id);
            tx.onerror = () => reject(tx.error);
          };
          all.onerror = () => reject(all.error);
        };
        open.onerror = () => reject(open.error);
      }),
  );
}

/** A real finger crossing the render area, in ten steps so the browser's
 * gesture recogniser sees a drag rather than a teleport. */
async function swipe(page: Page, direction: 'left' | 'right'): Promise<void> {
  const box = await page.getByTestId('stage-render').boundingBox();
  if (box === null) throw new Error('the render area is not on screen');

  const y = Math.round(box.y + box.height / 2);
  const near = Math.round(box.x + 40);
  const far = Math.round(box.x + box.width - 40);
  const [from, to] = direction === 'left' ? [far, near] : [near, far];

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: from, y }],
  });
  for (let step = 1; step <= 10; step++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: Math.round(from + ((to - from) * step) / 10), y }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await cdp.detach();
}

test.describe('stage — the performance survives the page', () => {
  test('a reload comes back on the same song, not at the top of the book', async ({
    page,
  }) => {
    const id = await seedBook(page);
    await page.goto(`stage/${id}`);
    await expect(page.getByTestId('stage-prev')).toBeDisabled();

    await page.getByTestId('stage-next').click();
    await expect(page.getByTestId('stage-prev')).toBeEnabled();

    // The real event: a phone's tab discarded while locked, then re-created.
    await page.reload();
    await expect(page.getByTestId('stage-render')).toBeVisible();

    // Prev is only enabled off the first song, so this IS "we came back on song 2".
    await expect(page.getByTestId('stage-prev')).toBeEnabled();
  });

  test('the exit cross ends it — a reload afterwards does not resume', async ({
    page,
  }) => {
    const id = await seedBook(page);
    await page.goto(`stage/${id}`);
    await page.getByTestId('stage-next').click();
    await expect(page.getByTestId('stage-prev')).toBeEnabled();

    await page.getByTestId('stage-exit').click();
    await expect(page.getByTestId('stage-list')).toBeVisible();

    await page.goto(`stage/${id}`);
    await expect(page.getByTestId('stage-prev')).toBeDisabled();
  });

  test('the tab says what you are doing', async ({ page }) => {
    const id = await seedBook(page);
    await expect(page).toHaveTitle('Achordeon - Songs');

    await page.goto('songbooks');
    await expect(page).toHaveTitle('Achordeon - Songbooks');

    await page.goto(`stage/${id}`);
    await expect(page).toHaveTitle('Performing - Achordeon');
  });
});

test.describe('stage — swiping turns the page', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: COMPACT });

  test('a left swipe goes to the next song, a right swipe comes back', async ({
    page,
  }) => {
    const id = await seedBook(page);
    await page.goto(`stage/${id}`);
    await expect(page.getByTestId('stage-render')).toBeVisible();

    // Position is read off the controls rather than the SVG: "can I go back
    // yet" is the same question the user is asking, and it survives a redesign
    // of the render.
    await expect(page.getByTestId('stage-prev')).toBeDisabled();

    await swipe(page, 'left');
    await expect(page.getByTestId('stage-prev')).toBeEnabled();

    await swipe(page, 'right');
    await expect(page.getByTestId('stage-prev')).toBeDisabled();
  });

  test('a swipe at the first song does not fall off the front', async ({
    page,
  }) => {
    const id = await seedBook(page);
    await page.goto(`stage/${id}`);
    await expect(page.getByTestId('stage-render')).toBeVisible();

    await swipe(page, 'right');
    await expect(page.getByTestId('stage-prev')).toBeDisabled();
    await expect(page.getByTestId('stage-next')).toBeEnabled();
  });
});

/**
 * The All songs order — asked for in the picker, beside the row it orders.
 *
 * A stored book plays in the sequence you arranged its slots in; All songs has no
 * slots, so its sequence has to be described. The gear is the only control on the
 * picker, and it is on the only row that needs one.
 */
test.describe('stage — the All songs order', () => {
  test('is asked for on the All songs row, and saved', async ({ page }) => {
    await page.goto('songs?seed');
    await expect(page.getByTestId('song-row').first()).toBeVisible();
    await page.goto('stage');

    // Only All songs carries the gear: every other row's order is its slots.
    await expect(page.getByTestId('stage-all-songs-order')).toHaveCount(1);

    await page.getByTestId('stage-all-songs-order').click();
    await expect(page.getByTestId('all-songs-order-dialog')).toBeVisible();

    await page.getByTestId('all-songs-order-axis').selectOption('created');
    await page.getByTestId('all-songs-order-dir').selectOption('desc');
    await page.getByTestId('all-songs-order-save').click();
    await expect(page.getByTestId('all-songs-order-dialog')).toHaveCount(0);

    // Saved to the account, not merely applied: a reload opens on it again.
    await page.reload();
    await page.getByTestId('stage-all-songs-order').click();
    await expect(page.getByTestId('all-songs-order-axis')).toHaveValue(
      'created',
    );
    await expect(page.getByTestId('all-songs-order-dir')).toHaveValue('desc');
  });

  test('cancel leaves the saved order alone', async ({ page }) => {
    await page.goto('songs?seed');
    await expect(page.getByTestId('song-row').first()).toBeVisible();
    await page.goto('stage');

    await page.getByTestId('stage-all-songs-order').click();
    await page.getByTestId('all-songs-order-axis').selectOption('changed');
    await page.getByTestId('all-songs-order-cancel').click();

    await page.getByTestId('stage-all-songs-order').click();
    await expect(page.getByTestId('all-songs-order-axis')).toHaveValue('name');
  });
});
