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
import { withStarterLibrary } from './starter-library';

const COMPACT = { width: 390, height: 844 };

/** A songbook of three seeded songs, written straight into IndexedDB — the
 * Songbooks UI has its own specs, and building a book by hand here would test
 * that instead of the gesture. Returns the id to perform. */
async function seedBook(page: Page): Promise<string> {
  await withStarterLibrary(page);
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

/** The same finger, running up or down the glass — what a sideways swipe looks
 * like once the page has been turned a quarter (ADR-0013). */
async function swipeVertically(
  page: Page,
  direction: 'up' | 'down',
): Promise<void> {
  const box = await page.getByTestId('stage-render').boundingBox();
  if (box === null) throw new Error('the render area is not on screen');

  const x = Math.round(box.x + box.width / 2);
  const near = Math.round(box.y + 40);
  const far = Math.round(box.y + box.height - 40);
  const [from, to] = direction === 'up' ? [far, near] : [near, far];

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y: from }],
  });
  for (let step = 1; step <= 10; step++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: Math.round(from + ((to - from) * step) / 10) }],
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
 * Turn the page — ADR-0013.
 *
 * A landscape song on a portrait phone is fitted by width and takes about a
 * fifth of the screen. No browser will unlock the device's rotation for us, so
 * the app offers to draw the page sideways instead and the reader turns the
 * phone. Offered, never automatic: only the reader knows whether their device
 * will turn.
 */
test.describe('stage — turning the page', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: COMPACT });

  /** The same book, with every song written to fill a screen held sideways. */
  async function seedLandscapeBook(page: Page): Promise<string> {
    const id = await seedBook(page);
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('achordeon');
          open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction('songs', 'readwrite');
            const store = tx.objectStore('songs');
            const all = store.getAll();
            all.onsuccess = () => {
              for (const song of all.result) {
                store.put({
                  ...song,
                  settings: { ...song.settings, aspectRatio: '284:131' },
                });
              }
            };
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          };
          open.onerror = () => reject(open.error);
        }),
    );
    return id;
  }

  /** Is the drawn page taller than it is wide on screen? Playwright measures
   * after transforms, so this is the turn itself and not a class name. */
  async function isPageUpright(page: Page): Promise<boolean> {
    const box = await page.getByTestId('song-page').boundingBox();
    if (box === null) throw new Error('the page is not on screen');
    return box.height > box.width;
  }

  test('offers the turn for a landscape song, and not for a portrait one', async ({
    page,
  }) => {
    const id = await seedLandscapeBook(page);
    await page.goto(`stage/${id}`);
    await expect(page.getByTestId('stage-render')).toBeVisible();

    await page.getByTestId('stage-menu').click();
    await expect(page.getByTestId('stage-turn-page')).toBeVisible();

    // The control is hidden where it cannot act, rather than shown and inert —
    // which is also what makes it appearing the discovery.
    const portrait = await seedBook(page);
    await page.goto(`stage/${portrait}`);
    await expect(page.getByTestId('stage-render')).toBeVisible();
    await page.getByTestId('stage-menu').click();
    await expect(page.getByTestId('stage-turn-page')).toHaveCount(0);
  });

  test('draws the page sideways once armed, and keeps it across a reload', async ({
    page,
  }) => {
    const id = await seedLandscapeBook(page);
    await page.goto(`stage/${id}`);
    await expect(page.getByTestId('stage-render')).toBeVisible();
    expect(await isPageUpright(page)).toBe(false);

    await page.getByTestId('stage-menu').click();
    await page.getByTestId('stage-turn-page').click();
    await expect(page.getByTestId('stage-turn-page')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await page.keyboard.press('Escape');

    // Turned, the page stands taller than it is wide: it is now fitted to the
    // screen's long side, which is the whole point.
    await expect.poll(() => isPageUpright(page)).toBe(true);

    // Device-local and persisted, unlike the zoom: the phone is still sideways
    // after a reload, and re-arming on every visit would make it unusable.
    await page.reload();
    await expect(page.getByTestId('stage-render')).toBeVisible();
    await expect.poll(() => isPageUpright(page)).toBe(true);
  });

  test('still turns pages when the swipe itself has been turned', async ({
    page,
  }) => {
    // The trap this test exists for: the threshold counts horizontal travel, and
    // turned, the reader's sideways runs UP the glass. Left unmapped, a turned
    // performer swipes and nothing happens for the rest of the set.
    const id = await seedLandscapeBook(page);
    await page.goto(`stage/${id}`);
    await expect(page.getByTestId('stage-render')).toBeVisible();

    await page.getByTestId('stage-menu').click();
    await page.getByTestId('stage-turn-page').click();
    await page.keyboard.press('Escape');
    await expect.poll(() => isPageUpright(page)).toBe(true);

    await expect(page.getByTestId('stage-prev')).toBeDisabled();

    // A swipe DOWN the screen is a swipe to the reader's left once the page has
    // been turned counter-clockwise — so it is the one that goes forward.
    await swipeVertically(page, 'down');
    await expect(page.getByTestId('stage-prev')).toBeEnabled();

    await swipeVertically(page, 'up');
    await expect(page.getByTestId('stage-prev')).toBeDisabled();
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
    await withStarterLibrary(page);
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
    await withStarterLibrary(page);
    await expect(page.getByTestId('song-row').first()).toBeVisible();
    await page.goto('stage');

    await page.getByTestId('stage-all-songs-order').click();
    await page.getByTestId('all-songs-order-axis').selectOption('changed');
    await page.getByTestId('all-songs-order-cancel').click();

    await page.getByTestId('stage-all-songs-order').click();
    await expect(page.getByTestId('all-songs-order-axis')).toHaveValue('name');
  });
});
