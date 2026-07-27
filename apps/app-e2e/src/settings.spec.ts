// Settings — global render defaults — Epic 5 follow-up
// Spec: ADR-0006 (Global is the base of the cascade); PRD-UI-SHELL.md §4
//
// `data-testid` only, like the rest of the suite. Assertions use Playwright's
// auto-retrying `expect` rather than immediate reads, so a signal update + change
// detection tick doesn't race the check.

import { expect, test, type Page } from '@playwright/test';

/**
 * The saved global settings, read straight off the account row.
 *
 * A reload started in the same millisecond as an edit will beat the IndexedDB
 * write to disk — the write is a few ms of transaction, and navigation aborts
 * whatever is still in flight. That is a real (and tiny) window for a user who
 * closes the tab mid-click, and an unreal one for a test, which reloads with no
 * human delay in front of it at all. So the persistence tests wait for the row
 * rather than for a stretch of time: precise about what they need, and they say
 * "saved" out loud instead of "500ms should do it".
 */
function savedSettings(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate(
    () =>
      new Promise<Record<string, unknown> | null>((resolve, reject) => {
        const open = indexedDB.open('achordeon');
        open.onsuccess = () => {
          const read = open.result.transaction('user', 'readonly');
          const row = read.objectStore('user').get('local-user');
          row.onsuccess = () => resolve(row.result?.settings ?? null);
          row.onerror = () => reject(row.error);
        };
        open.onerror = () => reject(open.error);
      }),
  );
}

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

  // The one preset the app has to compute rather than know. It must land as a
  // plain ratio: a sentinel that meant "whatever device is reading this" would
  // change the shape of the song the moment it synced to a desktop.
  test('matching this screen stores the screen, not a promise to look it up', async ({
    page,
  }) => {
    const expected = await page.evaluate(() => {
      const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
      const { width, height } = window.screen;
      const divisor = gcd(width, height);
      return `${width / divisor}:${height / divisor}`;
    });

    await page.getByTestId('select-aspectRatio').selectOption('@screen');

    await expect(page.getByTestId('input-aspectRatio')).toHaveValue(expected);
    await expect(page.getByTestId('error-aspectRatio')).toHaveCount(0);
    await expect
      .poll(async () => (await savedSettings(page))?.['aspectRatio'])
      .toBe(expected);
  });

  // A picker this long only works if the answers arrive sorted into kinds. Which
  // kinds, and which rows, is the list's business — so this reads them off the
  // page rather than naming them, and stays true whatever the list decides.
  test('the aspect picker is grouped, and every group is pickable', async ({
    page,
  }) => {
    const picker = page.getByTestId('select-aspectRatio');
    await expect(picker.locator('optgroup')).not.toHaveCount(0);

    // The last row of the last group: proves the whole list reached the DOM and
    // that a grouped option sets the value like any other.
    const last = await picker
      .locator('optgroup')
      .last()
      .locator('option')
      .last()
      .getAttribute('value');

    await picker.selectOption(last as string);
    await expect(page.getByTestId('input-aspectRatio')).toHaveValue(
      last as string,
    );
    await expect(page.getByTestId('error-aspectRatio')).toHaveCount(0);
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

  // Global is the base of the cascade (ADR-0006), and a base that lasts until the
  // next reload is not a default. The bag lives in the account row; the reload is
  // the only honest way to check it got there.
  test('a global default survives a reload', async ({ page }) => {
    await page.getByTestId('select-aspectRatio').selectOption('16:9');
    await page.getByTestId('inc-columns').click();
    await expect(page.getByTestId('input-columns')).toHaveValue('2');
    await expect
      .poll(async () => (await savedSettings(page))?.['columns'])
      .toBe(2);

    await page.reload();
    await expect(page.getByTestId('settings-panel')).toBeVisible();

    await expect(page.getByTestId('input-aspectRatio')).toHaveValue('16:9');
    await expect(page.getByTestId('input-columns')).toHaveValue('2');
    // Not merely displayed — still off its default, so the cascade sees it too.
    await expect(page.getByTestId('reset-aspectRatio')).toBeVisible();
  });

  // A reset is a change like any other: it has to outlive the reload as well, or
  // the setting comes back from the dead.
  test('a reset survives a reload', async ({ page }) => {
    await page.getByTestId('select-aspectRatio').selectOption('16:9');
    await expect(page.getByTestId('reset-aspectRatio')).toBeVisible();
    await page.getByTestId('reset-aspectRatio').click();
    await expect
      .poll(async () => (await savedSettings(page))?.['aspectRatio'])
      .toBe('A4');

    await page.reload();
    await expect(page.getByTestId('settings-panel')).toBeVisible();

    await expect(page.getByTestId('input-aspectRatio')).toHaveValue('A4');
    await expect(page.getByTestId('reset-aspectRatio')).toHaveCount(0);
  });
});

