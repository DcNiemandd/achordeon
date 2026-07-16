// Shell chrome contract — Epic 13
// Spec: PRD-UI-SHELL.md §4 (chrome-less routes)

import type { Route } from '@angular/router';

/**
 * How much frame a route wants.
 *
 * `'none'` strips the rail and the bars entirely: a performer mid-song sees the
 * song and nothing else (`apps/docs/docs/stage-audience/index.mdx`), and the
 * Audience deep-link is the same. The feature opts out **declaratively via route
 * data** so the shell never has to know *why* — no route list to keep in sync,
 * no `if (url.startsWith('/stage'))` creeping into the frame.
 */
export type Chrome = 'full' | 'none';

export interface ShellRouteData {
  readonly chrome?: Chrome;
}

/** Reads the flag off a route's data, defaulting to a full frame. */
export function chromeOf(data: Route['data']): Chrome {
  return (data as ShellRouteData | undefined)?.chrome ?? 'full';
}
