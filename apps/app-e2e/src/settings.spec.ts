// Settings — global render defaults — Epic 5 follow-up
// Spec: ADR-0006 (Global is the base of the cascade); PRD-UI-SHELL.md §4
//
// `data-testid` only, like the rest of the suite. Assertions use Playwright's
// auto-retrying `expect` rather than immediate reads, so a signal update + change
// detection tick doesn't race the check.

import { expect, test } from '@playwright/test';

test.describe('global render settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('settings');
    await expect(page.getByTestId('settings-panel')).toBeVisible();
  });

  // Settings is a destination, not a peer: you come to change one thing and go
  // back to what you were doing.
  test('escape steps back through history to where you were', async ({
    page,
  }) => {
    await page.goto('songbooks');
    await page.getByTestId('rail-settings').click();
    await expect(page.getByTestId('settings-panel')).toBeVisible();

    await page.locator('body').press('Escape');
    await expect(page).toHaveURL(/\/songbooks/);
  });

  // The floor under the history: a bookmark, a shared link or a reload lands
  // here with nothing behind it, and back() would walk out of the app entirely.
  test('escape lands somewhere sensible with no history behind it', async ({
    page,
  }) => {
    await page.goto('settings');
    await expect(page.getByTestId('settings-panel')).toBeVisible();

    await page.locator('body').press('Escape');
    await expect(page).toHaveURL(/\/songs/);
  });

  test('a value at its default has no reset button', async ({ page }) => {
    // Nothing to reset a default to — the button appears only once it moves off.
    await expect(page.getByTestId('reset-columns')).toHaveCount(0);
    await expect(page.getByTestId('reset-aspectRatio')).toHaveCount(0);
  });

  test('a stepped value shows a reset that returns it to the default', async ({
    page,
  }) => {
    const value = page.getByTestId('input-columns');

    await page.getByTestId('inc-columns').click();
    await expect(value).toHaveValue('2');
    await expect(page.getByTestId('reset-columns')).toBeVisible();

    await page.getByTestId('reset-columns').click();
    // Back to the registry default, and the reset retires itself.
    await expect(value).toHaveValue('1');
    await expect(page.getByTestId('reset-columns')).toHaveCount(0);
  });

  // The steps are fine for a nudge; reaching 2.5 from 1 at 0.1 a click is not.
  test('a stepped value can be typed', async ({ page }) => {
    const value = page.getByTestId('input-chordSize');

    await value.fill('2.5');
    await value.press('Enter');
    await expect(value).toHaveValue('2.5');
    await expect(page.getByTestId('reset-chordSize')).toBeVisible();
  });

  // Refused, not repaired. Clamping 99 to 3 looks like the app accepted what you
  // typed, and you only find out it did not by re-reading the field.
  test('a bad number is refused with a reason, and nothing is saved', async ({
    page,
  }) => {
    const value = page.getByTestId('input-chordSize');

    await value.fill('99');
    await value.press('Enter');
    await expect(page.getByTestId('error-chordSize')).toBeVisible();
    await expect(value).toHaveAttribute('aria-invalid', 'true');
    // Your text is still there to correct, and nothing was written.
    await expect(value).toHaveValue('99');
    await expect(page.getByTestId('reset-chordSize')).toHaveCount(0);

    await value.fill('abc');
    await value.press('Enter');
    await expect(page.getByTestId('error-chordSize')).toBeVisible();

    // Correcting it clears the error and saves.
    await value.fill('1.5');
    await value.press('Enter');
    await expect(page.getByTestId('error-chordSize')).toHaveCount(0);
    await expect(page.getByTestId('reset-chordSize')).toBeVisible();
  });

  // Whole vs fractional comes from the row's own step, not a second list.
  test('a counting setting refuses a fraction', async ({ page }) => {
    const value = page.getByTestId('input-columns');

    await value.fill('2.5');
    await value.press('Enter');
    await expect(page.getByTestId('error-columns')).toContainText('Whole');
    await expect(page.getByTestId('reset-columns')).toHaveCount(0);

    // A fraction is fine on a setting whose step is fractional.
    const padding = page.getByTestId('input-padding');
    await padding.fill('1.25');
    await padding.press('Enter');
    await expect(page.getByTestId('error-padding')).toHaveCount(0);
  });

  // Scale is a number you nudge, plus one named answer that is not a number.
  test('scale steps as a number and has an auto preset', async ({ page }) => {
    const value = page.getByTestId('input-scale');
    await expect(value).toHaveValue('auto');

    // Stepping away from auto lands next to 1, not at the range floor.
    await page.getByTestId('inc-scale').click();
    await expect(value).toHaveValue('1.01');

    await page.getByTestId('scale-auto').click();
    await expect(value).toHaveValue('auto');

    // Typed by hand, the preset is exactly as legal as clicking it.
    await value.fill('0.5');
    await value.press('Enter');
    await expect(page.getByTestId('error-scale')).toHaveCount(0);
    await value.fill('auto');
    await value.press('Enter');
    await expect(page.getByTestId('error-scale')).toHaveCount(0);

    await value.fill('nonsense');
    await value.press('Enter');
    await expect(page.getByTestId('error-scale')).toBeVisible();
  });

  // The renderer's own reader decides, so the form cannot drift from the page.
  test('an unreadable aspect ratio is refused, not stored', async ({
    page,
  }) => {
    const field = page.getByTestId('input-aspectRatio');

    await field.fill('3:x');
    await field.press('Enter');
    await expect(page.getByTestId('error-aspectRatio')).toBeVisible();
    await expect(page.getByTestId('reset-aspectRatio')).toHaveCount(0);

    // Every dialect the renderer accepts is accepted here too.
    for (const good of ['3:4', '3/4', '0.75', 'A4']) {
      await field.fill(good);
      await field.press('Enter');
      await expect(page.getByTestId('error-aspectRatio')).toHaveCount(0);
    }
  });

  // A closed list: every valid answer is in it, so there is nothing to type.
  test('the title font is a plain dropdown, with no free-text field', async ({
    page,
  }) => {
    await expect(page.getByTestId('select-titleFont')).toBeVisible();
    await expect(page.getByTestId('input-titleFont')).toHaveCount(0);

    await page.getByTestId('select-titleFont').selectOption('serif');
    await expect(page.getByTestId('reset-titleFont')).toBeVisible();
  });

  test('a picked value resets to the default too', async ({ page }) => {
    const field = page.getByTestId('input-aspectRatio');

    await page.getByTestId('select-aspectRatio').selectOption('16:9');
    await expect(field).toHaveValue('16:9');
    await expect(page.getByTestId('reset-aspectRatio')).toBeVisible();

    await page.getByTestId('reset-aspectRatio').click();
    await expect(field).toHaveValue('A4');
    await expect(page.getByTestId('reset-aspectRatio')).toHaveCount(0);
  });
});
