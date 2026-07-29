import { isRefusedByBrowser, readStats } from './stats-consent';

/**
 * Counting which pages get read — the docs half of the beacon.
 *
 * Deliberately a near-twin of `apps/app/src/app/shared/layout/stats.ts` rather
 * than a shared library: it is thirty lines, and the two live in different
 * builds (Docusaurus's webpack, Angular's) with different ways of learning the
 * endpoint. A lib would buy less than the wiring costs. What MUST stay in step
 * is the promise in `docs/privacy.mdx`, which both files answer to — change the
 * fields here and change them there.
 *
 * The transport is an `Image`: the endpoint answers a GET with a 1x1 GIF, so no
 * third-party script runs on the docs at all.
 */
export function countVisit(endpoint: string, path: string): void {
  if (endpoint === '') return;

  const params = new URLSearchParams({
    p: normalizePath(path),
    r: referrerHost(),
    rnd: String(Math.random()).slice(2),
  });

  // The screen is the one field read off the device, so it waits for a yes.
  if (readStats() && !isRefusedByBrowser()) {
    params.set(
      's',
      [screen.width, screen.height, devicePixelRatio || 1].join(','),
    );
  }

  new Image().src = `${endpoint}?${params}`;
}

/**
 * The page, without the query string.
 *
 * The docs carry no ids to strip — unlike the app, whose routes name songs — but
 * a search or a campaign parameter is still something the reader brought with
 * them, and the locale already rides in the path (`/cs/…`), which is how one
 * GoatCounter site reports both languages without a field for it.
 */
function normalizePath(path: string): string {
  return path.split(/[?#]/)[0];
}

/** The referring domain only, and never our own — see the app's twin. */
function referrerHost(): string {
  try {
    const { hostname } = new URL(document.referrer);

    return hostname === location.hostname ? '' : hostname;
  } catch {
    return '';
  }
}
