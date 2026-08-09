// The bundle's entry — the OTHER half of `_domain.mjs` (see that file's banner).
//
// esbuild follows the `.ts` imports below into the repo's real domain and chord
// theory, pulls tonal in with them, and emits one dependency-free `.mjs` that the
// skill ships AS `_domain.mjs`. The skill's sandbox has Node but no network, so
// `npm install` is not available and jiti cannot load a `.ts` — a bundle is the
// only way the shipped scripts can run the app's own grammar.
//
// It differs from the repo's `_domain.mjs` in exactly one way, deliberately: how
// the domain is got hold of. Everything else comes from `makeDomain`, so the two
// cannot drift into offering different things under the same name.
//
// `findRepoRoot` is NOT exported here. It answers "where is the repo", and in the
// zip there is no repo — a stub that returned something would be worse than the
// missing export, which fails loudly at import time if a script ever grows a
// dependency on it.

import {
  parse,
  toEnglishNotation,
  SETTINGS,
  SCHEMA_VERSION,
  ACHORDEON_URL,
} from '../../libs/shared/domain/src/index.ts';
import { TonalChordTheory } from '../../libs/shared/chord-theory/src/index.ts';
import { makeDomain } from '../../.claude/skills/song-core/scripts/_domain-core.mjs';

export const {
  theory,
  toAchordeon,
  SONG_SETTING_KEYS,
  SONGBOOK_SETTING_KEYS,
  inspect,
} = makeDomain({
  parse,
  toEnglishNotation,
  SETTINGS,
  SCHEMA_VERSION,
  ACHORDEON_URL,
  theory: new TonalChordTheory(),
});

export { parse, toEnglishNotation, SETTINGS, SCHEMA_VERSION, ACHORDEON_URL };
