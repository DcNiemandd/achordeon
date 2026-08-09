// Keyboard shortcuts — the press, written down and read back
// Spec: docs/adr/0015-keyboard-shortcuts-avoid-the-browsers-key-space.md;
//       CONTEXT.md §Keyboard shortcut

/**
 * Where a press is allowed to fire, relative to text being typed.
 *
 * - `always` — the key produces no character anywhere, so nothing it could
 *   interrupt. Escape and the function keys.
 * - `outside-fields` — the modifier tier. Blocked in an `<input>`/`<textarea>`
 *   and nowhere else: the song's content is a contenteditable, and acting on
 *   the content under the caret is the entire point of these keys
 *   (`song-editor.page.ts` established the rule, deliberately not treating the
 *   editor body as a text field).
 * - `outside-text` — the bare tier. Also dead inside a contenteditable, or
 *   typing the letters of a lyric would navigate away.
 */
export type PressScope = 'always' | 'outside-fields' | 'outside-text';

/** One press of one key, parsed out of its written form. */
export interface KeyPress {
  readonly isAlt: boolean;
  readonly isCtrl: boolean;
  readonly isMeta: boolean;
  /** `null` when the token is a character that already implies its own shift. */
  readonly isShift: boolean | null;
  /** Either a `KeyboardEvent.code` or, when one character long, a `key`. */
  readonly token: string;
  readonly isChar: boolean;
  readonly scope: PressScope;
}

/**
 * How a shortcut is written: modifiers joined by `+`, then the key, and a space
 * between the two presses of a leader chord — `Alt+KeyC`, `Escape`, `?`,
 * `KeyG KeyS`.
 *
 * **A token longer than one character is a physical key position**
 * (`KeyboardEvent.code`), which is what makes `Alt`+the C key fire on a Mac,
 * where that press produces `ç`, and on a Czech layout, where it produces a C
 * from a different key than a Dvorak one does. **A token exactly one character
 * long is that character** (`KeyboardEvent.key`) — `?`, `+`, `0` are keys the
 * user knows by their glyph, not by where they sit, and their position moves
 * from layout to layout while the glyph does not.
 */
export type ShortcutKey = string;

const MODIFIERS = new Set(['alt', 'ctrl', 'shift', 'meta']);

/** Parsing the same handful of strings on every keystroke, so: parse once. */
const parsed = new Map<ShortcutKey, readonly KeyPress[]>();

/** The presses of one written shortcut, in the order they must arrive. */
export function parseShortcut(key: ShortcutKey): readonly KeyPress[] {
  const hit = parsed.get(key);
  if (hit) return hit;
  const chord = key
    .split(' ')
    .filter((part) => part !== '')
    .map(parsePress);
  parsed.set(key, chord);
  return chord;
}

function parsePress(spec: string): KeyPress {
  const parts = spec.split('+');
  // `+` is itself a key (Stage zooms in with it), and splitting on it leaves an
  // empty tail where the token should be. An empty tail means the token was the
  // separator, so take it back — and with it the empty segment it left behind.
  let token = parts.pop() ?? '';
  if (token === '') {
    token = '+';
    parts.pop();
  }
  const held = new Set(
    parts
      .map((part) => part.toLowerCase())
      .filter((part) => MODIFIERS.has(part)),
  );
  const isChar = token.length === 1;
  const isAlt = held.has('alt');
  const isCtrl = held.has('ctrl');
  const isMeta = held.has('meta');
  return {
    isAlt,
    isCtrl,
    isMeta,
    // A character carries its own shift: `?` is Shift+/ on one layout and an
    // unshifted key on another, and neither spelling is the shortcut's business.
    isShift: isChar && !held.has('shift') ? null : held.has('shift'),
    token,
    isChar,
    scope:
      token === 'Escape' || /^F\d+$/.test(token)
        ? 'always'
        : isAlt || isCtrl || isMeta
          ? 'outside-fields'
          : 'outside-text',
  };
}

/**
 * Does this event *is* this press?
 *
 * The modifier comparison is exact, and that is what keeps a Czech layout
 * usable: AltGr arrives as `ctrlKey && altKey`, which is how `[` and `]` are
 * typed — the very characters a song's content is made of. An `Alt+…` shortcut
 * that merely checked `altKey` would fire on every bracket.
 */
export function matchesPress(press: KeyPress, event: KeyboardEvent): boolean {
  if (
    press.isAlt !== event.altKey ||
    press.isCtrl !== event.ctrlKey ||
    press.isMeta !== event.metaKey ||
    (press.isShift !== null && press.isShift !== event.shiftKey)
  ) {
    return false;
  }
  return press.isChar ? event.key === press.token : event.code === press.token;
}

