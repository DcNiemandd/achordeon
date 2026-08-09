// Keyboard shortcuts — the stack of layers, and the one document listener
// Spec: docs/adr/0015-keyboard-shortcuts-avoid-the-browsers-key-space.md;
//       CONTEXT.md §Keyboard shortcut

import { DOCUMENT } from '@angular/common';
import {
  DestroyRef,
  Injectable,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DialogStack } from '../../primitives';
import {
  type KeyPress,
  chordScope,
  isBlocked,
  matchesPress,
  parseShortcut,
  stealsActivation,
} from './key-press';
import type { ShortcutAction, ShortcutLayer } from './shortcut';

/**
 * How long the leader stays armed.
 *
 * Long enough to think, short enough that a chord abandoned mid-way does not
 * eat a keystroke a minute later. Escape disarms it early, and so does any key
 * that finishes nothing.
 */
const LEADER_WINDOW_MS = 1500;

/** One of the destinations an armed leader could still reach. */
export interface LeaderOption {
  readonly action: ShortcutAction;
  readonly press: KeyPress;
}

/**
 * Every shortcut in the app, as a stack of layers, and the single `keydown`
 * listener that feeds it.
 *
 * **The topmost layer holding a key runs it**, and a layer marked blocking
 * shadows everything beneath. That one rule replaces the hand-written guards
 * this app used to carry — Stage asking "is the summary open?" before every
 * key, the editor asking "is the settings dialog open?" before Escape. A dialog
 * no longer has to be known about by the screen it covers; it just registers on
 * top and takes what it needs.
 *
 * The listener is the service's own rather than a host binding on the shell,
 * because shortcuts outlive any one component and a root service nobody injects
 * is a service that never runs — the shell injects it for exactly that reason.
 */
@Injectable({ providedIn: 'root' })
export class ShortcutRegistry {
  private readonly document = inject(DOCUMENT);
  private readonly dialogs = inject(DialogStack);
  private readonly stack = signal<readonly ShortcutLayer[]>([]);
  private readonly armed = signal<KeyPress | null>(null);
  private disarmTimer: ReturnType<typeof setTimeout> | null = null;

  /** Topmost first — the order the shortcuts dialog groups them in. */
  readonly layers = computed(() => [...this.stack()].reverse());

  /** The half-pressed leader chord, or `null`. Something must show this. */
  readonly leader = this.armed.asReadonly();

  /**
   * What the armed leader could still become. An armed mode that eats the next
   * keystroke without saying what it is waiting for is worse than no shortcut,
   * so the indicator lists the ways out.
   */
  readonly leaderOptions = computed<readonly LeaderOption[]>(() => {
    const leader = this.armed();
    if (leader === null) return [];
    const options: LeaderOption[] = [];
    for (const layer of this.layers()) {
      for (const action of layer.actions()) {
        if (action.isDisabled || action.isUnbound) continue;
        for (const key of action.keys) {
          const chord = parseShortcut(key);
          if (chord.length === 2 && samePress(chord[0], leader)) {
            options.push({ action, press: chord[1] });
          }
        }
      }
      if (isBlocking(layer)) break;
    }
    return options;
  });

  constructor() {
    const onKeyDown = (event: KeyboardEvent): void => this.handle(event);
    this.document.addEventListener('keydown', onKeyDown);
    inject(DestroyRef).onDestroy(() => {
      this.document.removeEventListener('keydown', onKeyDown);
      this.disarm();
    });
  }

  /** While the layer's owner is mounted. Prefer `registerShortcuts`. */
  add(layer: ShortcutLayer): void {
    this.stack.update((layers) => [...layers, layer]);
  }

  remove(layer: ShortcutLayer): void {
    this.stack.update((layers) => layers.filter((one) => one !== layer));
    this.disarm();
  }

