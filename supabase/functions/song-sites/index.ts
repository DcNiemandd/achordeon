// Song sites — the proxy that reads a song off a chord website for the app
// (ADR-0019, plans/import-chord-sheets.md phase 5).
//
// Those sites send no CORS headers, so a browser cannot read them. This fetches
// one song, or one search, per explicit user action, with an identifiable
// User-Agent, within each site's robots.txt, and stores nothing about it. The
// contract lives in `handler.ts`; this file is only what needs a server: the
// real network, and the rate limit's ledger.
//
// Deployed from `main` by the Supabase GitHub integration, with the migrations.

import { createClient } from '@supabase/supabase-js';
import { CORS, handle } from './handler.ts';

/** Calls that reach a site, per IP hash per window (plan Q55). Plenty for a
 * person searching and previewing, useless as a scraper's pipe. */
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 10 * 60 * 1000;

/** How long one site may take before its group says so (plan Q16). */
const TIMEOUT_MS = 5000;

Deno.serve(async (req) => {
  try {
    return await handle(req, {
      fetch,
      isRateLimited,
      timeoutMs: TIMEOUT_MS,
    });
  } catch {
    return new Response(JSON.stringify({ reason: 'failed' }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});

/**
 * Counts this call, then says whether it was one too many.
 *
 * Counted before the answer, so a burst arriving together cannot all slip past
 * the check. A limiter that cannot read its own ledger lets the call through:
 * the worse failure is a person who cannot find their song.
 */
async function isRateLimited(req: Request): Promise<boolean> {
  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
  const hash = await ipHash(req);
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const { count, error } = await admin
    .from('song_sites_throttle')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', hash)
    .gte('created_at', since);
  await admin.from('song_sites_throttle').insert({ ip_hash: hash });
  await admin.from('song_sites_throttle').delete().lt('created_at', since);
  if (error) {
    // Said out loud: failing open is a choice, failing open unnoticed is a bug.
    console.error(
      'song-sites: rate limit unreadable',
      error.code,
      error.message,
    );
    return false;
  }
  return (count ?? 0) >= RATE_LIMIT;
}

/**
 * A salted hash of the caller's address, as `feedback` keeps one.
 *
 * Its own salt where one is set, else feedback's: an unset salt puts every
 * caller in one bucket, which here would stop everyone's search at once.
 */
async function ipHash(req: Request): Promise<string> {
  const forwarded = req.headers.get('x-forwarded-for') ?? '';
  const ip = forwarded.split(',')[0].trim();
  const salt =
    Deno.env.get('SONG_SITES_IP_SALT') ??
    Deno.env.get('FEEDBACK_IP_SALT') ??
    '';
  const bytes = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