test.describe('settings — stubs and backup (Epic 7 follow-up)', () => {
  test.beforeEach(async ({ page }) => {
    // Force the anchor download, not the native save picker Playwright cannot
    // drive (see transfer.spec for the full reasoning).
    await page.addInitScript(() => {
      // @ts-expect-error deleting an optional platform API for the test
      delete window.showSaveFilePicker;
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('settings');
    await expect(page.getByTestId('settings-panel')).toBeVisible();
  });

  test('the coming-soon settings are shown but disabled', async ({ page }) => {
    // Present, so the shape of the app is honest — but not operable, so nothing
    // pretends to work.
    await expect(page.getByTestId('font-library')).toBeVisible();
    await expect(page.getByTestId('font-library')).toBeDisabled();
  });

  // Chord notation used to be one of the stubs above. It is a registry row now,
  // so it appears in the render panel and works like every other setting — which
  // is the assertion: it is no longer disabled, and it is no longer down there.
  test('chord notation is a real setting, not a coming-soon stub', async ({
    page,
  }) => {
    const german = page
      .getByTestId('setting-notation')
      .getByTestId('notation-german');
    await expect(german).toBeEnabled();

    await german.click();
    await expect(page.getByTestId('reset-notation')).toBeVisible();
  });

  test('backs the whole library up to a file', async ({ page }) => {
    const waiting = page.waitForEvent('download', { timeout: 30_000 });
    await page.getByTestId('backup').click();
    const download = await waiting;
    expect(download.suggestedFilename()).toMatch(/^achordeon-backup-.*\.json$/);
  });

  test('restore asks first — picking a file does not replace anything yet', async ({
    page,
  }) => {
    await page.getByTestId('restore-input').setInputFiles({
      name: 'backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{}'),
    });
    // The confirm stands between the file and the irreversible replace.
    await expect(page.getByTestId('restore-dialog')).toBeVisible();
    await page.getByTestId('restore-cancel').click();
    await expect(page.getByTestId('restore-dialog')).toHaveCount(0);
  });

  test('a damaged backup file is refused, library untouched', async ({
    page,
  }) => {
    await page.getByTestId('restore-input').setInputFiles({
      name: 'broken.json',
      mimeType: 'application/json',
      buffer: Buffer.from('not a database'),
    });
    await page.getByTestId('restore-confirm').click();
    await expect(page.getByTestId('restore-error-dialog')).toBeVisible();
  });
});

// --- Language (Epic 11 ▸ i18n) -----------------------------------------------
//
// One bundle, translations loaded at boot (PRD-INFRASTRUCTURE.md §11), so a switch
// is a reload of the same URL — and the proof that it worked is that a translated
// string comes back in Czech.
test.describe('language', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('settings');
    await expect(page.getByTestId('settings-panel')).toBeVisible();
  });

  test('marks the language the app booted in', async ({ page }) => {
    await expect(page.getByTestId('language-en')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByTestId('language-cs')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('choosing the language already running spends no reload', async ({
    page,
  }) => {
    await page.getByTestId('language-en').click();

    // Still here, still on settings — and the choice is now explicit.
    await expect(page.getByTestId('settings-panel')).toBeVisible();
    await expect(
      page.evaluate(() => localStorage.getItem('achordeon.language')),
    ).resolves.toBe('en');
  });

  test('switching reloads the same URL into the other language', async ({
    page,
  }) => {
    const before = page.url();
    await page.getByTestId('language-cs').click();

    await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
    expect(page.url()).toBe(before);
    await expect(
      page.evaluate(() => localStorage.getItem('achordeon.language')),
    ).resolves.toBe('cs');

    // The translated string arrived from locale/cs.json before the first render.
    await expect(page.getByTestId('language-heading')).toHaveText('Jazyk');
    // And so did one from a different corner of the page, so this is the catalog
    // arriving in time, not a single lucky message.
    await expect(page.getByTestId('theme-system')).toHaveText('Systémový');
  });

  test('the choice survives a fresh load', async ({ page }) => {
    await page.getByTestId('language-cs').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'cs');

    await page.goto('songs');
    await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
  });
});

// The About block — the last section, and the only rows on the page that leave
// the app. The docs link is asserted by SHAPE (it ends in the right doc path)
// rather than by a full URL: the origin is the base href the bundle was built
// with, which differs between `nx serve` and a deploy, and pinning it here would
// make the test a statement about the dev server instead of about the link.
test.describe('about', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('settings');
    await expect(page.getByTestId('settings-panel')).toBeVisible();
  });

  test('links out to the docs, the tracker, and names the build', async ({
    page,
  }) => {
    const docs = page.getByTestId('about-docs');
    await expect(docs).toHaveAttribute('href', /\/docs\/intro$/);
    // A new tab, so a half-written song is not navigated away from.
    await expect(docs).toHaveAttribute('target', '_blank');

    await expect(page.getByTestId('about-issues')).toHaveAttribute(
      'href',
      'https://github.com/DcNiemandd/achordeon/issues',
    );

    // The commit date of the build, which is what makes a bug report placeable.
    await expect(page.getByTestId('about-version')).toHaveText(
      /^\d{4}-\d{2}-\d{2}$/,
    );
  });

  test('the docs link follows the UI language', async ({ page }) => {
    await expect(page.getByTestId('about-docs')).toHaveAttribute(
      'href',
      /\/docs\/intro$/,
    );

    // Switching reloads the app; the link comes back pointing at the Czech docs,
    // which is a different Docusaurus locale and so a different path.
    await page.getByTestId('language-cs').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
    await expect(page.getByTestId('about-docs')).toHaveAttribute(
      'href',
      /\/cs\/docs\/intro$/,
    );
  });
});
