// Shell layout — the frame (PRD-UI-SHELL.md §4).
//
// Everything here imports primitives + @achordeon/shared/domain TYPES only.
// Never data-access: components do not inject stores, they bind to a feature
// presenter (§3). Enforced in apps/app/eslint.config.mjs.
//
// On the swap: this folder is what gets deleted. The presenters, the routes and
// the search-param contracts stay.

export { ActionBar } from './action-bar';
export { AppUpdate } from './app-update';
export type { UpdatePrompt } from './app-update';
export { UpdateNotice } from './update-notice';
export {
  LANGUAGES,
  Localization,
  SOURCE_LANGUAGE,
  chosenLanguage,
  docsPageUrl,
} from './localization';
export type { Language } from './localization';
export { TierGuard } from './tier-guard';
export type { PremiumFeature } from './tier-guard';
export { Fullscreen } from './fullscreen';
export { BackNavigation } from './back-navigation';
export { BlankPage } from './blank-page';
export { PageZoom } from './page-zoom';
export { gainsRoomTurned, toPageDelta, turnedDesk } from './turn';
export { turnPageActionLabel } from './turn-label';
export { ZoomPill } from './zoom-pill';
export { DocumentTitle } from './document-title';
export { ModuleSwitcher } from './module-switcher';
export { ReturnUrl } from './return-url';
export { ListScrollMemory } from './list-scroll-memory';
export type { ListScope } from './list-scroll-memory';
export { Rail } from './rail';
export { ScreenShape } from './screen-shape';
export { Shell } from './shell';
export { StageBar } from './stage-bar';
export { StageSession } from './stage-session';
export type { AudienceState } from './stage-session';
export { AudienceBar } from './audience-bar';
export { AudienceSession } from './audience-session';
export { TransposeStepper } from './transpose-stepper';
export {
  TRANSPOSE_LIMIT,
  formatSemitones,
  stepTranspose,
  transposeActionLabel,
} from './transpose';
export { SplitPane } from './split-pane';
export { Stats } from './stats';
export { ThemeApplier } from './theme-applier';
export { WarnUnsynced } from './warn-unsynced';
export { UiStore } from './ui-store';
export type { SplitScope } from './ui-store';
export { Viewport } from './viewport';
export { ALL_NAV_ITEMS, NAV_ITEMS, NAV_SETTINGS } from './nav-items';
export type { NavItem } from './nav-items';
