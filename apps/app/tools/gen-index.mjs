// Generates `src/index.html` from `src/index.html.template`.
//
// One job: **the CSP** (PRD-INFRASTRUCTURE.md §7). GitHub Pages cannot send
// response headers, so the policy rides in a `<meta http-equiv>`, and a meta
// policy has no nonce mechanism. Each inline script is therefore allowed by the
// **sha256 of its own body**, computed here from the finished script text. Edit a
// script in the template and its hash follows; there is nothing to keep in step by
// hand, which is the only way a hash-based policy stays true.
//
// Pass `--dev` for the two allowances the dev-server needs (its websocket, and
// `unsafe-eval` for the reload client). The policy is otherwise identical, so a
// violation surfaces while developing instead of only in production.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './env.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');
const isDev = process.argv.includes('--dev');

const template = readFileSync(
  resolve(projectRoot, 'src/index.html.template'),
  'utf8',
);

writeFileSync(
  resolve(projectRoot, 'src/index.html'),
  template
    .replace('__ACHORDEON_CSP__', cspMeta(template))
    .replace('__ACHORDEON_GOATCOUNTER__', goatcounterMeta()),
);

// --- CSP ---------------------------------------------------------------------

/**
 * The policy, as a meta tag.
 *
 * The allowed origins are the two the app actually talks to (§5 Supabase, §6
 * Drive). `SUPABASE_URL` comes from the same environment that feeds
 * `gen-supabase.mjs`; an offline-only build has no Supabase origin to allow and
 * says so by omission.
 */
function cspMeta(source) {
  const scripts = ["'self'", ...scriptHashes(source)];
  if (isDev) scripts.push("'unsafe-eval'");

  const connect = [
    "'self'",
    'https://www.googleapis.com',
    ...supabaseOrigins(),
  ];
  if (isDev) connect.push('ws://localhost:*', 'ws://127.0.0.1:*');

  const policy = [
    "default-src 'self'",
    `script-src ${scripts.join(' ')}`,
    // Angular writes component styles into <style> elements at runtime, and a
    // meta policy cannot carry a per-response nonce (a fixed one would be worth
    // nothing). A stylesheet cannot read IndexedDB or a sync token, which is the
    // risk §7 is actually about.
    "style-src 'self' 'unsafe-inline'",
    // `data:`/`blob:` here are ours: the SVG render rasterises through a blob URL
    // and embeds its faces as base64 (ADR-0002). The statistics origin is here
    // rather than in `connect-src` because the beacon IS an image — a GET that
    // answers with a 1x1 GIF — which is what keeps it script-free.
    `img-src ${["'self'", 'data:', 'blob:', ...goatcounterOrigins()].join(' ')}`,
    "font-src 'self' data:",
    `connect-src ${connect.join(' ')}`,
    "object-src 'none'",
    // Nothing is embedded. (`frame-ancestors` is ignored in a meta policy, so it
    // is deliberately absent rather than present and misleading.)
    "frame-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ].join('; ');

  return `<meta http-equiv="Content-Security-Policy" content="${policy}" />`;
}

/**
 * Where the usage beacon points, as a meta tag the bundle reads at runtime.
 *
 * It rides in the generated index rather than its own `analytics.config.ts`
 * because the CSP below needs the very same origin: derive both from one env
 * read and the policy cannot end up allowing an origin the app does not use, or
 * vice versa. `GOATCOUNTER_URL` unset → no tag, and `Stats` then counts nothing,
 * which is what an offline-only or forked build wants.
 */
function goatcounterMeta() {
  const endpoint = countEndpoint();

  return endpoint
    ? `<meta name="achordeon-goatcounter" content="${endpoint}" />`
    : '';
}

/** `GOATCOUNTER_URL` + `count`, or '' when it is unset or unparseable. */
function countEndpoint() {
  const url = env('GOATCOUNTER_URL');
  if (!url) return '';
  try {
    // A trailing slash matters to `new URL`: without it the last segment is
    // replaced rather than appended, so `…/goatcounter.com` would lose its host
    // path. Adding one is harmless when it is already there.
    return new URL('count', url.endsWith('/') ? url : `${url}/`).href;
  } catch {
    return '';
  }
}

/** The beacon's origin for `img-src`, as a list so "unset" is an empty one. */
function goatcounterOrigins() {
  const endpoint = countEndpoint();
  if (endpoint === '') return [];

  return [new URL(endpoint).origin];
}

/**
 * The Supabase origin plus its websocket twin (Realtime, ADR-0003) — `wss` in
 * production, `ws` against a local stack, which is the only reason the scheme is
 * derived rather than assumed.
 */
function supabaseOrigins() {
  const url = env('SUPABASE_URL');
  if (!url) return [];
  try {
    const { origin, protocol } = new URL(url);
    const socket = origin.replace(
      protocol,
      protocol === 'https:' ? 'wss:' : 'ws:',
    );
    return [...new Set([origin, socket])];
  } catch {
    return [];
  }
}

/**
 * A `'sha256-…'` source for each inline script, and the SRI guard that belongs
 * next to it: §7 requires `integrity` + `crossorigin` on any script we do not
 * serve ourselves. There are none today — the check exists so that adding one
 * cannot skip the requirement quietly.
 */
function scriptHashes(source) {
  for (const [, attrs] of source.matchAll(/<script\b([^>]*)>/g)) {
    const external = /\bsrc="(?:https?:)?\/\//.test(attrs);
    if (!external) continue;
    if (!/\bintegrity=/.test(attrs) || !/\bcrossorigin/.test(attrs)) {
      throw new Error(
        `Third-party script without SRI in index.html.template: <script${attrs}>\n` +
          'PRD-INFRASTRUCTURE.md §7 requires integrity + crossorigin on any script we do not serve.',
      );
    }
  }

  const inline = source.matchAll(
    /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g,
  );
  return [...inline].map(
    ([, body]) =>
      `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`,
  );
}
