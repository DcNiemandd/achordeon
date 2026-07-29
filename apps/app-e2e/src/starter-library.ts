// Opting a test back into seeding
//
// `playwright.config.ts` puts `achordeon.seed=off` in `storageState`, so a fresh
// browser context means a genuinely empty library — the state most specs were
// written against. The specs that need content have to ask for it, and since the
// `?seed` param is gone (a fresh library now gets the starter set by default) asking
// means clearing that key and booting again.
//
// Shared because three suites want it — the stage's swipe tests, the mobile overflow
// tests, and the songs suite's own first-run tests.

import { type Page } from '@playwright/test';

/**
 * Boot `route` with seeding on, leaving the caller to await whatever it came for.
 *
 * A fresh context is already empty, so this does not clear the database — the suites
 * that also need *that* clear it themselves before calling in. It asserts nothing on
 * purpose: a caller landing on `songbooks` must not be made to wait for song rows.
 */
export async function withStarterLibrary(
  page: Page,
  route = 'songs',
): Promise<void> {
  await page.goto(route);
  await page.evaluate(() => localStorage.removeItem('achordeon.seed'));
  await page.reload();
}
