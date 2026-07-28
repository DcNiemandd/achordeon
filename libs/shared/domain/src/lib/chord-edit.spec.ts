import { cycleChordAt } from './chord-edit';

describe('cycleChordAt — the Chord button’s second and third states', () => {
  it('doubles the brackets of the chord the caret is in', () => {
    expect(cycleChordAt('la [C]la', 4)).toEqual({
      content: 'la [[C]]la',
      caret: 5,
    });
  });

  it('takes both brackets off an inline group', () => {
    expect(cycleChordAt('la [[C]]la', 5)).toEqual({
      content: 'la Cla',
      caret: 3,
    });
  });

  it('rounds a full cycle back to the text it started from', () => {
    const one = cycleChordAt('la [C]la', 4);
    const two = cycleChordAt(one?.content as string, one?.caret as number);
    expect(two?.content).toBe('la Cla');
    expect(
      cycleChordAt(two?.content as string, two?.caret as number),
    ).toBeNull();
  });

  it('keeps every other chord and the surrounding text untouched', () => {
    expect(cycleChordAt('[C]a [G]b', 6)?.content).toBe('[C]a [[G]]b');
    expect(cycleChordAt('Intro: [Am F G]', 9)?.content).toBe(
      'Intro: [[Am F G]]',
    );
  });

  it('returns null when the caret is in no bracket', () => {
    expect(cycleChordAt('lala', 2)).toBeNull();
    expect(cycleChordAt('[C]', 0)).toBeNull(); // on the [ — not yet inside
    expect(cycleChordAt('[C]', 3)).toBeNull(); // past the ] — no longer inside
    expect(cycleChordAt('a\\[C]b', 4)).toBeNull(); // an escaped bracket is text
    expect(cycleChordAt('[C', 2)).toBeNull(); // unterminated
  });
});