  handle(event: KeyboardEvent): void {
    // Somebody nearer the key already dealt with it — a field's own Enter, the
    // editor's Tab. Handling it again would be handling it twice.
    if (event.defaultPrevented) return;

    const leader = this.armed();
    if (leader !== null) {
      this.disarm();
      if (event.key === 'Escape') {
        event.preventDefault();
        return;
      }
      // Matched or not, the chord is over. A second key that completes nothing
      // is an abandoned chord, not the start of a fresh press — otherwise `g`
      // followed by a stray letter would fire that letter's own shortcut.
      this.dispatch(event, leader);
      return;
    }

    if (this.dispatch(event, null)) return;
    this.arm(event);
  }

  /**
   * Run the topmost action this press belongs to.
   *
   * Returns whether the press was *claimed*, which is not the same as run: a
   * blocking layer claims everything, and a greyed-out action claims its own key
   * and does nothing with it. A disabled button whose key quietly ran somebody
   * else's action is the disagreement the single action declaration exists to
   * prevent.
   *
   * A claim that runs nothing also leaves the key to the browser. Stage's
   * Escape is why: with nothing zoomed there is nothing to reset, and taking
   * the press anyway would trap a performer in fullscreen.
   */
  private dispatch(event: KeyboardEvent, leader: KeyPress | null): boolean {
    if (this.isSwallowedByDialog()) return true;
    const wanted = leader === null ? 1 : 2;
    for (const layer of this.layers()) {
      for (const action of layer.actions()) {
        if (action.isUnbound) continue;
        for (const key of action.keys) {
          const chord = parseShortcut(key);
          if (chord.length !== wanted) continue;
          if (leader !== null && !samePress(chord[0], leader)) continue;
          const press = chord[wanted - 1];
          if (!matchesPress(press, event)) continue;
          if (isBlocked(action.scope ?? chordScope(chord), event.target))
            continue;
          if (stealsActivation(press, event.target)) continue;
          if (action.isDisabled) return true;
          event.preventDefault();
          action.run();
          return true;
        }
      }
      if (isBlocking(layer)) return true;
    }
    return false;
  }

  /**
   * A dialog is up and no layer has claimed it.
   *
   * Most dialogs are a page's `@if` block with no shortcuts of their own, and a
   * bare key pressed over one would otherwise reach the screen it covers — `n`
   * over a delete confirmation making a song behind it. A dialog that *does*
   * want keys registers a blocking layer, and then this steps aside and the
   * ordinary stack walk stops at that layer instead.
   */
  private isSwallowedByDialog(): boolean {
    return this.dialogs.isOpen() && !this.layers().some(isBlocking);
  }

  /** Nothing ran; does the press at least start a chord? */
  private arm(event: KeyboardEvent): void {
    if (this.isSwallowedByDialog()) return;
    for (const layer of this.layers()) {
      for (const action of layer.actions()) {
        if (action.isDisabled || action.isUnbound) continue;
        for (const key of action.keys) {
          const chord = parseShortcut(key);
          if (chord.length < 2) continue;
          if (!matchesPress(chord[0], event)) continue;
          if (isBlocked(action.scope ?? chordScope(chord), event.target))
            continue;
          event.preventDefault();
          this.armed.set(chord[0]);
          this.disarmTimer = setTimeout(() => this.disarm(), LEADER_WINDOW_MS);
          return;
        }
      }
      if (isBlocking(layer)) return;
    }
  }

  private disarm(): void {
    if (this.disarmTimer !== null) {
      clearTimeout(this.disarmTimer);
      this.disarmTimer = null;
    }
    this.armed.set(null);
  }
}

function isBlocking(layer: ShortcutLayer): boolean {
  const flag = layer.isBlocking;
  return typeof flag === 'function' ? flag() : flag === true;
}

function samePress(a: KeyPress, b: KeyPress): boolean {
  return (
    a.token === b.token &&
    a.isChar === b.isChar &&
    a.isAlt === b.isAlt &&
    a.isCtrl === b.isCtrl &&
    a.isMeta === b.isMeta
  );
}
