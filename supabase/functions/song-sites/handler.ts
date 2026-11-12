// The Song sites contract (plan phase 5, ADR-0019): `sites`, `search`, `song`.
//
// Kept apart from `index.ts` so it can be driven without a server, a database
// or the network: everything it reaches out to arrives in `Deps`.

import type { Fetch } from './site.ts';
import { SITES } from './sites.ts';

export interface Deps {
  /** How the upstream sites are reached. */
  readonly fetch: Fetch;
  /** Whether this caller has used up the window (plan Q55). */
  readonly isRateLimited: (req: Request) => Promise<boolean>;
  /** How long one site may take before its group says so (plan Q16). */
  readonly timeoutMs: number;
}

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'method-not-allowed');

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return fail(400, 'malformed');
  }

  // Only what reaches a site is counted: asking which sites there are is free.
  if (body.action === 'search' || body.action === 'song') {
    if (await deps.isRateLimited(req)) return fail(429, 'rate-limited');
  }

  switch (body.action) {
    case 'sites':
      return ok(
        [...SITES].map(([site, { name, urlHint }]) => ({
          site,
          name,
          urlHint,
        })),
      );
    case 'search': {
      const q = typeof body.q === 'string' ? body.q.trim() : '';
      if (q.length < QUERY_MIN || q.length > QUERY_MAX) {
        return fail(400, 'bad-query');
      }
      return ok(await search(q, deps));
    }
    case 'song':
      return await song(body, deps);
    default:
      return fail(400, 'bad-action');
  }
}

/** Shorter finds everything, longer is not a song name. */
const QUERY_MIN = 2;
const QUERY_MAX = 200;

/**
 * Every site at once, each in its own group and its own order (plan Q16).
 *
 * A site that fails or is slow costs only its own group: the rest still answer,
 * and the group says why it is empty, as a code the app words.
 */
function search(q: string, deps: Deps) {
  return Promise.all(
    [...SITES].map(async ([site, adapter]) => {
      try {
        return {
          site,
          results: await withTimeout(deps, (fetch) => adapter.search(q, fetch)),
        };
      } catch (error) {
        return { site, groupError: errorCode(error), results: [] };
      }
    }),
  );
}

/**
 * One song, raw: the function never converts (plan, contract). The first
 * version is the text; `versions` is there only when there is a choice (Q57).
 */
async function song(
  body: Record<string, unknown>,
  deps: Deps,
): Promise<Response> {
  let site = typeof body.site === 'number' ? body.site : NaN;
  let id = typeof body.id === 'string' ? body.id : '';
  if (typeof body.url === 'string') {
    // The site decides whether a link is one of its songs (plan Q15).
    const found = fromUrl(body.url);
    if (!found) return fail(422, 'unsupported-url');
    [site, id] = found;
  }
  const adapter = SITES.get(site);
  if (!adapter || !id) return fail(400, 'bad-song');

  let page;
  try {
    page = await withTimeout(deps, (fetch) => adapter.song(id, fetch));
  } catch (error) {
    const code = errorCode(error);
    return fail(code === 'timeout' ? 504 : 502, code);
  }
  if (!page || page.versions.length === 0) return fail(404, 'not-found');

  return ok({
    site,
    title: page.title,
    artist: page.artist,
    ...(page.versions.length > 1 ? { versions: page.versions } : {}),
    text: page.versions[0].text,
    format: 'chordpro',
    url: adapter.urlOf(id),
  });
}

/** The site and our id for a pasted link, or null when no site reads it. */
function fromUrl(raw: string): [number, string] | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  for (const [site, adapter] of SITES) {
    const id = adapter.idFromUrl(url);
    if (id !== null) return [site, id];
  }
  return null;
}

/** Run `job` with a fetch that gives up after `deps.timeoutMs`. */
async function withTimeout<T>(
  deps: Deps,
  job: (fetch: Fetch) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs);
  try {
    return await job((input, init) =>
      deps.fetch(input, { ...init, signal: controller.signal }),
    );
  } finally {
    clearTimeout(timer);
  }
}

function errorCode(error: unknown): 'timeout' | 'unavailable' {
  return error instanceof DOMException && error.name === 'AbortError'
    ? 'timeout'
    : 'unavailable';
}

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/** A code, not a sentence: the app owns the wording (plan Q56). */
function fail(status: number, reason: string): Response {
  return new Response(JSON.stringify({ reason }), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
