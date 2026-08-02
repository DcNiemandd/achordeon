// The one way a generator reads its configuration.
//
// Two files under `tools/` are driven by the same environment — `gen-supabase.mjs`
// writes the client's coordinates, `gen-index.mjs` writes the CSP that decides
// whether the client may *reach* them — and for a while only the first of them
// read `.env.local`. The result was a local build that knew the Supabase URL and
// forbade itself from calling it: every REST request blocked by `connect-src`,
// while Realtime worked, because the dev policy allows `ws://127.0.0.1:*` blindly
// and so masked the gap.
//
// One reader, used by both, means the policy cannot disagree with the config it
// is written for.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');

/** Minimal KEY=VALUE parser — no dependency. Missing file → {}. */
function readEnvFile(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return {};
  }
  const out = {};
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const fileEnv = readEnvFile(resolve(repoRoot, '.env.local'));

/**
 * One variable, from the environment or the local file.
 *
 * `process.env` wins so CI overrides local, and `??` (not `||`) keeps an explicit
 * empty value — "no backend", "no statistics" — from either source instead of
 * falling through to the next one.
 *
 * @returns the value, or `undefined` if neither source has the key.
 */
export function env(key) {
  return process.env[key] ?? fileEnv[key];
}
