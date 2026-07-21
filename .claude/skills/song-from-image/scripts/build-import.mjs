#!/usr/bin/env node
// Import-JSON builder — turns a small manifest of transcribed songs into a valid
// Achordeon import file (a SnapshotEnvelope), ready to drop on the app's Import
// button. It computes the derived parser cache with the REAL parser, generates
// ids/timestamps, stamps the current schemaVersion, validates song settings
// against the shipped SETTINGS registry, and — if the manifest names a songbook —
// wraps the songs into a songbook (folder → songbook name).
//
// Manifest (JSON on stdin, or a file path):
//   {
//     "songbook": "Folder Name"            // optional; string shorthand, OR:
//     "songbook": {                        // optional object form
//       "name": "Folder Name",
//       "title": "Folder Name",            // optional (defaults to name)
//       "subtitle": "", "author": "",      // optional
//       "settings": { }                    // optional songbook-scope overrides
//     },
//     "songs": [
//       {
//         "name": "Vizovice",              // library label (defaults to Title, then "Song")
//         "content": "* Vizovice\n** Fleret\n...",   // Achordeon markup
//         "favorite": false,               // optional
//         "settings": { "aspectRatio": "3/4", "columns": 1 }   // optional song-scope
//       }
//     ]
//   }
//
// Usage:
//   node build-import.mjs manifest.json                 # → JSON on stdout
//   node build-import.mjs manifest.json -o import.json  # → file
//   cat manifest.json | node build-import.mjs -         # stdin

import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  inspect,
  SCHEMA_VERSION,
  SONG_SETTING_KEYS,
  SONGBOOK_SETTING_KEYS,
} from './_domain.mjs';

// --- args ---
const args = process.argv.slice(2);
const outIdx = args.indexOf('-o');
const outFile = outIdx !== -1 ? args[outIdx + 1] : null;
const input = args.find((a, i) => a !== '-o' && i !== outIdx + 1) ?? null;
if (!input) {
  console.error(
    'usage: node build-import.mjs <manifest.json|-> [-o import.json]',
  );
  process.exit(2);
}
const rawManifest =
  input === '-' ? readFileSync(0, 'utf8') : readFileSync(input, 'utf8');

let manifest;
try {
  manifest = JSON.parse(rawManifest);
} catch (e) {
  console.error('Manifest is not valid JSON:', e.message);
  process.exit(1);
}
if (!Array.isArray(manifest.songs) || manifest.songs.length === 0) {
  console.error('Manifest must have a non-empty "songs" array.');
  process.exit(1);
}

const now = Date.now();

// Only keep setting keys that actually exist at the given scope; warn on the rest
// so a typo'd setting is loud, not silently dropped by the app later (point 5).
function pickSettings(settings, allowed, where) {
  const out = {};
  for (const [key, value] of Object.entries(settings ?? {})) {
    if (allowed.includes(key)) out[key] = value;
    else
      console.error(
        `  ! ${where}: unknown/out-of-scope setting "${key}" dropped (allowed: ${allowed.join(', ')})`,
      );
  }
  return out;
}

console.error('─'.repeat(48));
console.error('Building Achordeon import');
console.error('─'.repeat(48));

const songs = manifest.songs.map((s, i) => {
  if (typeof s.content !== 'string' || s.content.trim() === '') {
    console.error(`Song #${i + 1} has no "content".`);
    process.exit(1);
  }
  const info = inspect(s.content);
  const name = (s.name ?? info.title ?? 'Song').trim() || 'Song';

  console.error(`\n• ${name}`);
  console.error(
    `    title "${info.cache.title || '(none)'}"  subtitle "${info.cache.subtitle || '(none)'}"  blocks ${info.blockCount}  chords ${info.chordCount}`,
  );
  for (const w of info.warnings)
    console.error(`    ! ${w.code} line ${w.line + 1}: "${w.text}"`);
  if (info.verbatim.length)
    console.error(
      `    · renders verbatim (not a chord): ${info.verbatim.map((r) => `[${r}]`).join(' ')}`,
    );

  return {
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    name,
    content: s.content,
    favorite: s.favorite === true,
    settings: pickSettings(s.settings, SONG_SETTING_KEYS, `song "${name}"`),
    cache: info.cache, // DERIVED via the real parser — matches what the app recomputes on save
  };
});

const songbooks = [];
if (manifest.songbook) {
  const b =
    typeof manifest.songbook === 'string'
      ? { name: manifest.songbook }
      : manifest.songbook;
  const bookName = (b.name ?? 'Songbook').trim() || 'Songbook';
  songbooks.push({
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    name: bookName,
    title: (b.title ?? bookName).trim(),
    subtitle: (b.subtitle ?? '').trim(),
    author: (b.author ?? '').trim(),
    settings: pickSettings(
      b.settings,
      SONGBOOK_SETTING_KEYS,
      `songbook "${bookName}"`,
    ),
    entries: songs.map((s) => s.id), // song order = manifest order
  });
  console.error(`\nSongbook: "${bookName}" (${songs.length} entries)`);
}

const envelope = {
  schemaVersion: SCHEMA_VERSION,
  deviceId: 'achordeon-skill-import',
  updatedAt: now,
  data: { user: [], songs, songbooks },
};

const json = JSON.stringify(envelope, null, 2);
console.error('\n' + '─'.repeat(48));
if (outFile) {
  writeFileSync(outFile, json + '\n', 'utf8');
  console.error(
    `Wrote ${outFile} — ${songs.length} song(s)${songbooks.length ? `, 1 songbook` : ''}, schemaVersion ${SCHEMA_VERSION}.`,
  );
} else {
  console.error(
    `${songs.length} song(s)${songbooks.length ? `, 1 songbook` : ''}, schemaVersion ${SCHEMA_VERSION}. JSON on stdout ↓`,
  );
  process.stdout.write(json + '\n');
}
