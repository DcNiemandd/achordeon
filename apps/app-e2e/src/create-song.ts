// Making a song from the UI, for the suites that need one to act on
//
// Shared because two suites had identical copies and the interesting part of it —
// how the new row is identified — is subtle enough that a fix has to land once.

import { expect, type Page } from '@playwright/test';

/**
 * Create a song, name it, and come back to the explorer — creating opens the editor.
 *
 * The new row is found by the **id in the editor's URL**. Not by position, because
 * the list is sorted and "the one I just made" is not "the last one"; and not by its
 * default name either, because the new-song skeleton's title line and the default
 * Name are the same string and the row prints both — so "the row that says New song"
 * matches every row already renamed away from it, and naming three songs in a row
 * quietly renamed the same one three times.
 */
export async function createSong(page: Page, name: string): Promise<void> {
  await page.getByTestId('songs-add').click();
  await expect(page).toHaveURL(/\/songs\/.+\/edit$/);
  const id = /\/songs\/([^/]+)\/edit/.exec(page.url())?.[1] as string;
  await page.goBack();

  const row = page
    .getByTestId('song-row')
    .filter({ has: page.locator(`[data-testid="open-${id}"]`) });
  await expect(row).toBeVisible();

  await row.hover();
  await page.getByTestId(`rename-${id}`).click();
  await page.getByTestId(`rename-input-${id}`).fill(name);
  await page.getByTestId(`rename-input-${id}`).press('Enter');
  await expect(
    page.getByTestId('song-row').filter({ hasText: name }),
  ).toHaveCount(1);
}
