// The one smoke test that matters more than it looks — plan §3.
//
// Run the shipped scripts against the bundle **in a directory with no
// `node_modules`**. That is the skill's sandbox condition: Node, no network, no
// install. It is the only way to catch a dependency that slipped into the bundle,
// and it also proves the scripts really are usable unchanged — the claim the whole
// two-files-one-name arrangement rests on.
//
// Needs `nx run skill:gen-skill-bundle` first; the test target depends on it.

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { bundlePath, scriptsDir, SHIPPED_SCRIPTS } from './manifest.mjs';

/** Every `node_modules` Node could resolve from `dir`, walking up. */
function reachableNodeModules(dir) {
  const found = [];
  let current = resolve(dir);
  for (;;) {
    const candidate = join(current, 'node_modules');
    if (existsSync(candidate)) found.push(candidate);
    const parent = dirname(current);
    if (parent === current) return found;
    current = parent;
  }
}

let sandbox;
// The reports colour their counts, and under a task runner that forces colour on
// the escapes land in the captured output. They say nothing about whether the
// script worked, so they are stripped rather than asserted around.
const ANSI = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g');
const run = (script, args = []) =>
  execFileSync(process.execPath, [join(sandbox, script), ...args], {
    cwd: sandbox,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).replace(ANSI, '');

before(() => {
  assert.ok(
    existsSync(bundlePath),
    `no bundle at ${bundlePath} — run \`nx run skill:gen-skill-bundle\` first`,
  );
  sandbox = mkdtempSync(join(tmpdir(), 'achordeon-skill-'));
  copyFileSync(bundlePath, join(sandbox, '_domain.mjs'));
  for (const script of SHIPPED_SCRIPTS) {
    copyFileSync(join(scriptsDir, script), join(sandbox, script));
  }
});

describe('the skill bundle, in the sandbox', () => {
  test('the sandbox really has no node_modules to fall back on', () => {
    // If this ever fails it is the machine, not the bundle: something has left a
    // `node_modules` above the temp directory, and every assertion below would
    // then be able to pass by resolving a dependency the skill will not have.
    assert.deepEqual(
      reachableNodeModules(sandbox),
      [],
      'the smoke test is not proving what it claims',
    );
  });

  test('imports with nothing installed', async () => {
    const domain = await import(
      `file://${join(sandbox, '_domain.mjs').replace(/\\/g, '/')}`
    );
    assert.equal(typeof domain.parse, 'function');
    assert.equal(typeof domain.inspect, 'function');
    assert.equal(typeof domain.toAchordeon, 'function');
    assert.equal(typeof domain.SCHEMA_VERSION, 'number');
  });

  test('the bundled theory is the app’s, not an approximation', async () => {
    const { theory } = await import(
      `file://${join(sandbox, '_domain.mjs').replace(/\\/g, '/')}`
    );
    assert.deepEqual(theory.parseChord('C#m7/G'), {
      root: 'C#',
      bass: 'G',
      quality: 'm7',
    });
    // The German H is B natural — the rule the whole notation setting rests on.
    assert.equal(theory.noteChroma('H'), theory.noteChroma('B'));
  });

  test('validate.mjs reports on a song', () => {
    writeFileSync(
      join(sandbox, 'song.txt'),
      '* Title\n\nVerse: Some [Am]words\n',
      'utf8',
    );
    const out = run('validate.mjs', ['song.txt']);
    assert.match(out, /Title\s*: Title/);
    assert.match(out, /Chords\s*: 1/);
  });

  test('merge-chordlines.mjs folds a chord row', () => {
    writeFileSync(
      join(sandbox, 'in.txt'),
      'Am        F\nSome words of a song\n',
    );
    run('merge-chordlines.mjs', ['in.txt', '-o', 'out.txt']);
    assert.equal(
      readFileSync(join(sandbox, 'out.txt'), 'utf8'),
      '[Am]Some words[F] of a song\n',
    );
  });

  test('build-import.mjs writes an importable envelope', () => {
    writeFileSync(
      join(sandbox, 'manifest.json'),
      JSON.stringify({
        songs: [{ name: 'Thyme', content: '* Wild Mountain Thyme\n' }],
      }),
    );
    run('build-import.mjs', ['manifest.json', '-o', 'import.json']);
    const envelope = JSON.parse(
      readFileSync(join(sandbox, 'import.json'), 'utf8'),
    );
    assert.equal(envelope.data.songs.length, 1);
    // The cache came from the REAL parser, which is the point of bundling it.
    assert.equal(envelope.data.songs[0].cache.title, 'Wild Mountain Thyme');
    assert.equal(typeof envelope.schemaVersion, 'number');
  });
});

process.on('exit', () => {
  if (sandbox) rmSync(sandbox, { recursive: true, force: true });
});
