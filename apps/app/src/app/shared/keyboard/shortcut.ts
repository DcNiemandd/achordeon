// Keyboard shortcuts — what a screen declares
// Spec: docs/adr/0015-keyboard-shortcuts-avoid-the-browsers-key-space.md;
//       CONTEXT.md §Keyboard shortcut

import type { Signal } from '@angular/core';
import type { PressScope, ShortcutKey } from './key-press';

/**
 * An action, declared once.
 *
 * The toolbar renders from it, the keymap binds to it and the shortcuts dialog
 * lists it, so a key can never disagree with a greyed-out button — and adding a
 * button without an action makes it invisible to both (ADR-0015). A feature is
 * free to widen this with whatever its bar needs to draw (an icon, a glyph, a
 * test id); the registry reads only what is here.
 */
export interface ShortcutAction {
  /** Unique within its layer. Also what the dialog tracks the row by. */
  readonly id: string;
  /** The accessible name of the button, and the dialog's description. */
  readonly label: string;
  /**
   * The presses that run it, first one first — `Alt+KeyC`, `?`, `KeyG KeyS`.
   * More than one because `?` is a character you may be in the middle of
   * typing, and then `Alt+/` is the same action reached from inside the text.
   */
  readonly keys: readonly ShortcutKey[];
  /**
   * Greyed out: the key is claimed and does nothing, rather than falling
   * through to whatever else wanted it. A disabled button that silently ran
   * someone else's action would be worse than a dead key.
   */
  readonly isDisabled?: boolean;
  /** Overrides what the keys imply about where they may fire. */
  readonly scope?: PressScope;
  /** Kept out of the shortcuts dialog — the dialog's own Escape, and the like. */
  readonly isHidden?: boolean;
  /**
   * Listed, never bound: somebody else already owns the key and we are only
   * telling the user about it. Undo and redo are CodeMirror's own (ADR-0010),
   * and they match the character produced rather than the position — which is
   * the one thing a Czech QWERTZ moves, so rebinding them by position would put
   * undo under the wrong finger.
   */
  readonly isUnbound?: boolean;
  readonly run: () => void;
}

/**
 * One screen's or one dialog's worth of shortcuts, pushed onto the stack while
 * it is mounted.
 *
 * The topmost layer holding a key runs it. Escape therefore stops being
 * special: the settings dialog's Escape wins over the editor's because the
 * dialog is on top, which is what the hand-written "is the dialog open?" guards
 * used to say by hand.
 */
export interface ShortcutLayer {
  /** Groups the layer's actions in the dialog: "Editor", "Stage", "Anywhere". */
  readonly name: string;
  /** A signal, so enablement follows the caret without re-registering. */
  readonly actions: Signal<readonly ShortcutAction[]>;
  /**
   * A dialog: the layers beneath it never see the press at all. Without this a
   * key the dialog does not use would reach the screen behind it and act on
   * something the user cannot currently see.
   *
   * A signal where the panel is drawn by the screen it covers rather than by a
   * component of its own — the stage summary, the editor's settings — so the
   * layer goes up once and shadows only while the panel is open.
   */
  readonly isBlocking?: Signal<boolean> | boolean;
}
