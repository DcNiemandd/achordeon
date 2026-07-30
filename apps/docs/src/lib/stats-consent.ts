/**
 * The opt-in flag for the extra usage statistics — shared with the Angular app.
 *
 * One dotted `achordeon.` key, like `achordeon.theme` and `achordeon.language`,
 * rather than the docs' own `achordeon-docs-locale-init`: this is the one key
 * BOTH webs read, so it follows the app's convention.
 *
 * That sharing works only because the docs and the app are served from the same
 * origin — `/docs/…` and `/app/…` of `DOCS_URL`. localStorage is per-origin, so
 * a switch flipped here is the value the app boots with, and there is no
 * message-passing or duplicated state to keep in step. Move the app to its own
 * subdomain and the crossing-over stops silently: the toggle would still work,
 * but for the docs alone.
 */
const STATS_KEY = 'achordeon.stats';

/**
 * GoatCounter's own opt-out, which is a different switch from the one above.
 *
 * `skipgc` is the key their `count.js` writes and `#toggle-goatcounter` is the
 * address that writes it, so this keeps their key and their value rather than
 * inventing a third `achordeon.` one — a reader who knows the mechanism from any
 * other GoatCounter site finds it here unchanged.
 *
 * It is also the stronger of the two: `achordeon.stats` governs one field of the
 * request, this one stops the request from being sent.
 */
const SKIP_KEY = 'skipgc';

/** Whether the reader opted in. Absent means no, which is the default. */
export function readStats(): boolean {
  try {
    return localStorage.getItem(STATS_KEY) === 'on';
  } catch {
    return false;
  }
}

export function writeStats(isOn: boolean): void {
  try {
    localStorage.setItem(STATS_KEY, isOn ? 'on' : 'off');
  } catch {
    // Private mode, or storage full. The switch then lasts the session only,
    // which is the safe direction to fail in: it reverts to off.
  }
}

/**
 * Whether counting was turned off altogether. Read at each visit rather than
 * once, because the app shares the key and either half may have just flipped it.
 */
export function isCountingSkipped(): boolean {
  try {
    return localStorage.getItem(SKIP_KEY) === 't';
  } catch {
    return false;
  }
}

/**
 * Flip the opt-out, and report where it landed.
 *
 * The "on" state is the key's absence and not an `'f'`, which is GoatCounter's
 * way round and the right one: a browser that never used the toggle then reads
 * the same as one that turned counting back on.
 */
export function toggleCountingSkip(): boolean {
  const wasSkipped = isCountingSkipped();

  try {
    if (wasSkipped) localStorage.removeItem(SKIP_KEY);
    else localStorage.setItem(SKIP_KEY, 't');
  } catch {
    // Nothing was written, so nothing changed — say so rather than claim a flip
    // the next visit would not honour.
    return wasSkipped;
  }

  return !wasSkipped;
}

/**
 * A browser-level refusal, which overrides the switch.
 *
 * Do Not Track is the old signal and Global Privacy Control the one with legal
 * teeth (it is a recognised opt-out under several US state laws). Either one is
 * a no, and honouring it costs nothing — the extra statistics are a nicety.
 */
export function isRefusedByBrowser(): boolean {
  // Both are read off a cast rather than off `navigator` directly: GPC is too
  // new to be in lib.dom, and `doNotTrack` is deprecated enough to have left it.
  const nav = navigator as {
    globalPrivacyControl?: boolean;
    doNotTrack?: string | null;
  };

  return nav.globalPrivacyControl === true || nav.doNotTrack === '1';
}
