import { Injectable, signal } from '@angular/core';

/**
 * Counting which routes get used — the beacon, and the switch over its second half.
 *
 * Two layers, because they answer to different rules (docs/privacy.mdx says
 * which, and that page is the contract this file has to keep true):
 *
 * 1. **Always.** The path and the referrer's host. Both are things this app was
 *    told by the navigation itself, so nothing is stored on the device and
 *    nothing is read off it — which is why no permission is asked for.
 * 2. **On request.** The screen size, added only once `achordeon.stats` says
 *    yes. Reading `screen` IS reading the device, so it waits to be allowed.
 *
 * There is no third-party script: the endpoint answers a plain GET with a 1x1
 * GIF, so an `Image` is the whole transport. That keeps `script-src` untouched
 * and leaves nothing to keep patched — only `img-src` names the origin.
 *
 * The key is `achordeon.stats`, and the DOCS WRITE IT TOO. That works because
 * both are served from one origin (`/app/` and `/docs/` of the same host), so
 * localStorage is shared and a reader who decides in the docs never gets asked
 * again here. Split them onto separate subdomains and this quietly becomes two
 * independent switches.
 */
@Injectable({ providedIn: 'root' })
export class Stats {
  /** Set from the generated meta tag; '' when `GOATCOUNTER_URL` was unset. */
  private readonly endpoint =
    document
      .querySelector('meta[name="achordeon-goatcounter"]')
      ?.getAttribute('content') ?? '';

  private readonly isOn = signal(readConsent());

  /** Whether the extra statistics are allowed — the Settings row reads this. */
  readonly isAllowed = this.isOn.asReadonly();

  /**
   * Whether the browser itself refused, which overrides the switch.
   *
   * Read once: neither signal changes without a reload, and a getter here would
   * invite it into a template that re-runs.
   */
  readonly isRefusedByBrowser = isRefusedByBrowser();

  allow(isAllowed: boolean): void {
    this.isOn.set(isAllowed);
    try {
      localStorage.setItem(CONSENT_KEY, isAllowed ? 'on' : 'off');
    } catch {
      // Private mode, or a full store. The choice then lasts this session only,
      // which fails towards off.
    }
  }

  /**
   * Count one view of `path`.
   *
   * Fire-and-forget, like the lobby's analytics (ADR-0003): the `Image` is never
   * awaited and never inspected, so a blocked or failed beacon cannot show up as
   * anything the reader notices. `rnd` defeats the cache — repeat views of one
   * path are the entire point, and a cached GIF would swallow them.
   */
  count(path: string): void {
    if (this.endpoint === '') return;

    const params = new URLSearchParams({
      p: normalizePath(path),
      r: referrerHost(),
      rnd: String(Math.random()).slice(2),
    });

    if (this.isOn() && !this.isRefusedByBrowser) {
      params.set('s', screenSize());
    }

    new Image().src = `${this.endpoint}?${params}`;
  }
}

const CONSENT_KEY = 'achordeon.stats';

function readConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === 'on';
  } catch {
    return false;
  }
}

/**
 * Global Privacy Control or Do Not Track. Both are read off a cast: GPC is too
 * new for lib.dom and `doNotTrack` is deprecated enough to be leaving it.
 */
function isRefusedByBrowser(): boolean {
  const nav = navigator as {
    globalPrivacyControl?: boolean;
    doNotTrack?: string | null;
  };

  return nav.globalPrivacyControl === true || nav.doNotTrack === '1';
}

/**
 * A route, with everything specific to one library taken out.
 *
 * This is the line between "which pages get used" and following a person around
 * their own songbook, and the promise in docs/privacy.mdx rests on it. Ids go
 * first — `/songs/<uuid>` becomes `/songs/:id`, so a thousand libraries fold into
 * one row instead of a thousand — and the query string goes with them, because a
 * search term is something the reader typed.
 */
function normalizePath(path: string): string {
  const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

  return path.split(/[?#]/)[0].replace(UUID, ':id');
}

/**
 * The referring domain, never the full address — a path can name a song, and a
 * search URL carries the query that found us. Our own host counts as no
 * referrer, so an in-app navigation does not report itself as its own source.
 */
function referrerHost(): string {
  try {
    const { hostname } = new URL(document.referrer);

    return hostname === location.hostname ? '' : hostname;
  } catch {
    return '';
  }
}

/** GoatCounter's `s`: width, height, pixel ratio. */
function screenSize(): string {
  return [screen.width, screen.height, devicePixelRatio || 1].join(',');
}
