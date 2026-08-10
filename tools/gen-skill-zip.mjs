#!/usr/bin/env node
// The distributable skill — plan §8
//
// `achordeon-song`: brand plus subject. It triggers on "write this song for
// Achordeon", sits loosely alongside the repo's own `song-from-image` /
// `song-from-text`, and leaves the bare brand free if a second skill ever ships.
//
// **Three wrappers, one source.** The same grammar and the same instructions go
// to three hosts that can do different amounts:
//
//   achordeon-song.zip       a Claude skill — instructions, grammar, schema, and
//                            the scripts, which it can actually run
//   achordeon-song-gpt.zip   a Custom GPT knowledge bundle — no Node, so the
//                            scripts are left out and the grammar carries it
//   achordeon-song-gem.md    a Gem's instructions — one box, so one file, with
//                            the grammar inlined
//
// Everything in them is generated from this repo, so none of it can teach last
// month's syntax: the schema comes from the SETTINGS registry, the bundle from
// the real parser, and **every example in the grammar is parsed by the build** —
// a rule the parser no longer agrees with fails here rather than in somebody
// else's assistant.
//
// Usage: node tools/gen-skill-zip.mjs [-o <dir>]

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync, strToU8 } from 'fflate';
import {
  inspect,
  SCHEMA_VERSION,
  ACHORDEON_URL,
  SONG_SETTING_KEYS,
  SONGBOOK_SETTING_KEYS,
} from '../.claude/skills/song-core/scripts/_domain.mjs';
import { bundlePath, scriptsDir, SHIPPED_SCRIPTS } from './skill/manifest.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const here = resolve(root, 'tools/skill');

const outIdx = process.argv.indexOf('-o');
const outDir =
  outIdx !== -1
    ? resolve(process.cwd(), process.argv[outIdx + 1])
    : resolve(root, 'apps/docs/static');

/** The names, all three the same on purpose — one thing, three hosts. */
const NAME = 'achordeon-song';
const TITLE = 'Achordeon Song';
const DESCRIPTION =
  'Turn a song into an Achordeon import file: a chord sheet copied off a tab site, a ChordPro file, plain lyrics, or a song written out from memory. Folds chord rows above the words into inline brackets, checks the markup with Achordeon’s own parser, and hands back a file (or a link) that imports. Use when someone wants a song written for Achordeon.';

/** Must match `SHARE_LINK_MAX_URL` in the app and in `build-import.mjs`. */
const SHARE_LINK_MAX_URL = 8000;

const schema = readFileSync(
  resolve(root, 'apps/docs/static/achordeon.schema.json'),
  'utf8',
);

// --- the grammar ----------------------------------------------------------

// Two of the three hosts get the schema as a file beside the grammar; the Gem
// has only its instructions box, so for it this section IS the contract.
const buildGrammar = (schemaLocation) =>
  fill(read('GRAMMAR.template.md'), {
    ACHORDEON_URL,
    SCHEMA_VERSION,
    SHARE_LINK_MAX_URL,
    SONG_SETTING_KEYS: SONG_SETTING_KEYS.map((k) => `\`${k}\``).join(', '),
    SONGBOOK_SETTING_KEYS: SONGBOOK_SETTING_KEYS.map((k) => `\`${k}\``).join(
      ', ',
    ),
    SCHEMA_LOCATION: schemaLocation,
  });

const grammar = buildGrammar(
  'The full contract is `achordeon.schema.json`, which ships beside this file; this is the short version.',
);
const grammarInline = buildGrammar('Everything an import reads is below.');

checkExamples(grammar);

// --- the instructions, once per host --------------------------------------

/** How the grammar and the schema are reachable differs by host: two of the three
 * ship them as files, and the Gem has only its instructions box. */
const AS_FILES = {
  GRAMMAR_REF: '`GRAMMAR.md`',
  FORMAT_REF:
    'Its full contract is `achordeon.schema.json`, and the short version is at the end of `GRAMMAR.md`.',
};
const INLINE = {
  GRAMMAR_REF: 'the grammar below',
  FORMAT_REF: 'The format is written out at the end of the grammar below.',
};

const skillInstructions = fill(read('INSTRUCTIONS.template.md'), {
  ...AS_FILES,
  CONVERT: [
    'Chord rows above the words, and ChordPro directives, are handled exactly by',
    '   `scripts/merge-chordlines.mjs <in.txt> -o <out.txt>`. Run it. Column',
    '   arithmetic is not something to do by hand, and the script never reads a',
    '   lyric out — it takes a file and writes a file.',
  ].join('\n'),
  CHECK: [
    '`node scripts/validate.mjs <file.txt>` runs the real Achordeon parser and',
    '   reports what it made of the markup: how many chords, which brackets are',
    '   not chords, every label as it will actually print, and any warning. Read',
    '   its output against the source. Fix and re-run until it is clean.',
  ].join('\n'),
  BUILD: [
    'Write a manifest — `{"songs":[{"name":"…","contentFile":"song.txt"}]}`, plus',
    '   `"songbook":"Name"` to wrap them in one — and run',
    '   `node scripts/build-import.mjs manifest.json -o song.json`. It mints the ids,',
    '   stamps the schema version and computes the parser cache with the real',
    '   parser, so the file is exactly what Achordeon would have written. The full',
    '   manifest format is documented at the top of that script.',
    '',
    '   `contentFile` rather than inline `content`: the markup is read off disk and',
    '   never has to pass through your output a second time.',
  ].join('\n'),
  DELIVER: [
    'Give the person the file. Add `--link` to the build command and they get a',
    '   link that opens the import preview directly — hand that over instead when',
    '   the song is small enough for one, which the script tells you.',
  ].join('\n'),
});

