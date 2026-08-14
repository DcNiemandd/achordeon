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
 *    yes. Reading `screen` IS reading the device, so it waits to be allowed —
 *    and the aspect ratio a song is set to ({@link Stats.countAspectRatio}),
 *    which is neither of the two: it is a fact about what somebody made rather
 *    than about the navigation or the device. A third category, so it is asked
 *    for, and privacy.mdx names it in the same breath as the screen size.
 *
 * There is no third-party script: the endpoint answers a plain GET with a 1x1
 * GIF, so an `Image` is the whole transport. That keeps `script-src` untouched
 * and leaves nothing to keep patched — only `img-src` names the origin.
 *
 * Both layers stop entirely when GoatCounter's own opt-out is set — `skipgc`,
 * written by their `#toggle-goatcounter` address, which this file honours in
 * their place since none of their script runs here. It is ours, not the
 * reader's: no page says it exists and it reports itself to the console only.
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

  constructor() {
    honourToggleHash();
  }

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
   * anything the reader notices.
   */
  count(path: string): void {
    const params = new URLSearchParams({
      p: normalizePath(path),
      r: referrerHost(),
    });

    if (this.isExtraAllowed()) {
      params.set('s', screenSize());
    }

    this.send(params);
  }

  /**
   * Count one aspect ratio, as a GoatCounter **event** (`e=1`, the name in `p`).
   *
   * The question it answers is the `TODO` in `aspect-options.ts`: the picker
   * offers thirty-odd shapes and nothing says which ones earn a row. So what is
   * counted is the **pick**, not the render — a song drawn a hundred times is
   * one decision, and counting the drawing would tell us which song somebody
   * likes rather than which shape they reach for. `source` rides along because
   * the two questions the card asks are different: which preset rows to keep,
   * and whether the free-text field is used at all.
   *
   * Behind the opt-in, on the reasoning in this file's header. No referrer and
   * no screen size go with it: an event is one fact, and pairing "this device is
   * shaped so" with "this person chose that" is a join nobody needs to make.
   */
  countAspectRatio(source: AspectRatioSource, value: string): void {
    if (!this.isExtraAllowed()) return;

    this.send(
      new URLSearchParams({ p: `aspect/${source}/${value.trim()}`, e: '1' }),
    );
  }

  /** Both layers of consent, which every extra field is behind. */
  private isExtraAllowed(): boolean {
    return this.isOn() && !this.isRefusedByBrowser;
  }

  /**
   * The transport, and the two switches that silence it — one endpoint check
   * and one opt-out, applied to visits and events alike so neither can be
   * counted by a route the other does not go through.
   */
  private send(params: URLSearchParams): void {
    if (this.endpoint === '' || isCountingSkipped()) return;

    // Last, so it reads as the cache-buster it is. Repeat counts of one path are
    // the entire point, and a cached GIF would swallow them.
    params.set('rnd', String(Math.random()).slice(2));

    new Image().src = `${this.endpoint}?${params}`;
  }
}

/**
 * How a page shape was arrived at — the second half of what an aspect-ratio
 * event says.
 *
 * `screen` and `screen-sideways` are the two measuring rows, which are worth
 * telling apart from a preset with the same value: a ratio typed by a phone is
 * evidence for adding that phone's row, where the same ratio picked off the list
 * is evidence the row is already right.
 */
export type AspectRatioSource =
  | 'preset'
  | 'screen'
  | 'screen-sideways'
  | 'custom';

const CONSENT_KEY = 'achordeon.stats';

function readConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === 'on';
  } catch {
    return false;
  }
}

/** GoatCounter's key, with their value — theirs, so it reads the same anywhere. */
const SKIP_KEY = 'skipgc';

/**
 * Whether counting was turned off altogether.
 *
 * Read at every count and not once at construction, unlike the consent signal:
 * the docs half of the origin may flip this in another tab while this app is
 * still open, and the next route should already be silent.
 */
function isCountingSkipped(): boolean {
  try {
    return localStorage.getItem(SKIP_KEY) === 't';
  } catch {
    return false;
  }
}

/**
 * `#toggle-goatcounter` in the address flips the opt-out, and the same address
 * again flips it back — GoatCounter's own switch, done by hand here.
 *
 * The hash reaches this app on its own: the site root redirects here and carries
 * the fragment along (the docs' `appRedirectScript`), so `achordeon.eu/#toggle-
 * goatcounter` is answered by this function and not by the docs' twin.
 *
 * At construction, which is boot: before the first `NavigationEnd`, so the visit
 * that turns counting off is not the last one counted. Once, too — the router
 * would otherwise re-read the same fragment on a later navigation and undo it.
 */
function honourToggleHash(): void {
  if (location.hash !== '#toggle-goatcounter') return;

  const wasSkipped = isCountingSkipped();

  try {
    if (wasSkipped) localStorage.removeItem(SKIP_KEY);
    else localStorage.setItem(SKIP_KEY, 't');
  } catch {
    return;
  }

  console.info(
    `[goatcounter] Visit counting is now ${wasSkipped ? 'on' : 'off'} in this browser.`,
  );
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
