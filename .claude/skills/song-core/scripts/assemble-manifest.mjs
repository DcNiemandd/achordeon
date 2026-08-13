#!/usr/bin/env node
// Assemble a build-import manifest from per-song fragment files WITHOUT pulling any
// song content into a model context. Each fragment is a JSON object shaped like a
// manifest song entry: { name, settings } plus EITHER `content` (the markup inline)
// OR `contentFile` (a path to a file holding it — preferred, and the only option
// that keeps the markup on disk from end to end). A relative `contentFile` is
// resolved against the fragment's own directory and written out absolute, so the
// manifest stays valid wherever it is built. This is run by the ORCHESTRATOR
// after all subagents finish. Do NOT Read the fragments into the model yourself —
// that is exactly the accumulation this script exists to avoid.
//
// usage:
//   assemble-manifest.mjs <fragmentDir> [--order <orderFile>] [--only <namesFile>]
//                         [--songbook <name>] -o <manifest.json>
//
//   <fragmentDir>   directory the workers wrote their *.song.json files into
//   --order <file>  newline-separated NAMEs giving songs[] order (default: sorted)
//   --only <file>   newline-separated NAMEs to include, ignoring every other
//                   fragment in the dir. This is how one WAVE of a longer run is
//                   built on its own: build-import gives every song in a manifest a
//                   fresh id, so restating already-built songs each wave would churn
//                   their ids and defeat the incremental merge that keeps them.
//   --songbook <n>  wrap the songs in a songbook of this name (omit for none)
//   --songbook-settings <json>
//                   songbook-scope settings, e.g. '{"notation":"german"}'. Book
//                   scope is the right home for a setting that should not differ
//                   song to song within one book — notation above all.
//   -o <file>       where to write the manifest (required)

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

const args = process.argv.slice(2);
let fragDir, orderFile, onlyFile, songbook, bookSettings, out;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--order') orderFile = args[++i];
  else if (a === '--only') onlyFile = args[++i];
  else if (a === '--songbook') songbook = args[++i];
  else if (a === '--songbook-settings') bookSettings = args[++i];
  else if (a === '-o') out = args[++i];
  else if (!a.startsWith('-') && !fragDir) fragDir = a;
  else {
    console.error(`unknown arg: ${a}`);
    process.exit(1);
  }
}

if (!fragDir || !out) {
  console.error(
    'usage: assemble-manifest.mjs <fragmentDir> [--order <orderFile>] [--only <namesFile>] [--songbook <name>] -o <manifest.json>',
  );
  process.exit(1);
}

/** Newline-separated names, blanks dropped — the shape of both list files. */
function readNames(file) {
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const only = onlyFile ? new Set(readNames(onlyFile)) : null;

const frags = readdirSync(fragDir)
  .filter((f) => f.endsWith('.song.json'))
  .map((f) => {
    const song = JSON.parse(readFileSync(join(fragDir, f), 'utf8'));
    const hasContent = typeof song?.content === 'string';
    const hasFile =
      typeof song?.contentFile === 'string' && song.contentFile !== '';
    if (!song || typeof song.name !== 'string' || (!hasContent && !hasFile)) {
      console.error(`WARN: ${f} is not a valid song fragment; skipping`);
      return null;
    }
    if (hasFile && !isAbsolute(song.contentFile))
      song.contentFile = resolve(fragDir, song.contentFile);
    return song;
  })
  .filter(Boolean)
  .filter((s) => !only || only.has(s.name));

if (frags.length === 0) {
  console.error(
    only
      ? `ERROR: none of the names in ${onlyFile} have a fragment in ${fragDir}`
      : `ERROR: no valid *.song.json fragments in ${fragDir}`,
  );
  process.exit(1);
}

const byName = new Map(frags.map((s) => [s.name, s]));

const order = orderFile ? readNames(orderFile) : [...byName.keys()].sort();

const songs = [];
const seen = new Set();
for (const name of order) {
  const s = byName.get(name);
  if (!s) {
    // Under --only the order file is the whole run's, so most of its names are
    // meant to be absent from this wave. Warning per song would bury the real ones.
    if (!only)
      console.error(`WARN: order lists "${name}" but no fragment was found`);
    continue;
  }
  songs.push(s);
  seen.add(name);
}
for (const s of frags) {
  if (!seen.has(s.name)) {
    console.error(
      `WARN: fragment "${s.name}" not in order list; appending at end`,
    );
    songs.push(s);
  }
}

let book = songbook;
if (bookSettings) {
  if (!songbook) {
    console.error('--songbook-settings needs --songbook');
    process.exit(1);
  }
  let settings;
  try {
    settings = JSON.parse(bookSettings);
  } catch (e) {
    console.error(`--songbook-settings is not valid JSON: ${e.message}`);
    process.exit(1);
  }
  // The object form of `songbook`; build-import validates the keys against the
  // real registry's songbook scope, so a typo is caught there, loudly.
  book = { name: songbook, settings };
}

const manifest = book ? { songbook: book, songs } : { songs };
writeFileSync(out, JSON.stringify(manifest, null, 2));
console.error(`assembled ${songs.length} song(s) -> ${out}`);
