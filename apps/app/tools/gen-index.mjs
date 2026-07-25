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

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');
const isDev = process.argv.includes('--dev');

const template = readFileSync(
  resolve(projectRoot, 'src/index.html.template'),
  'utf8',
);

writeFileSync(
  resolve(projectRoot, 'src/index.html'),
  template.replace('__ACHORDEON_CSP__', cspMeta(template)),
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
    // and embeds its faces as base64 (ADR-0002).
    "img-src 'self' data: blob:",
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
 * The Supabase origin plus its websocket twin (Realtime, ADR-0003) — `wss` in
 * production, `ws` against a local stack, which is the only reason the scheme is
 * derived rather than assumed.
 */
function supabaseOrigins() {
  const url = process.env.SUPABASE_URL;
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
