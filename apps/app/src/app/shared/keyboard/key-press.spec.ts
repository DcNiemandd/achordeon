// Keyboard shortcuts — the press
// Spec: docs/adr/0015-keyboard-shortcuts-avoid-the-browsers-key-space.md

import {
  chordScope,
  describePress,
  isBlocked,
  matchesPress,
  parseShortcut,
} from './key-press';

/** Only the fields the matcher reads — a real KeyboardEvent needs a DOM. */
function press(
  init: Partial<KeyboardEvent> & { key: string; code?: string },
): KeyboardEvent {
  return {
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    code: '',
    ...init,
  } as KeyboardEvent;
}

describe('parseShortcut', () => {
  it('reads a multi-character token as a physical position', () => {
    const [only] = parseShortcut('Alt+KeyC');
    expect(only).toMatchObject({ token: 'KeyC', isChar: false, isAlt: true });
  });

  it('reads a one-character token as the character itself', () => {
    const [only] = parseShortcut('?');
    expect(only).toMatchObject({ token: '?', isChar: true });
  });

  // Stage zooms in with `+`, and `+` is also the separator.
  it('survives the separator being the key', () => {
    expect(parseShortcut('+')[0]).toMatchObject({ token: '+', isChar: true });
    expect(parseShortcut('Alt++')[0]).toMatchObject({
      token: '+',
      isAlt: true,
    });
  });

  it('reads a leader chord as two presses', () => {
    const chord = parseShortcut('KeyG KeyS');
    expect(chord).toHaveLength(2);
    expect(chord[1].token).toBe('KeyS');
  });
});

describe('matchesPress', () => {
  it('fires on the position, whatever character it produced', () => {
    // macOS turns Alt+C into `ç`; the position is still KeyC.
    const [chord] = parseShortcut('Alt+KeyC');
    expect(
      matchesPress(chord, press({ key: 'ç', code: 'KeyC', altKey: true })),
    ).toBe(true);
  });

  // The reason `Ctrl` is unused: on a Czech layout AltGr *is* ctrl+alt, and it
  // is how `[` — the character a chord is made of — gets typed.
  it('does not fire on AltGr', () => {
    const [chord] = parseShortcut('Alt+KeyC');
    expect(
      matchesPress(
        chord,
        press({ key: '[', code: 'KeyC', altKey: true, ctrlKey: true }),
      ),
    ).toBe(false);
  });

  it('ignores shift for a character, which already carries its own', () => {
    const [chord] = parseShortcut('?');
    expect(matchesPress(chord, press({ key: '?', shiftKey: true }))).toBe(true);
    expect(matchesPress(chord, press({ key: '?', shiftKey: false }))).toBe(
      true,
    );
  });

  it('holds shift to an exact match on a position', () => {
    const [chord] = parseShortcut('Tab');
    expect(matchesPress(chord, press({ key: 'Tab', code: 'Tab' }))).toBe(true);
    expect(
      matchesPress(chord, press({ key: 'Tab', code: 'Tab', shiftKey: true })),
    ).toBe(false);
  });
});

describe('scope', () => {
  it('lets Escape through anywhere — it types nothing', () => {
    expect(chordScope(parseShortcut('Escape'))).toBe('always');
  });

  it('keeps the modifier tier alive while writing', () => {
    expect(chordScope(parseShortcut('Alt+KeyC'))).toBe('outside-fields');
  });

  it('kills the bare tier wherever text is', () => {
    expect(chordScope(parseShortcut('KeyG KeyS'))).toBe('outside-text');
  });
});

describe('isBlocked', () => {
  it('leaves a text field its own bare keys', () => {
    expect(isBlocked('outside-text', document.createElement('input'))).toBe(
      true,
    );
    expect(
      isBlocked('outside-fields', document.createElement('textarea')),
    ).toBe(true);
  });

  // The editor body is a contenteditable, and Alt+C acting on the content under
  // the caret is the entire point of the modifier tier.
  it('lets the modifier tier into the song content, and not the bare tier', () => {
    const body = document.createElement('div');
    // jsdom parses `contenteditable` but never computes `isContentEditable`.
    Object.defineProperty(body, 'isContentEditable', { value: true });

    expect(isBlocked('outside-fields', body)).toBe(false);
    expect(isBlocked('outside-text', body)).toBe(true);
  });

  it('never blocks Escape', () => {
    expect(isBlocked('always', document.createElement('input'))).toBe(false);
  });
});

describe('describePress', () => {
  it('prints what the key is engraved with, not where it sits', () => {
    const [chord] = parseShortcut('Alt+KeyY');
    // Czech QWERTZ: the Y position carries a Z.
    expect(describePress(chord, new Map([['KeyY', 'z']]))).toEqual([
      'Alt',
      'Z',
    ]);
  });

  it('falls back to the English letter where the browser will not say', () => {
    expect(describePress(parseShortcut('Alt+KeyC')[0])).toEqual(['Alt', 'C']);
  });

  it('draws the arrows', () => {
    expect(describePress(parseShortcut('ArrowLeft')[0])).toEqual(['←']);
  });
});
