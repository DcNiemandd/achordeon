// The two localized song texts have to be correct in EVERY language they ship in
// — Epic 5 / i18n
//
// One is seeded into a fresh library (`applyFirstRun`) and one is the body of every
// new song, so a translation that breaks the syntax greets a first-time user with
// warnings on the song that is supposed to be teaching them. The e2e suite only ever
// sees English; the catalogs are checked here.
//
// Both texts live in one spec because the fixture is shared — "every shipped
// catalog's value for this id" — and a helper file could not go anywhere clean:
// `tsconfig.app.json` excludes only `*.spec.ts`, so a `node:fs` reader in any other
// filename would be compiled into the app build.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from '@achordeon/shared/domain';
import { TonalChordTheory } from '@achordeon/shared/data-access';
import { GUIDE_SONG_CONTENT } from './guide-song-content';
import { NEW_SONG_CONTENT } from './new-song';

const LOCALE_DIR = join(__dirname, '../../../src/locale');
const theory = new TonalChordTheory();

/** Every shipped catalog, source excluded — that one is the `$localize` const. */
function catalogs(): {
  locale: string;
  translations: Record<string, string>;
}[] {
  return readdirSync(LOCALE_DIR)
    .filter((f) => f.endsWith('.json'))
    .filter((f) => f !== 'messages.json' && !f.endsWith('.sources.json'))
    .map(
      (file) =>
        JSON.parse(readFileSync(join(LOCALE_DIR, file), 'utf8')) as {
          locale: string;
          translations: Record<string, string>;
        },
    );
}

/** One message id in every language it ships in, the authored English first. */
function versions(
  id: string,
  source: string,
): { language: string; content: string }[] {
  return [
    { language: 'en (source)', content: source },
    ...catalogs().map((c) => ({
      language: c.locale,
      content: c.translations[id],
    })),
  ];
}

describe.each(versions('songs.tutorial', GUIDE_SONG_CONTENT))(
  'the guide song in $language',
  ({ content }) => {
    it('exists and is a whole song', () => {
      expect(content).toBeTruthy();
      const ast = parse(content, theory);
      expect(ast.title).toBeTruthy();
      expect(ast.subtitle).toBeTruthy();
      expect(ast.blocks.length).toBeGreaterThan(1);
    });

    it('parses without a single warning', () => {
      // A seeded song that warns at the user on sight teaches them the language is
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
        lines.some(
          (l) => l.text.trim() !== '' && l.chords.some((c) => c.inline),
        ),
      ).toBe(true);
      expect(
        lines.some((l) => l.text.trim() === '' && l.chords.length > 0),
      ).toBe(true);

      // Emphasis, block labels, and a sub-label naming one row further down.
      expect(lines.some((l) => (l.spans ?? []).some((s) => s.bold))).toBe(true);
      expect(lines.some((l) => (l.spans ?? []).some((s) => s.italic))).toBe(
        true,
      );
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
  },
);

describe.each(versions('songs.newContent', NEW_SONG_CONTENT))(
  'the new-song skeleton in $language',
  ({ content }) => {
    it('parses without a single warning', () => {
      expect(content).toBeTruthy();
      expect(parse(content, theory).warnings).toEqual([]);
    });

    // Deliberately a much lighter contract than the guide song's: this text teaches
    // one rule, so the only things a translation must not lose are the four the
    // editor and the render pane need something to show.
    it('keeps the shape a new song is meant to open with', () => {
      const ast = parse(content, theory);
      expect(ast.title).toBeTruthy();
      expect(ast.subtitle).toBeTruthy();
      expect(ast.blocks.some((b) => b.label !== undefined)).toBe(true);
      expect(
        ast.blocks
          .flatMap((b) => b.lines)
          .some((l) => l.chords.some((c) => c.valid)),
      ).toBe(true);
    });

    it('stays short enough to type over', () => {
      // The whole point of not seeding the tour here. If this ever grows past a
      // handful of lines, the lesson has crept back in.
      expect(content.trimEnd().split('\n').length).toBeLessThanOrEqual(6);
    });
  },
);
