// Keyboard shortcuts (ADR-0015). One declaration per action feeds the button,
// the key and the dialog; layers stack, and the top one holding a key runs it.

export { KeyboardLayout } from './keyboard-layout';
export { LeaderHint } from './leader-hint';
export { ShortcutsDialog } from './shortcuts-dialog';
export {
  ariaKeyShortcuts,
  chordScope,
  describePress,
  describeShortcut,
  isBlocked,
  matchesPress,
  parseShortcut,
  stealsActivation,
} from './key-press';
export type { KeyPress, PressScope, ShortcutKey } from './key-press';
export { shortcutHint, withKeyHint } from './key-hint';
export { registerShortcuts } from './register-shortcuts';
export { ShortcutRegistry } from './shortcut-registry';
export type { LeaderOption } from './shortcut-registry';
export type { ShortcutAction, ShortcutLayer } from './shortcut';
