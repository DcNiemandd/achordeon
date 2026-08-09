// The zip, opened and used the way somebody else's assistant would — plan §8
//
// The bundle smoke test proves the domain runs with nothing installed. This
// proves the **package**: that what the zip actually contains is a skill you can
// unpack into a bare directory and work in, start to finish, without the repo.
//
// Needs `nx run skill:gen-skill-zip` first; the test target depends on it.

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { unzipSync, strFromU8 } from 'fflate';
import { repoRoot } from './manifest.mjs';

const artifacts = resolve(repoRoot, 'apps/docs/static');
const ANSI = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g');

let sandbox;
let files;

/**
 * Run one of the skill's own scripts, from inside the unpacked skill.
 *
 * Both streams, because the scripts use them for different things: `validate`
 * reports on stdout, and `build-import` keeps stdout for the JSON and puts its
 * report — the link included — on stderr.
 */
function run(script, args = []) {
  const result = spawnSync(process.execPath, [join(sandbox, script), ...args], {
    cwd: sandbox,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `${script} exited ${result.status}`);
  return `${result.stdout}${result.stderr}`.replace(ANSI, '');
}

before(() => {
  const zip = join(artifacts, 'achordeon-song.zip');
  assert.ok(
    existsSync(zip),
    `no zip at ${zip} — run \`nx run skill:gen-skill-zip\` first`,
  );
  files = unzipSync(new Uint8Array(readFileSync(zip)));
  sandbox = mkdtempSync(join(tmpdir(), 'achordeon-zip-'));
  for (const [path, bytes] of Object.entries(files)) {
    mkdirSync(dirname(join(sandbox, path)), { recursive: true });
    writeFileSync(join(sandbox, path), bytes);
  }
});

describe('the skill, unpacked', () => {
  test('carries the instructions, the grammar, the schema and the scripts', () => {
    assert.deepEqual(Object.keys(files).sort(), [
      'GRAMMAR.md',
      'SKILL.md',
      'achordeon.schema.json',
      'scripts/_domain.mjs',
      'scripts/build-import.mjs',
      'scripts/merge-chordlines.mjs',
      'scripts/validate.mjs',
    ]);
  });

  test('the instructions say a song’s own words are data, never an order', () => {
    // The one attack this surface has: a "song" whose lyrics address the
    // assistant. It has to be stated, not implied.
    const skill = strFromU8(files['SKILL.md']);
    assert.match(skill, /never an instruction/i);
    assert.match(skill, /^name: achordeon-song$/m);
  });

  test('the schema it ships is the schema the site serves', () => {
    assert.equal(
      strFromU8(files['achordeon.schema.json']),
      readFileSync(join(artifacts, 'achordeon.schema.json'), 'utf8'),
    );
  });

  test('the scripts are the repo’s own, byte for byte', () => {
    for (const name of [
      'validate.mjs',
      'merge-chordlines.mjs',
      'build-import.mjs',
    ]) {
      assert.equal(
        strFromU8(files[`scripts/${name}`]),
        readFileSync(
          resolve(repoRoot, '.claude/skills/song-core/scripts', name),
          'utf8',
        ),
        `${name} was rewritten on the way into the zip`,
      );
    }
  });

  test('converts, checks and builds — with nothing installed', () => {
    writeFileSync(
      join(sandbox, 'source.txt'),
      [
        '{title: Wild Mountain Thyme}',
        '{artist: Traditional}',
        '',
        'Am        F',
        'Oh the summer time is coming',
      ].join('\n'),
    );

    run('scripts/merge-chordlines.mjs', ['source.txt', '-o', 'song.txt']);
    const markup = readFileSync(join(sandbox, 'song.txt'), 'utf8');
    assert.match(markup, /^\* Wild Mountain Thyme$/m);
    assert.match(markup, /^\*\* Traditional$/m);
    assert.match(markup, /\[Am\]/);

    const report = run('scripts/validate.mjs', ['song.txt']);
    assert.match(report, /Title\s*: Wild Mountain Thyme/);
    assert.match(report, /No warnings/);

    writeFileSync(
      join(sandbox, 'manifest.json'),
      JSON.stringify({
        songs: [{ name: 'Wild Mountain Thyme', contentFile: 'song.txt' }],
      }),
    );
    run('scripts/build-import.mjs', ['manifest.json', '-o', 'import.json']);
    const envelope = JSON.parse(
      readFileSync(join(sandbox, 'import.json'), 'utf8'),
    );
    assert.equal(envelope.data.songs.length, 1);
    // Human-readable, so it can never collide with a real device uuid.
    assert.equal(envelope.deviceId, 'achordeon-skill');
    assert.equal(envelope.data.songs[0].cache.title, 'Wild Mountain Thyme');
    // A Snapshot's field, not an Export's — an import must never carry one.
    assert.equal(envelope.data.user, undefined);
  });

  test('offers a link for the song it just built', () => {
    const out = run('scripts/build-import.mjs', [
      'manifest.json',
      '-o',
      'import.json',
      '--link',
    ]);
    const link = /(https:\/\/\S*#z1=\S+)/.exec(out)?.[1];
    assert.ok(link, 'no link in the report');
    assert.ok(link.length < 8000, 'a one-song link should fit comfortably');
  });
});

process.on('exit', () => {
  if (sandbox) rmSync(sandbox, { recursive: true, force: true });
});
