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
  test('a stepped value can be typed, and is clamped to its range', async ({
    page,
  }) => {
    const value = page.getByTestId('input-chordSize');

    await value.fill('2.5');
    await value.press('Enter');
    await expect(value).toHaveValue('2.5');

    // Above the maximum snaps to it: "as many as I can have" is a real intent,
    // and the field says what that turned out to be.
    await value.fill('99');
    await value.press('Enter');
    await expect(value).toHaveValue('3');

    // Not a number at all snaps back — the field has to show something, and the
    // old value is the only honest candidate.
    await value.fill('abc');
    await value.press('Enter');
    await expect(value).toHaveValue('3');
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
