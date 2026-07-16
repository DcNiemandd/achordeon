// Shell smoke — Epic 13
// Spec: PRD-UI-SHELL.md §12 (swap checklist)
//
// This file is the **mechanical proof that the seam holds**. It selects only on
// `data-testid`, never on a class name and never on DOM structure — so when the
// temporary UI is deleted and the designed one lands, this suite is what tells
// you the business layer never noticed. If a redesign has to rewrite these
// selectors, the seam leaked.
//
// Assert behaviour, not looks. Colours, spacing and glyphs are all expected to
// change; "the rail is gone on a phone" is not.

import { expect, test } from '@playwright/test';

const COMPACT = { width: 390, height: 844 };
const ROOMY = { width: 1440, height: 900 };

test.describe('shell frame', () => {
  test('redirects to songs and mounts the shell', async ({ page }) => {
    await page.goto('./');

    await expect(page.getByTestId('shell')).toBeVisible();
    await expect(page).toHaveURL(/\/songs$/);
  });

  test('above the breakpoint: rail, no bottom bar, both panes', async ({
    page,
  }) => {
    await page.setViewportSize(ROOMY);
    await page.goto('songs');

    await expect(page.getByTestId('rail')).toBeVisible();
    await expect(page.getByTestId('bottom-bar')).toHaveCount(0);
    await expect(page.getByTestId('pane-a')).toBeVisible();
    await expect(page.getByTestId('pane-b')).toBeVisible();
    await expect(page.getByTestId('split-resizer')).toBeVisible();
  });

  test('below the breakpoint: bottom bar, no rail, one pane', async ({
    page,
  }) => {
    await page.setViewportSize(COMPACT);
    await page.goto('songs');

    await expect(page.getByTestId('rail')).toHaveCount(0);
    await expect(page.getByTestId('bottom-bar')).toBeVisible();
    // The split collapses to tabs: same two panes, one visible.
    await expect(page.getByTestId('pane-a')).toBeVisible();
    await expect(page.getByTestId('pane-b')).toBeHidden();
    await expect(page.getByTestId('split-resizer')).toHaveCount(0);
  });

  test('reflows live when the viewport crosses the breakpoint', async ({
    page,
  }) => {
    await page.setViewportSize(ROOMY);
    await page.goto('songs');
    await expect(page.getByTestId('rail')).toBeVisible();

    await page.setViewportSize(COMPACT);

    await expect(page.getByTestId('rail')).toHaveCount(0);
    await expect(page.getByTestId('bottom-bar')).toBeVisible();
  });
});

test.describe('navigation', () => {
  test('the rail reaches every module', async ({ page }) => {
    await page.setViewportSize(ROOMY);
    await page.goto('songs');

    for (const id of ['songbooks', 'stage', 'audience', 'settings']) {
      await page.goto('songs');
      await page.getByTestId(`rail-${id}`).click();
      await expect(page).toHaveURL(new RegExp(`/${id}$`));
    }
  });

  test('the mobile switcher names the active module and follows the route', async ({
    page,
  }) => {
    await page.setViewportSize(COMPACT);
    await page.goto('songs');

    const switcher = page.getByTestId('module-switcher');
    // With no text and no hover tooltip on touch, this label is the only thing
    // a screen reader gets — so it must name the module AND the action.
    await expect(switcher).toHaveAttribute('aria-label', /Songs/);
    await expect(switcher).toHaveAttribute('aria-label', /navigation/i);

    await switcher.click();
    await expect(page.getByTestId('module-nav')).toBeVisible();
    await page.getByTestId('nav-stage').click();

    await expect(page).toHaveURL(/\/stage$/);
    // The glyph is the "you are here" marker down here — the rail's job upstairs.
    await expect(switcher).toHaveAttribute('aria-label', /Stage/);
  });

  test('escape closes the module popup', async ({ page }) => {
    await page.setViewportSize(COMPACT);
    await page.goto('songs');

    await page.getByTestId('module-switcher').click();
    await expect(page.getByTestId('module-nav')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByTestId('module-nav')).toHaveCount(0);
  });
});

test.describe('fullscreen mode', () => {
  test('audience keeps the normal frame — chrome is a mode, not a route', async ({
    page,
  }) => {
    await page.setViewportSize(ROOMY);
    await page.goto('audience');

    await expect(page.getByTestId('rail')).toBeVisible();
    await expect(page.getByTestId('audience-fullscreen')).toBeVisible();
  });

  test('entering hides the chrome; moving the pointer brings it back', async ({
    page,
  }) => {
    await page.setViewportSize(ROOMY);
    await page.goto('audience');

    await page.getByTestId('audience-fullscreen').click();

    // The bars fade after the idle delay — that is the whole point of the mode.
    await expect(page.getByTestId('rail')).toHaveCount(0, { timeout: 6000 });

    // ...and any movement brings them straight back, wherever you are.
    await page.mouse.move(700, 400);
    await expect(page.getByTestId('rail')).toBeVisible();
  });
});

test.describe('split pane', () => {
  test('a dragged ratio survives a reload', async ({ page }) => {
    await page.setViewportSize(ROOMY);
    await page.goto('songs');

    const before = await page.getByTestId('pane-a').boundingBox();
    const resizer = page.getByTestId('split-resizer');
    const box = await resizer.boundingBox();

    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(400, box!.y + box!.height / 2, { steps: 10 });
    await page.mouse.up();

    const after = await page.getByTestId('pane-a').boundingBox();
    expect(after!.width).toBeLessThan(before!.width);

    await page.reload();

    // localStorage, not IndexedDB, precisely so this lands before first paint.
    const restored = await page.getByTestId('pane-a').boundingBox();
    expect(Math.abs(restored!.width - after!.width)).toBeLessThan(4);
  });

  test('never drags pane A below the width its settings dialog needs', async ({
    page,
  }) => {
    await page.setViewportSize(ROOMY);
    await page.goto('songs');

    const resizer = page.getByTestId('split-resizer');
    const box = await resizer.boundingBox();

    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(0, box!.y + box!.height / 2, { steps: 10 });
    await page.mouse.up();

    // 320px is sized to hold the render-settings dialog (~300px) so it can never
    // spill over the render. Coupled numbers — see PRD-UI-SHELL.md §5.1.
    const paneA = await page.getByTestId('pane-a').boundingBox();
    expect(paneA!.width).toBeGreaterThanOrEqual(319);
  });
});

test.describe('theme', () => {
  test('follows the OS by default and keeps the page white in dark', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ colorScheme: 'dark' });
    const page = await ctx.newPage();
    await page.setViewportSize(ROOMY);
    await page.goto('songs');

    // 'system' must leave data-theme OFF, or the sheet cannot follow the OS.
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/);

    const chrome = await page
      .getByTestId('rail')
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(chrome).not.toBe('rgb(255, 255, 255)');

    await ctx.close();
  });
});
