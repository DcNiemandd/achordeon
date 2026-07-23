// Epic 9 — PIN allocation (ADR-0003)

import {
  LOBBY_PIN_ALPHABET,
  LOBBY_PIN_LENGTH,
  generateLobbyPin,
} from './lobby';

describe('generateLobbyPin', () => {
  it('is LOBBY_PIN_LENGTH characters', () => {
    expect(generateLobbyPin()).toHaveLength(LOBBY_PIN_LENGTH);
  });

  it('draws only from the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) {
      for (const ch of generateLobbyPin()) {
        expect(LOBBY_PIN_ALPHABET).toContain(ch);
      }
    }
  });

  it('excludes the ambiguous glyphs 0/O/1/I/L', () => {
    for (const ch of '0O1IL') {
      expect(LOBBY_PIN_ALPHABET).not.toContain(ch);
    }
  });

  it('maps the injected random deterministically', () => {
    // random() === 0 → first alphabet char, for every position.
    expect(generateLobbyPin(() => 0)).toBe(
      LOBBY_PIN_ALPHABET[0].repeat(LOBBY_PIN_LENGTH),
    );
    // random() just under 1 → last char.
    const last = LOBBY_PIN_ALPHABET[LOBBY_PIN_ALPHABET.length - 1];
    expect(generateLobbyPin(() => 0.999999)).toBe(
      last.repeat(LOBBY_PIN_LENGTH),
    );
  });
});
