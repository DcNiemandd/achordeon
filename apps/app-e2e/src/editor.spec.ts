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
  await clearEditor(page);
}

/**
 * Empty the editor.
 *
 * A new song is born holding the tutorial (`songs/new-song.ts`), which is the
 * point of it — but every test below is about what the editor does with *its own*
 * content, so it starts from a blank sheet. The starter content has its own test
 * in `songs.spec.ts`.
 */
async function clearEditor(page: Page): Promise<void> {
  await page.getByTestId('editor').locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  // Not toHaveText(''): CodeMirror always keeps one empty .cm-line, so an empty
  // document is one blank line rather than no text at all.
  await expect(page.getByTestId('editor').locator('.cm-line')).toHaveCount(1);
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

  // A repeat sign wraps real chords in tokens that are not chords. Colouring the
  // whole bracket one way forced a choice between two lies — grey out the chords,
  // or paint the repeat signs as if they were chords — so it is read token by
  // token, and says exactly what the parser will act on.
  test('inside a bracket, only the real chords are coloured', async ({
    page,
  }) => {
    // Spaces around the repeat signs, so they are tokens of their own. Written
    // `[||\:Em,G:||]` the outer tokens are `||\:Em` and `G:||` — neither of which
    // is a chord, exactly as the parser reads them.
    await type(page, '[||\\: Em, G :||] [Solo] [C]');

    const styled = await page
      .getByTestId('editor')
      .locator('.cm-line')
      .first()
      .evaluate((line) =>
        [...line.childNodes].map((node) => ({
          text: node.textContent,
          cls: node instanceof HTMLElement ? node.className : null,
        })),
      );
    const at = (text: string) => styled.find((s) => s.text === text);
    const chordClass = at('[C]')?.cls;

    expect(chordClass).toBeTruthy();
    // The brackets belong to the chords they hold.
    expect(at('[')?.cls).toEqual(chordClass);
    expect(at(']')?.cls).toEqual(chordClass);
    expect(at('G')?.cls).toEqual(chordClass);
    expect(at('Em')?.cls).toEqual(chordClass);
    // The repeat signs are text: unstyled, and never transposed.
    expect(styled.find((s) => s.text?.includes('||\\:'))?.cls).toBeNull();
    expect(styled.find((s) => s.text?.includes(':||'))?.cls).toBeNull();
    // A bracket with no chord at all is still one verbatim annotation.
    expect(at('[Solo]')?.cls).toBeTruthy();
    expect(at('[Solo]')?.cls).not.toEqual(chordClass);
  });

  test('title and subtitle buttons replace each other, never stack', async ({
    page,
  }) => {
    await type(page, 'Hello there');

    await page.getByTestId('insert-title').click();
    await page.getByTestId('insert-title').click();
    await page.getByTestId('insert-title').click();
    await expect(page.getByTestId('editor')).toContainText('* Hello there');
    await expect(page.getByTestId('editor')).not.toContainText('* * ');

    await page.getByTestId('insert-subtitle').click();
    await expect(page.getByTestId('editor')).toContainText('** Hello there');
  });

  test('the label button opens an empty label and puts the caret in it', async ({
    page,
  }) => {
    await type(page, 'sing this line');

    // Not `: ` at the cursor — that would make the finished line its own label.
    await page.getByTestId('insert-label').click();
    await page.keyboard.insertText('Chorus');

    await expect(page.getByTestId('editor')).toContainText(
      'Chorus: sing this line',
    );
  });

  // A `*` line never reaches the inline scan, so a chord typed into a title is
  // the literal text "[C]" — which then prints on the page.
  test('chord and label are disabled on a title or subtitle line', async ({
    page,
  }) => {
    const chord = page.getByTestId('insert-chord');
    const label = page.getByTestId('insert-label');

    await type(page, 'a lyric line');
    await expect(chord).toBeEnabled();

    await type(page, '\n* My title');
    await expect(chord).toBeDisabled();
    await expect(label).toBeDisabled();

    await type(page, '\n** My subtitle');
    await expect(chord).toBeDisabled();

    // And moving the caret back to content re-enables them — it follows the
    // caret, not just what was typed last.
    await type(page, '\nback to lyrics');
    await expect(chord).toBeEnabled();
    await expect(label).toBeEnabled();
  });

  // Brackets do not nest: a second `[` inside one closes nothing, and the parser
  // reads the whole thing as a single malformed bracket.
  test('the chord button is disabled while the caret is inside a chord', async ({
    page,
  }) => {
    const chord = page.getByTestId('insert-chord');

    await type(page, 'sing [C] here');
    await expect(chord).toBeEnabled();

    // Into the middle of the bracket.
    await page.keyboard.press('Home');
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('ArrowRight');
    }
    await expect(chord).toBeDisabled();

    // Out the other side of it.
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('ArrowRight');
    }
    await expect(chord).toBeEnabled();
  });

  // One label per line: a second press used to prepend another delimiter,
  // inventing an empty label in front of the real one.
  test('the label button goes to an existing label instead of adding one', async ({
    page,
  }) => {
    await type(page, 'Chorus: sing this');

    await page.getByTestId('insert-label').click();
    await page.keyboard.insertText('!');

    // Landed at the end of the label's name, just before the delimiter.
    await expect(page.getByTestId('editor')).toContainText(
      'Chorus!: sing this',
    );
  });

  // Tab pads to the next stop AT THE CURSOR, in spaces. Not the line, because
  // you press it to push what is after the caret across; not a tab character,
  // because chord anchors are character indices and a \t has no dependable width.
  test('tab pads to the next stop at the cursor', async ({ page }) => {
    await type(page, 'ab');
    await page.keyboard.press('Tab');
    await page.keyboard.insertText('|');

    const line = () =>
      page.getByTestId('editor').locator('.cm-line').first().innerText();
    // Column 2 → pad to column 4, so two spaces, then the marker.
    expect(await line()).toBe('ab  |');
    expect(await line()).not.toContain('\t');

    // Focus stayed in the editor: the toolbar did not steal it.
    await page.keyboard.insertText('x');
    await expect(page.getByTestId('editor')).toContainText('x');
  });

  test('tab from column 0 fills a whole stop', async ({ page }) => {
    await type(page, 'la');
    await page.keyboard.press('Home');
    await page.keyboard.press('Tab');

    expect(
      await page.getByTestId('editor').locator('.cm-line').first().innerText(),
    ).toBe('    la');
  });

  test('pressing Title on a title line just goes to the end of it', async ({
    page,
  }) => {
    await type(page, '* My title');
    await page.keyboard.press('Home'); // caret to column 0

    await page.getByTestId('insert-title').click();
    await page.keyboard.insertText('!');

    // No second marker, and the caret landed where you would write.
    await expect(page.getByTestId('editor')).toContainText('* My title!');
  });

  test('the block button breaks after the line, not at the cursor', async ({
    page,
  }) => {
    await type(page, 'one two');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft'); // caret inside "two"

    await page.getByTestId('insert-block').click();
    await page.keyboard.insertText('next');

    // The word survived: the boundary went after the line, not through it.
    await expect(page.getByTestId('editor')).toContainText('one two');
    await expect(page.getByTestId('editor')).toContainText('next');
  });

  test('the block button stops adding blank lines to a blank block', async ({
    page,
  }) => {
    await type(page, 'a');
    for (let i = 0; i < 3; i++) {
      await page.getByTestId('insert-block').click();
    }

    // One boundary, however many times it was pressed: 'a', '', ''.
    await expect(page.getByTestId('editor').locator('.cm-line')).toHaveCount(3);
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

  test('a long song is scaled to fit the pane, never overflowing it', async ({
    page,
  }) => {
    // Regression: a tall song filled the render pane's width and ran off the
    // bottom — the page sized to its content instead of being contained. One
    // song, one page (CONTEXT.md): the paper fits inside the pane, both axes.
    const verses = Array.from(
      { length: 10 },
      (_, i) =>
        `${i + 1}.: Line one [C]of verse ${i + 1}\nAnd a [G]second line here`,
    ).join('\n\n');
    await type(page, '* A Very Long Song\n\n' + verses);
    await page.waitForTimeout(300);

    const paneBox = await page.getByTestId('pane-b').boundingBox();
    const renderBox = await page.getByTestId('song-render').boundingBox();
    expect(paneBox).not.toBeNull();
    expect(renderBox).not.toBeNull();
    // The render sits within the pane on every edge (a hair of tolerance for
    // sub-pixel rounding).
    expect(renderBox!.y).toBeGreaterThanOrEqual(paneBox!.y - 1);
    expect(renderBox!.x).toBeGreaterThanOrEqual(paneBox!.x - 1);
    expect(renderBox!.y + renderBox!.height).toBeLessThanOrEqual(
      paneBox!.y + paneBox!.height + 1,
    );
    expect(renderBox!.x + renderBox!.width).toBeLessThanOrEqual(
      paneBox!.x + paneBox!.width + 1,
    );
  });

  test('an escaped colon inside a bracket renders without its backslash', async ({
    page,
  }) => {
    // A repeat sign `[||: … :||]` must escape the colon or `[||` reads as a
    // label; the escape is load-bearing, but its backslash must not survive into
    // the rendered annotation. Seeded, because the keyboard cannot reliably type
    // a backslash under automation.
    const id = await page.evaluate(
      () =>
        new Promise<string>((res) => {
          const bs = String.fromCharCode(92);
          const content = 'Intro\n[||' + bs + ': Em G Em A :||]';
          const open = indexedDB.open('achordeon');
          open.onsuccess = () => {
            const db = open.result;
            const now = Date.now();
            const sid = crypto.randomUUID();
            const tx = db.transaction('songs', 'readwrite');
            tx.objectStore('songs').put({
              id: sid,
              createdAt: now,
              updatedAt: now,
              deletedAt: null,
              name: 'Repeat',
              favorite: false,
              settings: {},
              cache: { title: '', subtitle: '' },
              content,
            });
            tx.oncomplete = () => {
              db.close();
              res(sid);
            };
          };
        }),
    );
    await page.goto('songs/' + id + '/edit');
    await expect(page.getByTestId('editor')).toBeVisible();

    const render = page.getByTestId('song-render');
    await expect(render).toContainText('||: Em G Em A :||');
    // The whole point: the escape character is gone from the output.
    const text = await render.innerText();
    expect(text).not.toContain(String.fromCharCode(92));
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

  test('the settings dialog tunes the render while you watch it', async ({
    page,
  }) => {
    await type(page, '* Wonderwall\n\n1.: sing [C]this');
    await expect(page.getByTestId('song-settings-dialog')).toHaveCount(0);

    await page.getByTestId('editor-settings').click();
    await expect(page.getByTestId('song-settings-dialog')).toBeVisible();
    // No backdrop: the render is what you are tuning, so it stays visible AND
    // interactive behind the dialog (PRD-UI-SHELL.md §4).
    await expect(page.getByTestId('song-render')).toBeVisible();
    await expect(page.getByTestId('dialog-scrim')).toHaveCount(0);

    // Aspect ratio is a Song-scope setting, and the render box IS its shape —
    // so this proves the panel reached the geometry, not just the state.
    const svg = page.locator('[data-testid="song-render"] svg');
    const a4 = await svg.getAttribute('viewBox');
    await page.getByTestId('select-aspectRatio').selectOption('1:1');

    await expect(svg).not.toHaveAttribute('viewBox', a4 as string);
    const square = (await svg.getAttribute('viewBox'))!.split(' ').map(Number);
    expect(square[2] / square[3]).toBeCloseTo(1); // 1:1, as asked
  });

  test('an unset song setting shows as inherited, and reset gives it back', async ({
    page,
  }) => {
    await type(page, '* Wonderwall');
    await page.getByTestId('editor-settings').click();

    // Nothing overridden yet: the row wears the inherited badge, not a reset.
    await expect(page.getByTestId('reset-columns')).toHaveCount(0);

    await page.getByTestId('inc-columns').click();
    await expect(page.getByTestId('reset-columns')).toBeVisible();

    // Reset REMOVES the override rather than writing the default down, so the
    // cascade reaches the song again (ADR-0006).
    await page.getByTestId('reset-columns').click();
    await expect(page.getByTestId('reset-columns')).toHaveCount(0);
  });

  test('Escape closes the settings dialog', async ({ page }) => {
    await page.getByTestId('editor-settings').click();
    await expect(page.getByTestId('song-settings-dialog')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByTestId('song-settings-dialog')).toHaveCount(0);
  });

  test('autosaves typed content — no Save button, nothing lost', async ({
    page,
  }) => {
    await type(page, '* Wonderwall\n\n1.: sing [C]this');
    // No save gesture of any kind: just stop typing, and reload.
    await page.waitForTimeout(700);
    await page.reload();

    await expect(page.getByTestId('editor')).toContainText('sing [C]this');
    await expect(page.getByTestId('song-render')).toContainText('Wonderwall');
  });

  test('leaving the editor flushes the pending save', async ({ page }) => {
    await type(page, '* Wonderwall');
    // Leave IMMEDIATELY — inside the debounce window, before any timer fires.
    await page.getByTestId('editor-back').click();
    await expect(page).toHaveURL(/\/songs$/);

    // The song's row shows the parsed title: the cache was rewritten on save.
    await expect(page.getByTestId('song-row')).toContainText('Wonderwall');
  });

  test('a saved song shows its parsed title in the library', async ({
    page,
  }) => {
    // The cache is derived, never authored: the list and the render must not
    // disagree about a song's title (PRD-DOMAIN-MODEL §Song).
    await type(page, '* First\n* Wins the last one');
    await page.waitForTimeout(700);
    await page.getByTestId('editor-back').click();

    const row = page.getByTestId('song-row');
    await expect(row).toContainText('Wins the last one');
    await expect(row).not.toContainText('First');
  });

  test('a saved song is findable by the title you typed', async ({ page }) => {
    await type(page, '* Wonderwall');
    await page.waitForTimeout(700);
    await page.getByTestId('editor-back').click();

    // The two-tier search reads the cache — which only exists because saving
    // rewrote it.
    await page.getByTestId('explorer-search').fill('wonder');
    await expect(page.getByTestId('song-row')).toHaveCount(1);
  });

  test('autosaves a settings change too', async ({ page }) => {
    await type(page, '* Wonderwall');
    await page.getByTestId('editor-settings').click();
    await page.getByTestId('select-aspectRatio').selectOption('1:1');
    await page.waitForTimeout(700);
    await page.reload();

    await page.getByTestId('editor-settings').click();
    // Overridden, not inherited — the reset button is the proof it was stored.
    await expect(page.getByTestId('reset-aspectRatio')).toBeVisible();
  });

  test('opens a song by deep link, without the list ever loading it', async ({
    page,
  }) => {
    await type(page, 'Typed content');
    await page.waitForTimeout(700);
    const url = page.url();

    // A cold navigation straight to the editor: the store's window has never
    // held this row, so the song has to come from the repository.
    await page.goto(url);

    await expect(page.getByTestId('editor')).toContainText('Typed content');
    // The title is a rename field now, so the name is its value, not its text.
    await expect(page.getByTestId('module-title-input')).toHaveValue(
      'New song',
    );
  });
});
