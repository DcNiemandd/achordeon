// Nav destinations — Epic 13
// Spec: PRD-UI-SHELL.md §4; apps/docs/docs/basics.mdx

import type { IconName } from '../../primitives';

export interface NavItem {
  readonly id: string;
  readonly icon: IconName;
  readonly label: string;
  readonly route: string;
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
  },
  {
    id: 'songbooks',
    icon: 'songbooks',
    label: $localize`:@@nav.songbooks:Songbooks`,
    route: '/songbooks',
  },
  {
    id: 'stage',
    icon: 'stage',
    label: $localize`:@@nav.stage:Stage`,
    route: '/stage',
  },
  {
    id: 'audience',
    icon: 'audience',
    label: $localize`:@@nav.audience:Audience`,
    route: '/audience',
  },
];

export const NAV_SETTINGS: NavItem = {
  id: 'settings',
  icon: 'settings',
  label: $localize`:@@nav.settings:Settings`,
  route: '/settings',
};

export const ALL_NAV_ITEMS: readonly NavItem[] = [...NAV_ITEMS, NAV_SETTINGS];
