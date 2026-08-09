// Nav destinations — Epic 13
// Spec: PRD-UI-SHELL.md §4; apps/docs/docs/basics.mdx

import type { IconName } from '../../primitives';

export interface NavItem {
  readonly id: string;
  readonly icon: IconName;
  readonly label: string;
  readonly route: string;
  /**
   * The second press of this destination's leader chord — `g` then this
   * (ADR-0015). A physical key position, so it survives a layout change; the
   * letter names the destination wherever one is free, and Settings takes `,`
   * because Songs already has the S.
   */
  readonly key: string;
}

/**
 * The four nav modules, in `basics.mdx` order.
 *
 * Settings is deliberately **not** here — it is pinned to the bottom of the rail
 * as its own group (§4): a destination, not a peer.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    id: 'songs',
    icon: 'songs',
    label: $localize`:@@nav.songs:Songs`,
    route: '/songs',
    key: 'KeyS',
  },
  {
    id: 'songbooks',
    icon: 'songbooks',
    label: $localize`:@@nav.songbooks:Songbooks`,
    route: '/songbooks',
    key: 'KeyB',
  },
  {
    id: 'stage',
    icon: 'stage',
    label: $localize`:@@nav.stage:Stage`,
    route: '/stage',
    key: 'KeyT',
  },
  {
    id: 'audience',
    icon: 'audience',
    label: $localize`:@@nav.audience:Audience`,
    route: '/audience',
    key: 'KeyA',
  },
];

export const NAV_SETTINGS: NavItem = {
  id: 'settings',
  icon: 'settings',
  label: $localize`:@@nav.settings:Settings`,
  route: '/settings',
  key: ',',
};

export const ALL_NAV_ITEMS: readonly NavItem[] = [...NAV_ITEMS, NAV_SETTINGS];
