// The tutorial has to be correct in EVERY language it ships in — Epic 5 / i18n
//
// It is the body of every new song AND the one song a fresh library is born with
// (`provideAchordeonSeed`), so a translation that breaks the syntax greets a
// first-time user with warnings on the song that is supposed to be teaching them.
// The e2e suite only ever sees English; the catalogs are checked here.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from '@achordeon/shared/domain';
import { TonalChordTheory } from '@achordeon/shared/data-access';
import { TUTORIAL_CONTENT } from './new-song';

const LOCALE_DIR = join(__dirname, '../../../src/locale');
const theory = new TonalChordTheory();

/** Every shipped catalog's tutorial, plus the English it is authored in. */
function tutorials(): { language: string; content: string }[] {
  const catalogs = readdirSync(LOCALE_DIR)
    .filter((f) => f.endsWith('.json'))
    .filter((f) => f !== 'messages.json' && !f.endsWith('.sources.json'));

  return [
    { language: 'en (source)', content: TUTORIAL_CONTENT },
    ...catalogs.map((file) => {
      const catalog: { locale: string; translations: Record<string, string> } =
        JSON.parse(readFileSync(join(LOCALE_DIR, file), 'utf8'));
      return {
        language: catalog.locale,
        content: catalog.translations['songs.tutorial'],
      };
    }),
  ];
}

describe.each(tutorials())('the tutorial in $language', ({ content }) => {
  it('exists and is a whole song', () => {
    expect(content).toBeTruthy();
    const ast = parse(content, theory);
    expect(ast.title).toBeTruthy();
    expect(ast.subtitle).toBeTruthy();
    expect(ast.blocks.length).toBeGreaterThan(1);
  });

  it('parses without a single warning', () => {
    // A starter song that warns at the user on sight teaches them the language is
    // fussy rather than how it works.
    expect(parse(content, theory).warnings).toEqual([]);
  });

  it('still shows the constructs it is there to show', () => {
    const ast = parse(content, theory);
    const lines = ast.blocks.flatMap((b) => b.lines);

    // A chord over a character, and several in one bracket sharing a place.
    expect(lines.some((l) => l.chords.some((c) => c.valid))).toBe(true);
    expect(
      lines.some((l) => {
        const at = l.chords.filter((c) => c.valid).map((c) => c.at);
        return new Set(at).size < at.length;
      }),
    ).toBe(true);

    // A chord inside a line that has words (`[[C]]`), and a row that is only
    // chords — the two ways a chord lands in the flow.
    expect(
      lines.some((l) => l.text.trim() !== '' && l.chords.some((c) => c.inline)),
    ).toBe(true);
    expect(lines.some((l) => l.text.trim() === '' && l.chords.length > 0)).toBe(
      true,
    );

    // Emphasis, block labels, and a sub-label naming one row further down.
    expect(lines.some((l) => (l.spans ?? []).some((s) => s.bold))).toBe(true);
    expect(lines.some((l) => (l.spans ?? []).some((s) => s.italic))).toBe(true);
    expect(
      ast.blocks.filter((b) => b.label !== undefined).length,
    ).toBeGreaterThan(1);
    expect(
      ast.blocks.some((b) => b.lines.some((l, i) => i > 0 && l.label)),
    ).toBe(true);

    // A bracket that is not a chord, rendered verbatim rather than warned about.
    expect(lines.some((l) => l.chords.some((c) => !c.valid))).toBe(true);

    // The escapes: a colon, a star and a bracket that survived as text.
    const text = lines.map((l) => l.text).join('\n');
    expect(text).toContain(':');
    expect(text).toContain('*');
    expect(text).toContain('[');
  });
});
