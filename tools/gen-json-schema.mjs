#!/usr/bin/env node
// The published import schema — plan §1, ADR-0014
//
// Writes `apps/docs/static/achordeon.schema.json`, which Docusaurus copies to the
// site root and serves as `https://achordeon.eu/achordeon.schema.json`.
//
// **One stable URL, no version in the path.** Per ADR-0007 an additive change
// never bumps `SCHEMA_VERSION`, so this document changes far more often than the
// number does and a `/v1/` would keep lying. The document says which
// `SCHEMA_VERSION` it targets; the URL only says where *current* lives. It sits at
// the site root rather than under `/app/` because it is a document, not part of
// the app bundle — and because it is short enough to paste into a chat by hand,
// which is the whole point of it.
//
// **Generated, never written.** The `SETTINGS` registry already knows every
// setting key and which scopes may carry it, so the schema enumerates them from
// the same source the app resolves them from. A hand-written copy would be wrong
// the first time a setting was added.
//
// The audience is a language model, not us: it asks for as little as the import
// path actually reads, describes everything else so a real export still validates,
// and carries examples because that is what a model copies from.
//
// Usage: node tools/gen-json-schema.mjs [-o <file>]

import { readFileSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const domainDir = resolve(root, 'libs/shared/domain/src/lib');

const jiti = createJiti(import.meta.url);
const { SETTINGS, SCHEMA_VERSION, ACHORDEON_URL } = await jiti.import(
  resolve(root, 'libs/shared/domain/src/index.ts'),
);

const outIdx = process.argv.indexOf('-o');
const outFile =
  outIdx !== -1
    ? resolve(process.cwd(), process.argv[outIdx + 1])
    : resolve(root, 'apps/docs/static/achordeon.schema.json');

// --- setting value types --------------------------------------------------
//
// `SETTINGS` is a runtime object: at import time a default is a *value*, and the
// set of values a key ALLOWS lives only in the TypeScript annotation beside it
// (`default: 'top' as 'top' | 'left'`). Reading that annotation back out of the
// source is what lets the schema say `enum: ["top","left"]` instead of the much
// less useful `type: "string"`.
//
// Textual, and deliberately conservative: anything this cannot model exactly
// falls back to the default value's own JSON type, so a settings.ts written in a
// shape not anticipated here produces a *vaguer* schema, never a wrong one.

const settingsSource = readFileSync(resolve(domainDir, 'settings.ts'), 'utf8');

/** `export type X = …;` across the domain, for an annotation that is a name. */
const aliases = new Map();
for (const file of readdirSync(domainDir).filter((f) => f.endsWith('.ts'))) {
  const source = readFileSync(resolve(domainDir, file), 'utf8');
  for (const m of source.matchAll(/^export type (\w+) =([\s\S]*?);$/gm)) {
    aliases.set(m[1], m[2]);
  }
}

/** The type annotation written beside a setting's default, as source text. */
function annotationOf(key) {
  const block = settingsSource.match(
    new RegExp(`\\n  ${key}: \\{([\\s\\S]*?)\\n  \\},`),
  );
  if (!block) return null;
  const as = block[1].match(/default:[\s\S]*?\bas\b([\s\S]*?),\s*\n\s*scopes:/);
  return as ? as[1].replace(/\s+/g, ' ').trim() : null;
}

/** Split a union at the top level — backticks hide the `|` inside a template
 * literal type, which is the only nesting this file can meet. */
function splitUnion(text) {
  const parts = [];
  let current = '';
  let inTemplate = false;
  for (const ch of text) {
    if (ch === '`') inTemplate = !inTemplate;
    if (ch === '|' && !inTemplate) {
      parts.push(current);
      current = '';
    } else current += ch;
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function jsonTypeOf(value) {
  if (typeof value === 'number') return { type: 'number' };
  if (typeof value === 'boolean') return { type: 'boolean' };
  if (typeof value === 'string') return { type: 'string' };
  return {};
}

function schemaForSetting(key, def) {
  const annotation = annotationOf(key);
  // A multi-line union is written with a leading `|`, which is punctuation rather
  // than an empty member — drop it so the description reads as a type.
  const resolved = (
    annotation && aliases.has(annotation) ? aliases.get(annotation) : annotation
  )
    ?.replace(/\s+/g, ' ')
    .replace(/^\|\s*/, '')
    .trim();

  const vague = { ...jsonTypeOf(def.default), default: def.default };
  if (!resolved) return vague;

  const literals = [];
  let hasNumber = false;
  let hasBoolean = false;
  let hasString = false;
  for (const member of splitUnion(resolved)) {
    const quoted = member.match(/^'([^']*)'$/);
    if (quoted) literals.push(quoted[1]);
    else if (member === 'number') hasNumber = true;
    else if (member === 'boolean') hasBoolean = true;
    // A template literal type (`${number}:${number}`) is a shape of string. The
    // shape itself is not modelled — it rides in the description instead.
    else if (member === 'string' || member.startsWith('`')) hasString = true;
    // Anything else (an object type, a generic) is not a value a settings bag
    // carries today; say less rather than something untrue.
    else return { ...vague, description: `TypeScript type: ${resolved}` };
  }

  const branches = [];
  if (literals.length) branches.push({ enum: literals });
  if (hasNumber) branches.push({ type: 'number' });
  if (hasBoolean) branches.push({ type: 'boolean' });
  if (hasString) branches.push({ type: 'string' });
  if (branches.length === 0) return vague;

  const schema =
    branches.length === 1 ? { ...branches[0] } : { anyOf: branches };
  schema.default = def.default;
  // The written type is the shortest true description there is, and it is the
  // only place a template literal's shape survives.
  if (hasString || branches.length > 1) {
    schema.description = `TypeScript type: ${resolved}`;
  }
  return schema;
}

/** Every key the registry lets this scope carry, as schema properties. */
function settingsFor(scope) {
  const properties = {};
  for (const [key, def] of Object.entries(SETTINGS)) {
    if (def.scopes.includes(scope))
      properties[key] = schemaForSetting(key, def);
  }
  return properties;
}

// --- the document ---------------------------------------------------------

const EXAMPLE_CONTENT = [
  '* Wild Mountain Thyme',
  '** Traditional',
  '',
  'Verse: Oh the [G]summer time is [C]coming',
  'And the [G]trees are sweetly [D]blooming',
  '',
  'R: And we’ll [G]all go [C]together',
  '[G]To pull [D]wild mountain [G]thyme',
].join('\n');

const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://achordeon.eu/achordeon.schema.json',
  title: 'Achordeon import file',
  description: [
    'A file Achordeon can import: songs, and optionally songbooks that order them.',
    '',
    'Write one of these to hand somebody a song. Achordeon reads it from the file',
    'picker, from a file dropped anywhere on the page, or out of a link fragment',
    `(append "#j1=" + encodeURIComponent(JSON.stringify(file)) to ${ACHORDEON_URL}).`,
    '',
    'Only `schemaVersion` and `data` are required, and per song only `name` and',
    '`content`. Everything else on this page is written by Achordeon itself and',
    'described so that a real export also validates — leave those fields out.',
    '',
    'A song is written in Achordeon markup, not ChordPro and not chords-above-lyrics.',
    'See the `content` property for the whole of it.',
  ].join('\n'),
  type: 'object',
  required: ['schemaVersion', 'data'],
  properties: {
    app: {
      type: 'string',
      const: ACHORDEON_URL,
      description:
        'Where the app that opens this file lives. Read by nothing — it is a line for a person who finds the file on a disk two years from now. Include it if you like.',
    },
    schemaVersion: {
      type: 'integer',
      const: SCHEMA_VERSION,
      description:
        'The record shape this file holds. Write this number. A file made with an older number is migrated forward on import; a newer one is refused, because guessing a down-migration is how a library gets quietly mangled.',
    },
    deviceId: {
      type: 'string',
      description:
        'Which device produced the file. Feeds sync; an import means nothing by it. Omit it, or write a readable name of your own — anything that is not a uuid can never collide with a real device.',
    },
    updatedAt: {
      type: 'integer',
      description:
        'Epoch milliseconds the file was produced. Feeds sync; an import means nothing by it.',
    },
    data: {
      type: 'object',
      required: ['songs', 'songbooks'],
      description:
        'What the file carries. Both arrays must be present; either may be empty.',
      properties: {
        songs: {
          type: 'array',
          items: { $ref: '#/$defs/song' },
          description: 'The songs. An empty array is a valid file.',
        },
        songbooks: {
          type: 'array',
          items: { $ref: '#/$defs/songbook' },
          description:
            'Ordered collections of the songs above. An empty array is a valid file. A songbook is always imported as a NEW songbook, never merged into one that exists.',
        },
      },
    },
  },
  $defs: {
    song: {
      type: 'object',
      required: ['name', 'content'],
      properties: {
        name: {
          type: 'string',
          description:
            'The library label — what the song is called in the list. Not the printed title, which is read out of `content`. They are usually the same and do not have to be.',
        },
        content: {
          type: 'string',
          description: [
            'The song itself, in Achordeon markup. One string, newline-separated.',
            '',
            'CHORDS. `[C]` before the character it sits over: `And the [G]trees are` prints G above the t of trees.',
            'Several chords in one bracket share a spot: `[Am G]`. A bracket at end of line hangs past the words.',
            'A bracket that is not a chord is kept and printed verbatim, never transposed: `[x2]`, `[N.C.]`, `[Solo]`.',
            'A line that has brackets and no words is a chord row and prints in the line: `[G] [C] [D]`.',
            'German H is B natural; the printed spelling is the `notation` setting, not the source.',
            '',
            'TITLE and SUBTITLE. `* Title` and `** Subtitle`, at column 0, marker then a space.',
            'The rest of the line is plain print text — no chords, no label, no escapes. Last one wins.',
            '',
            'BLOCKS. A blank line separates blocks. Consecutive blank lines count as one.',
            '',
            'LABELS. `Verse: first words` names the block it opens; a label further into an open',
            'block annotates that line only. The delimiter is a colon followed by a space or end of line —',
            'so `12:30` and `http://x` are ordinary lyrics and need no escaping.',
            '',
            'EMPHASIS. `*italic*`, `**bold**`. An asterisk with nothing to match it prints as itself.',
            '',
            'ESCAPES. `\\[`, `\\]`, `\\:`, `\\*`, `\\\\` print the character. `\\ ` keeps a leading space.',
            '',
            'NOT VALID HERE: ChordPro directives (`{title: …}`, `{start_of_chorus}`), a row of chords',
            'written above the words on its own line, HTML, or Markdown headings. Fold chord rows into',
            'brackets before writing them here.',
          ].join('\n'),
        },
        id: {
          type: 'string',
          format: 'uuid',
          description: [
            'The song’s identity, honoured when present and minted when absent.',
            'Mint a FRESH uuid per song. Reusing one — the RFC 4122 example uuid especially —',
            'claims the identity of whatever song already has it, and the import offers to replace it.',
            'Keep the same id across versions of the SAME song, and a re-import replaces rather than duplicates.',
          ].join('\n'),
        },
        settings: {
          type: 'object',
          description:
            'Render overrides for this song alone, sparse — write only the keys you mean, or leave the object out. Anything absent falls back to the songbook’s value and then the library’s.',
          properties: settingsFor('song'),
        },
        favorite: {
          type: 'boolean',
          description: 'Written by Achordeon. Omit it; it defaults to false.',
        },
        createdAt: {
          type: 'integer',
          description:
            'Written by Achordeon (epoch ms). Omit it; the import stamps the time it ran.',
        },
        updatedAt: {
          type: 'integer',
          description:
            'Written by Achordeon (epoch ms). Omit it; the import stamps the time it ran.',
        },
        deletedAt: {
          type: ['integer', 'null'],
          description:
            'Written by Achordeon. A tombstone, so a sync can propagate a delete. Omit it — an import drops every song that carries one.',
        },
        cache: {
          type: 'object',
          description:
            'Written by Achordeon, derived from `content`. Omit it — an import re-reads the title and subtitle off the content and never believes a file’s copy.',
          properties: {
            title: { type: 'string' },
            subtitle: { type: 'string' },
          },
        },
      },
    },
    songbook: {
      type: 'object',
      required: ['name', 'entries'],
      properties: {
        name: {
          type: 'string',
          description: 'The library label for the book.',
        },
        entries: {
          type: 'array',
          items: { type: 'string', format: 'uuid' },
          description:
            'Song ids, in the order they appear in the book. The order IS the book. An id may repeat — the same song can hold two slots. An id that matches no song in this file and none in the library is dropped, so give every song here an explicit `id`.',
        },
        title: {
          type: 'string',
          description:
            'Title-page text. Authored, never parsed — a book has no `content`.',
        },
        subtitle: { type: 'string', description: 'Title-page subtitle.' },
        author: { type: 'string', description: 'Title-page author line.' },
        settings: {
          type: 'object',
          description:
            'Render overrides for every song in this book, sparse. A song’s own setting still wins.',
          properties: settingsFor('songbook'),
        },
        id: {
          type: 'string',
          format: 'uuid',
          description:
            'Optional and rarely worth writing: a songbook is ALWAYS imported as a new book, so its id is minted on the way in whatever the file says.',
        },
        createdAt: {
          type: 'integer',
          description: 'Written by Achordeon (epoch ms). Omit it.',
        },
        updatedAt: {
          type: 'integer',
          description: 'Written by Achordeon (epoch ms). Omit it.',
        },
        deletedAt: {
          type: ['integer', 'null'],
          description: 'Written by Achordeon. Omit it.',
        },
      },
    },
  },
  examples: [
    {
      app: ACHORDEON_URL,
      schemaVersion: SCHEMA_VERSION,
      data: {
        songs: [
          {
            id: '9f6b2c14-3d5e-4a71-9c08-1b2e5d7a4f36',
            name: 'Wild Mountain Thyme',
            content: EXAMPLE_CONTENT,
          },
        ],
        songbooks: [],
      },
    },
  ],
};

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, `${JSON.stringify(schema, null, 2)}\n`, 'utf8');

const songKeys = Object.keys(settingsFor('song'));
const bookKeys = Object.keys(settingsFor('songbook'));
console.log(`gen-json-schema: wrote ${outFile}`);
console.log(`  schemaVersion ${SCHEMA_VERSION}`);
console.log(`  song settings     (${songKeys.length}): ${songKeys.join(', ')}`);
console.log(`  songbook settings (${bookKeys.length}): ${bookKeys.join(', ')}`);
