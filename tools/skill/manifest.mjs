// What goes in the zip, and where it comes from. One list, so the smoke test and
// the zip builder cannot disagree about what "the skill" is.

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../..',
);

export const scriptsDir = resolve(repoRoot, '.claude/skills/song-core/scripts');

/** Where `gen-skill-bundle` leaves the dependency-free domain. */
export const bundlePath = resolve(repoRoot, 'dist/skill/_domain.mjs');

/**
 * The scripts, **copied byte for byte** out of the repo's own skill.
 *
 * That is the whole trick of §3: they import `./_domain.mjs`, which in the repo
 * loads the TypeScript through jiti and in the zip is the bundle. Same specifier,
 * two implementations, so the scripts that ship are the scripts that were tested
 * and there is no packaging rewrite in between to get wrong.
 *
 * `to-achordeon.mjs` and `_domain-core.mjs` are NOT here: they are inside the
 * bundle already, and a second copy on disk could be edited into disagreeing
 * with it.
 */
export const SHIPPED_SCRIPTS = [
  'validate.mjs',
  'merge-chordlines.mjs',
  'build-import.mjs',
];