/** The strictest scope in a chord: a leader is only as free as its second key. */
export function chordScope(chord: readonly KeyPress[]): PressScope {
  let scope: PressScope = 'always';
  for (const press of chord) {
    if (press.scope === 'outside-text') return 'outside-text';
    if (press.scope === 'outside-fields') scope = 'outside-fields';
  }
  return scope;
}

/**
 * Is the press aimed at something the user is writing into?
 *
 * Reads the event's **target**, not `document.activeElement`: a field that blurs
 * itself on Escape has already handed focus back to `<body>` by the time this
 * runs, and its Escape would then look exactly like a bare one.
 */
export function isBlocked(
  scope: PressScope,
  target: EventTarget | null,
): boolean {
  if (scope === 'always') return false;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return true;
  }
  return (
    scope === 'outside-text' &&
    target instanceof HTMLElement &&
    target.isContentEditable
  );
}

/** What Enter and Space press when they are pressed at something focusable. */
const ACTIVATABLE =
  'button, a[href], summary, [role="button"], [role="menuitem"], [role="option"], [role="tab"], [role="checkbox"], [role="switch"]';

/**
 * Would this press activate the control that has focus?
 *
 * Enter and Space are how a keyboard clicks, so on a focused button they are
 * the browser's before they are ours. Without this, Enter on the "Delete" of a
 * confirmation would answer the dialog *and* open whatever the list behind it
 * had current — a shortcut firing at a screen the user cannot see. Only the
 * bare pair: `Alt+Enter` presses nothing.
 */
export function stealsActivation(
  press: KeyPress,
  target: EventTarget | null,
): boolean {
  if (press.isAlt || press.isCtrl || press.isMeta) return false;
  if (press.token !== 'Enter' && press.token !== 'Space') return false;
  return target instanceof Element && target.closest(ACTIVATABLE) !== null;
}

/** Arrows are drawn, not spelled — `ArrowUp` on a key cap is an arrow. */
const GLYPHS: Readonly<Record<string, string>> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Escape: 'Esc',
  Delete: 'Del',
  Enter: '↵',
  Space: 'Space',
  Tab: 'Tab',
};

/**
 * What to print on a key cap in the shortcuts dialog.
 *
 * A shortcut is bound to a position, so the honest label is whatever that
 * position is engraved with on *this* keyboard — `labels` comes from
 * `navigator.keyboard.getLayoutMap()`. Where the browser will not say (Safari,
 * Firefox), the English letter is the fallback: wrong for a minority of layouts,
 * and the alternative is printing `KeyC`.
 */
export function describePress(
  press: KeyPress,
  labels?: ReadonlyMap<string, string>,
): readonly string[] {
  const caps: string[] = [];
  if (press.isCtrl) caps.push('Ctrl');
  if (press.isAlt) caps.push('Alt');
  if (press.isMeta) caps.push('Meta');
  if (press.isShift === true) caps.push('Shift');
  caps.push(describeToken(press, labels));
  return caps;
}

/** Every press of a written shortcut, each as the caps it is made of. */
export function describeShortcut(
  key: ShortcutKey,
  labels?: ReadonlyMap<string, string>,
): readonly (readonly string[])[] {
  return parseShortcut(key).map((press) => describePress(press, labels));
}

/**
 * The same thing in `aria-keyshortcuts`' spelling, for the button the shortcut
 * also runs — so a screen reader announces the key with the action rather than
 * only in a dialog the user has to know to open.
 */
export function ariaKeyShortcuts(
  key: ShortcutKey,
  labels?: ReadonlyMap<string, string>,
): string {
  return describeShortcut(key, labels)
    .map((caps) => caps.join('+'))
    .join(' ');
}

function describeToken(
  press: KeyPress,
  labels?: ReadonlyMap<string, string>,
): string {
  // A letter typed as a character rather than bound to a position — undo's
  // `Ctrl+z`, which is CodeMirror's and matches the glyph. Key caps are printed
  // in capitals; the key is not shifted.
  if (press.isChar)
    return /^[a-z]$/.test(press.token)
      ? press.token.toUpperCase()
      : press.token;
  const glyph = GLYPHS[press.token];
  if (glyph !== undefined) return glyph;
  const engraved = labels?.get(press.token);
  if (engraved !== undefined && engraved !== '') return engraved.toUpperCase();
  const letter = /^Key([A-Z])$/.exec(press.token);
  if (letter) return letter[1];
  const digit = /^Digit(\d)$/.exec(press.token);
  if (digit) return digit[1];
  return press.token;
}
