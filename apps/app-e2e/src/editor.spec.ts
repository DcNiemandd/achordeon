// Song editor smoke — Epic 5
// Spec: ADR-0010; docs/PARSER-GRAMMAR.md
//
// `data-testid` only, like the rest of the suite. These assert what the editor
// *is* — highlighted text, warned text, typed text that survives — never that
// CodeMirror is what provides it. If the editor is ever swapped (ADR-0010 says
// that must stay cheap), this file should still pass unchanged.

import { expect, test, type Page } from '@playwright/test';

const ROOMY = { width: 1440, height: 900 };

async function freshEditor(page: Page): Promise<void> {
  await page.setViewportSize(ROOMY);
  await page.goto('songs');
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase('achordeon');
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
      }),
  );
  await page.reload();
  await page.getByTestId('songs-add').click();
  await expect(page).toHaveURL(/\/songs\/.+\/edit$/);
  await expect(page.getByTestId('editor')).toBeVisible();
}

/** Type into the editor's content area. */
async function type(page: Page, text: string): Promise<void> {
  await page.getByTestId('editor').locator('.cm-content').click();
  await page.keyboard.insertText(text);
}

test.describe('song editor', () => {
  test.beforeEach(async ({ page }) => {
    await freshEditor(page);
  });

  test('accepts typed content', async ({ page }) => {
    await type(page, 'Hello [C]world');

    await expect(page.getByTestId('editor')).toContainText('Hello');
  });

  test('colours the parts of the language differently', async ({ page }) => {
    await type(page, '* My title\n** My subtitle\nVerse: sing [C]this\n');

    const editor = page.getByTestId('editor');
    // Asserted by role, not by colour: the point is that the grammar recognised
    // four different things, not what shade each one came out.
    await expect(editor.locator('.cm-line').first()).toContainText('My title');
    const classes = await editor
      .locator('.cm-line span[class]')
      .evaluateAll((spans) => spans.map((s) => s.className));
    // Four distinct token classes: title, subtitle, label, chord.
    expect(new Set(classes).size).toBeGreaterThanOrEqual(4);
  });

  test('an invalid bracket is an annotation, not a chord', async ({ page }) => {
    await type(page, '[C]real and [Solo]not');

    // PARSER-GRAMMAR §Chord validity: `[Solo]` is a verbatim annotation. The two
    // must not look alike, or the user cannot tell what will transpose.
    const styled = await page
      .getByTestId('editor')
      .locator('.cm-line span[class]')
      .evaluateAll((spans) =>
        spans.map((s) => ({ text: s.textContent, cls: s.className })),
      );
    const chord = styled.find((s) => s.text === '[C]');
    const annotation = styled.find((s) => s.text === '[Solo]');
    expect(chord).toBeDefined();
    expect(annotation).toBeDefined();
    expect(chord?.cls).not.toEqual(annotation?.cls);
  });

  test('underlines a shadowed title, and says why', async ({ page }) => {
    await type(page, '* First\n* Second\n');

    // "Last wins" — the first title is ignored, and the editor says so where it
    // happened rather than in a status bar somewhere.
    const warned = page.getByTestId('editor').locator('.cm-lintRange-warning');
    await expect(warned).toHaveCount(1);
    await expect(warned).toContainText('First');
  });

  test('the warning clears once the shadowing is gone', async ({ page }) => {
    await type(page, '* First\n* Second');
    await expect(
      page.getByTestId('editor').locator('.cm-lintRange-warning'),
    ).toHaveCount(1);

    // Remove the second title: nothing shadows anything now.
    for (let i = 0; i < '* Second'.length; i++) {
      await page.keyboard.press('Backspace');
    }

    await expect(
      page.getByTestId('editor').locator('.cm-lintRange-warning'),
    ).toHaveCount(0);
  });

  test('opens a song by deep link, without the list ever loading it', async ({
    page,
  }) => {
    const url = page.url();

    // A cold navigation straight to the editor: the store's window has never
    // held this row, so the song has to come from the repository.
    await page.goto(url);

    await expect(page.getByTestId('editor')).toBeVisible();
    await expect(page.getByTestId('module-title')).toHaveText('New song');
  });
});
