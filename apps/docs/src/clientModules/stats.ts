import siteConfig from '@generated/docusaurus.config';

import { countVisit } from '../lib/stats-beacon';
import { toggleCountingSkip } from '../lib/stats-consent';

/**
 * Counts a page view after every route change (docs/privacy.mdx).
 *
 * A client module and not a `headTags` script, because Docusaurus is a SPA: the
 * first load is the only one a tag in `<head>` would see, and every link after
 * that is a client-side navigation. `onRouteDidUpdate` fires for all of them,
 * the first included.
 *
 * The endpoint comes off `customFields` — the same route `appLink` takes — so
 * `GOATCOUNTER_URL` is read once, in the config, and the deploy stays the only
 * place a URL is written down. Unset means the field is '' and nothing is sent.
 */
export function onRouteDidUpdate({ location }: { location: Location }): void {
  honourToggleHash(location.hash);

  const endpoint = (siteConfig.customFields?.goatcounterUrl as string) ?? '';

  countVisit(endpoint, location.pathname);
}

/** Whether the hash has already been read, which it may be only once per load. */
let hasReadHash = false;

/**
 * `#toggle-goatcounter` turns counting off, and the same address again turns it
 * back on — GoatCounter's documented switch, transplanted because none of their
 * script runs here to offer it.
 *
 * Read once per page load, as their `count.js` reads it: the hash survives a
 * client-side navigation, and a second reading of the same one would undo the
 * first. Not at module scope, though — this module is evaluated during the
 * pre-render too, where there is no `location`.
 *
 * Before the count, so the visit that turned counting off is not itself counted,
 * and the one that turned it back on is. Where GoatCounter alerts, this logs:
 * the switch is for us, not for readers, and a dialog on a docs page would
 * announce a mechanism nothing else here mentions — which is also why the string
 * is not translated.
 */
function honourToggleHash(hash: string): void {
  if (hasReadHash) return;
  hasReadHash = true;

  if (hash !== '#toggle-goatcounter') return;

  const state = toggleCountingSkip() ? 'off' : 'on';

  console.info(`[goatcounter] Visit counting is now ${state} in this browser.`);
}
