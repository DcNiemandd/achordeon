#!/usr/bin/env node
// Assemble a build-import manifest from per-song fragment files WITHOUT pulling any
// song content into a model context. Each fragment is a JSON object shaped like a
// manifest song entry: { name, content, settings }. This is run by the ORCHESTRATOR
// after all subagents finish. Do NOT Read the fragments into the model yourself —
// that is exactly the accumulation this script exists to avoid.
//
// usage:
//   assemble-manifest.mjs <fragmentDir> [--order <orderFile>] [--songbook <name>] -o <manifest.json>
//
//   <fragmentDir>   directory the workers wrote their *.song.json files into
//   --order <file>  newline-separated NAMEs giving songs[] order (default: sorted)
//   --songbook <n>  wrap the songs in a songbook of this name (omit for none)
//   -o <file>       where to write the manifest (required)

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
let fragDir, orderFile, songbook, out;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--order') orderFile = args[++i];
  else if (a === '--songbook') songbook = args[++i];
  else if (a === '-o') out = args[++i];
  else if (!a.startsWith('-') && !fragDir) fragDir = a;
  else { console.error(`unknown arg: ${a}`); process.exit(1); }
}

if (!fragDir || !out) {
  console.error(
    'usage: assemble-manifest.mjs <fragmentDir> [--order <orderFile>] [--songbook <name>] -o <manifest.json>'
  );
  process.exit(1);
}

const frags = readdirSync(fragDir)
  .filter((f) => f.endsWith('.song.json'))
  .map((f) => {
    const song = JSON.parse(readFileSync(join(fragDir, f), 'utf8'));
    if (!song || typeof song.name !== 'string' || typeof song.content !== 'string') {
      console.error(`WARN: ${f} is not a valid song fragment; skipping`);
      return null;
    }
    return song;
  })
  .filter(Boolean);

if (frags.length === 0) {
  console.error(`ERROR: no valid *.song.json fragments in ${fragDir}`);
  process.exit(1);
}

const byName = new Map(frags.map((s) => [s.name, s]));

const order = orderFile
  ? readFileSync(orderFile, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  : [...byName.keys()].sort();

const songs = [];
const seen = new Set();
for (const name of order) {
  const s = byName.get(name);
  if (!s) {
    console.error(`WARN: order lists "${name}" but no fragment was found`);
    continue;
  }
  songs.push(s);
  seen.add(name);
}
for (const s of frags) {
  if (!seen.has(s.name)) {
    console.error(`WARN: fragment "${s.name}" not in order list; appending at end`);
    songs.push(s);
  }
}

const manifest = songbook ? { songbook, songs } : { songs };
writeFileSync(out, JSON.stringify(manifest, null, 2));
console.error(`assembled ${songs.length} song(s) -> ${out}`);
