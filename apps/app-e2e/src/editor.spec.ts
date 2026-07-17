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

  test('the chord button brackets the selection, keeping the text', async ({
    page,
  }) => {
    await type(page, 'Am');
    await page.keyboard.press('Shift+Home'); // select "Am"
    await page.getByTestId('insert-chord').click();

    await expect(page.getByTestId('editor')).toContainText('[Am]');
  });

  test('the chord button leaves the caret inside an empty bracket', async ({
    page,
  }) => {
    await type(page, 'sing');
    await page.getByTestId('insert-chord').click();
    // The caret must be BETWEEN the brackets — that is where the chord goes.
    await page.keyboard.type('C');

    await expect(page.getByTestId('editor')).toContainText('sing[C]');
  });

  test('the title button marks the line, not the cursor', async ({ page }) => {
    await type(page, 'Wonderwall');
    // Caret is at end-of-line; the marker still has to land at column 0, or the
    // grammar does not see a title at all.
    await page.getByTestId('insert-title').click();

    await expect(page.getByTestId('editor')).toContainText('* Wonderwall');
  });

  test('transpose rewrites the source, and undo takes it back', async ({
    page,
  }) => {
    await type(page, 'sing [Am]this and [G]that, but not [Solo]');

    await page.getByTestId('transpose-up').click();
    const editor = page.getByTestId('editor');
    await expect(editor).toContainText('[A#m]');
    await expect(editor).toContainText('[G#]');
    // An invalid bracket is an annotation: never transposed (PARSER-GRAMMAR).
    await expect(editor).toContainText('[Solo]');

    // CONTEXT.md §Transpose: it is a mutating source edit, so undo covers it.
    await page.getByTestId('editor-undo').click();
    await expect(editor).toContainText('[Am]');
  });

  test('transposing down prefers flats', async ({ page }) => {
    await type(page, '[A]');
    await page.getByTestId('transpose-down').click();

    // Direction-based spelling (CONTEXT.md §Transpose): down → flats.
    await expect(page.getByTestId('editor')).toContainText('[Ab]');
  });

  test('redo puts back what undo took', async ({ page }) => {
    await type(page, 'verse');
    await page.getByTestId('editor-undo').click();
    await expect(page.getByTestId('editor')).not.toContainText('verse');

    await page.getByTestId('editor-redo').click();
    await expect(page.getByTestId('editor')).toContainText('verse');
  });

  test('renders the song live, in the pane next to the text', async ({
    page,
  }) => {
    await type(
      page,
      '* Wonderwall\n** Oasis\n\n1.: Today is [Em7]gonna be the day',
    );

    const render = page.getByTestId('song-render');
    await expect(render.locator('svg')).toBeVisible();
    // The AST reached the page: title, subtitle, label and a chord, each drawn
    // as its own text run.
    await expect(render).toContainText('Wonderwall');
    await expect(render).toContainText('Oasis');
    await expect(render).toContainText('Em7');
    // Brackets are markup: they are gone from the render, and the chord floats
    // above the lyric instead.
    await expect(render).toContainText('Today is gonna be the day');
    await expect(render).not.toContainText('[Em7]');
  });

  test('the preview follows an edit', async ({ page }) => {
    await type(page, '* Wonderwall');
    await expect(page.getByTestId('song-render')).toContainText('Wonderwall');

    // Keep typing on the same title — a SECOND `*` line would not show up here,
    // and rightly so: last wins, so it would shadow this one (PARSER-GRAMMAR).
    await page.keyboard.insertText(' Live');

    await expect(page.getByTestId('song-render')).toContainText(
      'Wonderwall Live',
    );
  });

  test('lays the render out with the font it actually draws with', async ({
    page,
  }) => {
    // Regression: `measure` named only the (absent) bundled family, so the canvas
    // fell back to its default while the SVG fell back to the CSS stack. Every
    // width was measured against a font that was never drawn, and lyrics ran off
    // the page. The measured box must contain the ink.
    await type(
      page,
      "1.: That they're [Dsus4]gonna throw it [A7sus4]back to you",
    );
    await page.waitForTimeout(300);

    const overflow = await page.evaluate(() => {
      const svg = document.querySelector(
        '[data-testid="song-render"] svg',
      ) as SVGSVGElement;
      const box = svg.viewBox.baseVal;
      return Array.from(svg.querySelectorAll('text')).map((t) => {
        const ink = (t as SVGTextElement).getBBox();
        return ink.x + ink.width - box.width;
      });
    });

    for (const past of overflow) {
      expect(past).toBeLessThanOrEqual(1); // a hair for rounding, not a word
    }
  });

  test('a title that looks like markup is text, not markup', async ({
    page,
  }) => {
    // Song content is user input (PRD-INFRASTRUCTURE.md §7). It reaches the DOM
    // through emit + DOMParser, and must arrive as characters.
    await type(page, '* <img src=x onerror="window.__pwned = 1">');
    await page.waitForTimeout(300);

    await expect(page.getByTestId('song-render')).toContainText('<img');
    expect(await page.evaluate(() => '__pwned' in window)).toBe(false);
    expect(await page.locator('[data-testid="song-render"] img').count()).toBe(
      0,
    );
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
