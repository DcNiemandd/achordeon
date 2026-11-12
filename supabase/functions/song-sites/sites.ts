// The Song sites, by the number the app knows them by (ADR-0019, plan Q14).
//
// A number is never reused: an app that remembers site 1 must never be handed
// a different site under it. Dropping a site is deleting its line here.

import { plnyzpevnik } from './plnyzpevnik.ts';
import type { Site } from './site.ts';

export const SITES: ReadonlyMap<number, Site> = new Map([[1, plnyzpevnik]]);
