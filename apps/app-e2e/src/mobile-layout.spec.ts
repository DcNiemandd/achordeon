// Mobile layout — the app must never overflow sideways
//
// A horizontal scrollbar on a phone is a bug this app does not get to have: a
// row whose actions slide off the edge, a button strip that will not wrap, a
// list that shrink-wraps its widest content instead of the viewport. Two things
// are asserted at each phone width and on each screen:
//
//   1. the document itself never scrolls horizontally, and
//   2. nothing *visible* extends past the right edge — the stricter half, since
//      a list with its own `overflow-x` can hide its overrun from the document
//      while still cutting a control off the screen (which is the exact bug that
//      prompted this suite).
//
// Selects only on `data-testid`, like the rest of the suite.

import { expect, test, type Page } from '@playwright/test';

/** The phone widths a real device lands on — the narrowest common phone, a
 * mid one, and the stack breakpoint's own doorstep. */
const WIDTHS = [320, 360, 390];

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

async function createSong(page: Page, name: string): Promise<void> {
  await page.goto('songs');
  await page.getByTestId('songs-add').click();
  const title = page.getByTestId('module-title-input');
  await expect(title).toHaveValue('New song');
  await title.fill(name);
  await title.press('Enter');
  await page.waitForTimeout(700);
  await page.goto('songs');
  await expect(
    page.getByTestId('song-row').filter({ hasText: name }),
  ).toHaveCount(1);
}

async function createSongbook(page: Page, name: string): Promise<void> {
  await page.goto('songbooks');
  await page.getByTestId('songbooks-add').click();
  await expect(page).toHaveURL(/\/songbooks\/.+$/);
  const title = page.getByTestId('module-title-input');
  await expect(title).toHaveValue('New songbook');
  await title.fill(name);
  await title.press('Enter');
  await page.waitForTimeout(300);
}

/**
 * The one assertion this suite exists to make: nothing spills to the right.
 *
 * `checkVisibility` weeds out the off-screen-by-design (the hidden file inputs, a
 * closed overlay, sr-only text), so a flagged element is one a user could see
 * hanging off the edge — not a decoy.
 */
async function expectNoSideOverflow(page: Page): Promise<void> {
  const report = await page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    const offenders: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      if (
        typeof el.checkVisibility === 'function' &&
        !el.checkVisibility({
          opacityProperty: true,
          visibilityProperty: true,
          contentVisibilityAuto: true,
        })
      ) {
        continue;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.right > viewport + 1) {
        const id = el.getAttribute('data-testid');
        const label = id || String(el.className) || el.tagName.toLowerCase();
        offenders.push(`${label.slice(0, 40)} @${Math.round(rect.right)}`);
      }
    }
    return {
      viewport,
      documentScrollWidth: document.documentElement.scrollWidth,
      offenders: [...new Set(offenders)].slice(0, 12),
    };
  });

  expect(
    report.documentScrollWidth,
    'the document scrolls horizontally',
  ).toBeLessThanOrEqual(report.viewport);
  expect(
    report.offenders,
    `visible elements past the right edge (viewport ${report.viewport}px)`,
  ).toEqual([]);
}

test.describe('mobile layout never overflows sideways', () => {
  for (const width of WIDTHS) {
    test(`the song library fits at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 780 });
      // The seeded starter set: real titles and subtitles, some longer than a
      // phone is wide — the case that used to push the row actions off-screen.
      await page.goto('songs?seed');
      await expect(page.getByTestId('song-row').first()).toBeVisible();
      await expectNoSideOverflow(page);
    });

    test(`the songbooks list fits at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 780 });
      await page.goto('songbooks?seed');
      await expect(page.getByTestId('songbook-row').first()).toBeVisible();
      await expectNoSideOverflow(page);
    });

    test(`settings fit at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 780 });
      await page.goto('settings');
      await expect(page.getByTestId('backup')).toBeVisible();
      await expectNoSideOverflow(page);
    });
  }

  // The builder and the editor cost a setup, so they run at the two extremes
  // rather than every step between. The viewport is set **first** — a real phone
  // loads at its width, and building at desktop then shrinking would only prove
  // the app survives a resize (a different, CDK-timed question).
  for (const width of [320, 390]) {
    test(`the songbook builder fits at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 780 });
      await freshLibrary(page);
      await createSong(page, 'A deliberately long song name that will not fit');
      await createSong(page, 'Beta');
      await createSongbook(page, 'Campfire');
      await page
        .getByTestId('song-row')
        .filter({ hasText: 'Beta' })
        .first()
        .click();
      await page.getByTestId('add-end').click();
      await expect(page.getByTestId('entry-row')).toHaveCount(1);

      await expectNoSideOverflow(page);
    });

    test(`the editor fits at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 780 });
      await freshLibrary(page);
      await createSong(page, 'Alpha');
      const id = await page
        .getByTestId('song-row')
        .filter({ hasText: 'Alpha' })
        .first()
        .getAttribute('data-song-id');
      await page.goto(`songs/${id}/edit`);
      await expect(page.getByTestId('module-title-input')).toBeVisible();
      await expectNoSideOverflow(page);
    });
  }
});
