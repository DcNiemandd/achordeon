// Primitives — the floor of the import ladder (PRD-UI-SHELL.md §3).
//
// Everything here imports node_modules ONLY: no domain types, no stores, no
// features. A primitive knows about Angular, Aria and the CDK and nothing about
// Achordeon — it could be lifted into an unrelated app unchanged. That rule is
// enforced in apps/app/eslint.config.mjs, not just asserted here.

export { Button } from './button/button';
export { EmptyState } from './empty-state/empty-state';
export { Icon } from './icon/icon';
export { Tooltip, TooltipPanel } from './tooltip/tooltip';
export type { IconName } from './icon/icon-set.generated';
