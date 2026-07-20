// Shell layout — the frame (PRD-UI-SHELL.md §4).
//
// Everything here imports primitives + @achordeon/shared/domain TYPES only.
// Never data-access: components do not inject stores, they bind to a feature
// presenter (§3). Enforced in apps/app/eslint.config.mjs.
//
// On the swap: this folder is what gets deleted. The presenters, the routes and
// the search-param contracts stay.

export { ActionBar } from './action-bar';
export { Fullscreen } from './fullscreen';
export { BackNavigation } from './back-navigation';
export { BlankPage } from './blank-page';
export { ModuleSwitcher } from './module-switcher';
export { Rail } from './rail';
export { Shell } from './shell';
export { SplitPane } from './split-pane';
export { ThemeApplier } from './theme-applier';
export { UiStore } from './ui-store';
export type { SplitScope } from './ui-store';
export { Viewport } from './viewport';
export { ALL_NAV_ITEMS, NAV_ITEMS, NAV_SETTINGS } from './nav-items';
export type { NavItem } from './nav-items';
