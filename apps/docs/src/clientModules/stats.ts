import siteConfig from '@generated/docusaurus.config';

import { countVisit } from '../lib/stats-beacon';

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
  const endpoint = (siteConfig.customFields?.goatcounterUrl as string) ?? '';

  countVisit(endpoint, location.pathname);
}