/** Neither a Custom GPT nor a Gem can run Node, so both write the markup and the
 * JSON themselves — the grammar has to carry what the scripts otherwise would. */
const promptOnly = {
  CONVERT: [
    'Fold each chord row into the words below it yourself, counting **printed**',
    '   columns — a bracket already on the line takes no width on the page. Turn',
    '   `{title:}` / `{artist:}` into `*` / `**` and drop the block markers.',
  ].join('\n'),
  CHECK: [
    'Re-read your markup against "Not valid here" in the grammar, and against the',
    '   source line by line: every chord over the right character, every label',
    '   present, nothing invented.',
  ].join('\n'),
  BUILD: [
    'Write the JSON yourself, following the format above. Mint a fresh uuid per',
    '   song, and write nothing the format does not ask for.',
  ].join('\n'),
  DELIVER: [
    'Give the person the JSON, or the link form described at the end of the',
    '   grammar — whichever they can use more easily.',
  ].join('\n'),
};

const gptInstructions = fill(read('INSTRUCTIONS.template.md'), {
  ...AS_FILES,
  ...promptOnly,
});
const gemInstructions = fill(read('INSTRUCTIONS.template.md'), {
  ...INLINE,
  ...promptOnly,
});

// --- the three wrappers ---------------------------------------------------

const skillMd = [
  '---',
  `name: ${NAME}`,
  `description: ${DESCRIPTION}`,
  '---',
  '',
  `# ${TITLE}`,
  '',
  skillInstructions,
].join('\n');

const gptMd = [
  `# ${TITLE}`,
  '',
  'Paste this into the Custom GPT builder as the instructions, and upload',
  '`GRAMMAR.md` and `achordeon.schema.json` as knowledge files.',
  '',
  '---',
  '',
  gptInstructions,
].join('\n');

const gemMd = [
  `# ${TITLE}`,
  '',
  'Paste the whole of this into the Gem instructions box.',
  '',
  '---',
  '',
  gemInstructions,
  '',
  '---',
  '',
  grammarInline,
].join('\n');

// --- write ----------------------------------------------------------------

mkdirSync(outDir, { recursive: true });

const skillFiles = {
  'SKILL.md': skillMd,
  'GRAMMAR.md': grammar,
  'achordeon.schema.json': schema,
  'scripts/_domain.mjs': readFileSync(bundlePath, 'utf8'),
};
for (const script of SHIPPED_SCRIPTS) {
  // Byte for byte out of the repo's own skill: these import `./_domain.mjs`,
  // which is the jiti loader in the repo and the bundle here. Same specifier,
  // two implementations — so the scripts that ship are the scripts that were
  // tested, with no packaging rewrite in between to get wrong.
  skillFiles[`scripts/${script}`] = readFileSync(
    join(scriptsDir, script),
    'utf8',
  );
}

const written = [
  write(`${NAME}.zip`, zip(skillFiles)),
  write(
    `${NAME}-gpt.zip`,
    zip({
      'instructions.md': gptMd,
      'GRAMMAR.md': grammar,
      'achordeon.schema.json': schema,
    }),
  ),
  write(`${NAME}-gem.md`, strToU8(gemMd)),
];

console.log(`gen-skill-zip: schemaVersion ${SCHEMA_VERSION}`);
for (const line of written) console.log(`  ${line}`);

// --- helpers --------------------------------------------------------------

function read(name) {
  return readFileSync(resolve(here, name), 'utf8');
}

function fill(text, values) {
  return text.replace(/\{\{(\w+)\}\}/g, (whole, key) => {
    if (!(key in values)) throw new Error(`No value for ${whole}`);
    return String(values[key]);
  });
}

function zip(files) {
  return zipSync(
    Object.fromEntries(
      Object.entries(files).map(([path, text]) => [path, strToU8(text)]),
    ),
    { level: 9 },
  );
}

function write(name, bytes) {
  const path = join(outDir, name);
  writeFileSync(path, bytes);
  return `${name} (${(bytes.length / 1024).toFixed(0)} KB)`;
}

/**
 * Every ` ```achordeon ` block in the grammar, parsed by the real parser.
 *
 * This is what keeps an authored document from teaching last month's syntax: a
 * rule the parser no longer agrees with fails the build here rather than in
 * somebody else's assistant, where nobody can fix it. Blocks in any other
 * language are prose — the "not valid here" examples especially, which must NOT
 * parse cleanly and are shown precisely because they do not.
 */
function checkExamples(text) {
  // Newlines normalised first. The template is checked out with CRLF on Windows,
  // where `\n` after the fence never matches and every example silently vanishes
  // — the check then fails as "no examples left" on a file that is full of them.
  const blocks = [
    ...text.replace(/\r\n/g, '\n').matchAll(/```achordeon\n([\s\S]*?)```/g),
  ];
  if (blocks.length === 0) {
    console.error('gen-skill-zip: the grammar has no checkable examples left.');
    process.exit(1);
  }
  let bad = 0;
  for (const [, body] of blocks) {
    const report = inspect(body);
    if (report.warnings.length === 0) continue;
    bad++;
    console.error(
      `gen-skill-zip: an example the grammar teaches does not parse cleanly — ${report.warnings
        .map((w) => `${w.code} on line ${w.line + 1}`)
        .join(', ')}`,
    );
  }
  if (bad > 0) process.exit(1);
  console.log(`gen-skill-zip: ${blocks.length} grammar examples parse cleanly`);
}
