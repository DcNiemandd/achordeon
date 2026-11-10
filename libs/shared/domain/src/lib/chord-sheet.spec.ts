import {
  convertChordSheet,
  germanChordsToEnglish,
  toChordPro,
  type ChordSheetChoices,
  type ConvertedChordSheet,
} from './chord-sheet';
import { FakeChordTheory } from './fake-chord-theory.fake';

const theory = new FakeChordTheory();

function converted(
  text: string,
  choices: ChordSheetChoices = {},
): ConvertedChordSheet {
  const result = convertChordSheet(text, theory, choices);
  if (result.kind !== 'converted') {
    throw new Error('expected a chord sheet');
  }
  return result;
}

/** One song's draft, the format forced so detection stays out of the way. */
function draft(text: string, choices: ChordSheetChoices = {}) {
  return converted(text, { format: 'chord-rows', ...choices }).songs[0];
}

describe('chord rows folded into the words below', () => {
  it('places each chord over the character it sat above', () => {
    expect(
      draft(['Am        F         C', 'Some words of a song'].join('\n'))
        .content,
    ).toBe('[Am]Some words[F] of a song[C]\n');
  });

  it('hangs a chord past the end of the words at the end', () => {
    const song = draft(['C         G', 'Short line'].join('\n'));
    expect(song.content).toBe('[C]Short line[G]\n');
    expect(song.report.clamped).toBe(1);
  });

  it('writes chords clamped to the same spot as one bracket', () => {
    expect(draft(['     C  G', 'Yo'].join('\n')).content).toBe('Yo[C G]\n');
  });

  it('turns a chord row with no words under it into a bracket line', () => {
    const song = draft(['Am F C G', '', 'Some words'].join('\n'));
    expect(song.content).toBe('[Am F C G]\n\nSome words\n');
    expect(song.report.bareRows).toBe(1);
  });

  it('does not read a row of bar lines alone as chords', () => {
    expect(draft(['| | : |', 'Words below'].join('\n')).content).toBe(
      '| | : |\nWords below\n',
    );
  });

  it('never splices a chord into a label or before the first word', () => {
    const song = draft(['Am', 'Verse: the words'].join('\n'));
    expect(song.content).toBe('Verse:[Am] the words\n');
    expect(song.report.clamped).toBe(1);
  });

  it('leaves a tablature row alone', () => {
    expect(draft(['Am', 'e|--1---3--|'].join('\n')).content).toBe(
      '[Am]\ne|--1---3--|\n',
    );
  });

  it('carries an annotation row along with the chords', () => {
    expect(
      draft(['Am    x2    N.C.', 'Words and more words'].join('\n')).content,
    ).toBe('[Am]Words [x2]and mo[N.C.]re words\n');
  });
});

describe('a line that already carries brackets', () => {
  it('is left exactly as it was', () => {
    const song = draft('[Am]Already inline\n');
    expect(song.content).toBe('[Am]Already inline\n');
    expect(song.report.alreadyInline).toBe(1);
    expect(song.report.merged).toBe(0);
  });

  it('is still a merge target, with columns counted as printed', () => {
    const song = draft(['C         G', 'Some words[x2] more'].join('\n'));
    expect(song.content).toBe('[C]Some words[x2][G] more\n');
    expect(song.report.inlineTargets).toBe(1);
  });
});

describe('the one-letter row', () => {
  it('is read as a chord where the sheet proves the layout', () => {
    const song = draft(
      ['Am        F', 'Some words of a song', 'C', 'Then more words'].join(
        '\n',
      ),
    );
    expect(song.content).toBe(
      '[Am]Some words[F] of a song\n[C]Then more words\n',
    );
    expect(song.report.promoted).toBe(1);
  });

  it('is left alone, and numbered, where nothing settles it', () => {
    const song = draft(['F', 'nějaká slova'].join('\n'));
    expect(song.content).toBe('F\nnějaká slova\n');
    expect(song.report.ambiguous).toEqual([1]);
    expect(song.report.confirmed).toBe(0);
  });
});

describe('whitespace and encoding', () => {
  it('expands tabs before aligning, at the width asked for', () => {
    const song = draft(['C\tG', 'Some words here'].join('\n'), {
      tabWidth: 4,
    });
    expect(song.content).toBe('[C]Some[G] words here\n');
    expect(song.report.tabbedLines).toBe(1);
  });

  it('normalises CRLF and says so', () => {
    const song = draft('Words\r\nMore\r\n');
    expect(song.content).toBe('Words\nMore\n');
    expect(song.report.wasCrlf).toBe(true);
  });

  it('drops a byte-order mark', () => {
    expect(draft('﻿Words\n').content).toBe('Words\n');
  });

  it('always ends with a newline', () => {
    expect(draft('Words').content).toBe('Words\n');
  });

  it('refuses a tab width that is not a positive integer', () => {
    expect(() => draft('x', { tabWidth: 0 })).toThrow(RangeError);
  });
});

describe('telling a chord sheet from plain text', () => {
  const kind = (text: string) => convertChordSheet(text, theory).kind;
  const format = (text: string) => converted(text).format;

  it('says plain lyrics are not a chord sheet', () => {
    expect(kind('Some words\nAnd more words\n')).toBe('not-a-chord-sheet');
  });

  it('finds chord rows when two of them sit above words', () => {
    expect(
      format(['Am     F', 'Some words', 'C      G', 'More words'].join('\n')),
    ).toBe('chord-rows');
  });

  it('wants more than one chord row before it calls it a sheet', () => {
    expect(kind(['Am     F', 'Some words', 'More words'].join('\n'))).toBe(
      'not-a-chord-sheet',
    );
  });

  it('finds ChordPro from a single directive it knows', () => {
    expect(format('{title: Song}\n[Am]Words\n')).toBe('chordpro');
  });

  it('does not take a brace it does not know for ChordPro', () => {
    expect(kind('{not a directive}\nWords\n')).toBe('not-a-chord-sheet');
  });

  it('leaves text already written in Achordeon markup alone', () => {
    expect(kind('[Am]Some words[F] of a song\n')).toBe('not-a-chord-sheet');
  });

  it('converts as the format it is told, without detecting', () => {
    expect(
      convertChordSheet(['Am', 'Words'].join('\n'), theory, {
        format: 'chord-rows',
      }).kind,
    ).toBe('converted');
  });
});

describe('ChordPro metadata', () => {
  const song = (lines: string[], choices: ChordSheetChoices = {}) =>
    converted(lines.join('\n'), choices).songs[0];

  it('turns title and artist into * and ** and names the song after both', () => {
    const s = song([
      '{title: Wild Mountain Thyme}',
      '{artist: Traditional}',
      'Words',
    ]);
    expect(s.content).toBe('* Wild Mountain Thyme\n** Traditional\nWords\n');
    expect(s.name).toBe('Wild Mountain Thyme – Traditional');
    expect(s.report.directives.converted).toBe(2);
  });

  it('reads the short forms as the same directives', () => {
    expect(song(['{t:A}', '{st:B}']).content).toBe('* A\n** B\n');
  });

  it('prints a subtitle over the artist, but still names the song after the artist', () => {
    const s = song(['{t: A}', '{st: B}', '{artist: C}', 'Words']);
    expect(s.content).toBe('* A\n** B\nWords\n');
    expect(s.name).toBe('A – C');
  });

  it('puts key and capo on one plain line under the title', () => {
    expect(song(['{t: A}', '{key: G}', '{capo: 2}', 'Words']).content).toBe(
      '* A\nKey G, Capo 2\nWords\n',
    );
  });

  it('drops the rest of the metadata and names what it dropped', () => {
    const s = song(['{t: A}', '{album: X}', '{tempo: 90}', '{album: Y}', 'W']);
    expect(s.content).toBe('* A\nW\n');
    expect(s.report.directives.dropped).toEqual(['album', 'tempo']);
  });

  it('takes the title and artist it is given where the sheet has none', () => {
    const s = song(['{key: G}', 'Words'], { title: 'X', artist: 'Y' });
    expect(s.content).toBe('* X\n** Y\nKey G\nWords\n');
    expect(s.name).toBe('X – Y');
  });

  it('prefers the sheet’s own title to the one it is given', () => {
    expect(song(['{t: Own}', 'Words'], { title: 'Given' }).name).toBe('Own');
  });

  it('names nothing when nothing names the song', () => {
    expect(
      converted(['Am     F', 'Some words', 'C      G', 'More words'].join('\n'))
        .songs[0].name,
    ).toBeNull();
  });
});

describe('ChordPro sections', () => {
  const content = (lines: string[]) =>
    converted(lines.join('\n')).songs[0].content;

  it('turns a labelled section into a labelled block', () => {
    expect(
      content([
        '{start_of_verse: 1.}',
        'Line one',
        'Line two',
        '{end_of_verse}',
        '',
        '{start_of_chorus: R}',
        'Chorus line',
        '{end_of_chorus}',
      ]),
    ).toBe('1.: Line one\nLine two\n\nR: Chorus line\n');
  });

  it('separates an unlabelled section with a blank line', () => {
    expect(content(['Verse', '{soc}', 'Refrain', '{eoc}', 'Then'])).toBe(
      'Verse\n\nRefrain\n\nThen\n',
    );
  });

  it('labels the lines after a comment with it', () => {
    expect(content(['{c: Intro}', '[Am]Words'])).toBe('Intro: [Am]Words\n');
  });

  it('turns a comment with nothing under it into a label-only block', () => {
    expect(content(['{c: Solo}', '', '{c: Outro}', 'Words'])).toBe(
      'Solo:\n\nOutro: Words\n',
    );
  });

  it('turns a chorus reference into a block under the last chorus label', () => {
    expect(
      content([
        '{start_of_chorus: Ref}',
        'Words',
        '{end_of_chorus}',
        '{chorus}',
      ]),
    ).toBe('Ref: Words\n\nRef:\n');
  });

  it('keeps the text of a chorus reference as the block’s line', () => {
    expect(content(['{chorus: R: Ej, Macejko}'])).toBe('R: Ej, Macejko\n');
  });

  it('escapes what would otherwise read as a label or a title', () => {
    expect(content(['{t: A}', 'Narrator: hello', '*star'])).toBe(
      '* A\nNarrator\\: hello\n\\*star\n',
    );
  });

  it('still folds chord rows found in a ChordPro file', () => {
    expect(content(['{t: A}', 'Am     F', 'Some words'])).toBe(
      '* A\n[Am]Some wo[F]rds\n',
    );
  });
});

describe('the dialect', () => {
  const rows = (...pairs: [string, string][]) => pairs.flat().join('\n');

  it('guesses English where nothing says German', () => {
    expect(
      converted(rows(['Am     Bb', 'Some words'], ['C      G', 'More words']))
        .guessedDialect,
    ).toBe('english');
  });

  it('guesses German from an H among the chords', () => {
    expect(
      converted(rows(['Am     H7', 'Some words'], ['C      G', 'More words']))
        .guessedDialect,
    ).toBe('german');
  });

  it('guesses German from a mi minor in the brackets', () => {
    expect(converted('{t: A}\n[Ami]Words\n').guessedDialect).toBe('german');
  });

  it('applies the guess when no dialect is chosen', () => {
    const sheet = converted('{t: A}\n[Ami]Words\n');
    expect(sheet.dialect).toBe('german');
    expect(sheet.songs[0].content).toBe('* A\n[Am]Words\n');
  });

  it('rewrites German note names into English', () => {
    const sheet = converted(
      '{t: A}\n[B]a [H]b [Fis]c [Cis]d [Es]e [As]f [Hmi]g [Emi7]h [D/H]i\n',
      { dialect: 'german' },
    );
    expect(sheet.songs[0].content).toBe(
      '* A\n[Bb]a [B]b [F#]c [C#]d [Eb]e [Ab]f [Bm]g [Em7]h [D/B]i\n',
    );
    expect(sheet.songs[0].report.respelled).toBe(9);
  });

  it('leaves sus, maj and min alone', () => {
    expect(
      converted('{t: A}\n[Asus4]a [Cmaj7]b [Amin]c\n', { dialect: 'german' })
        .songs[0].content,
    ).toBe('* A\n[Asus4]a [Cmaj7]b [Amin]c\n');
  });

  it('rewrites the chords it folds from rows too', () => {
    expect(
      converted(
        rows(['Hmi    Fis', 'Some words'], ['C      G', 'More words']),
        {
          dialect: 'german',
        },
      ).songs[0].content,
    ).toBe('[Bm]Some wo[F#]rds\n[C]More wo[G]rds\n');
  });

  it('touches nothing when the person says English', () => {
    expect(
      converted('{t: A}\n[B]a [H]b\n', { dialect: 'english' }).songs[0].content,
    ).toBe('* A\n[B]a [H]b\n');
  });
});

describe('a sheet holding several songs', () => {
  const sheet = () =>
    converted(
      [
        '{t: One}',
        'Words',
        '{new_song}',
        '{t: Two}',
        'Other',
        '{ns}',
        '{t: Three}',
      ].join('\n'),
    );

  it('gives one draft per song', () => {
    expect(sheet().songs.map((s) => s.name)).toEqual(['One', 'Two', 'Three']);
  });

  it('keeps each song’s Content to itself', () => {
    expect(sheet().songs[1].content).toBe('* Two\nOther\n');
  });

  it('joins every song into one Content, a blank line apart', () => {
    expect(sheet().content).toBe('* One\nWords\n\n* Two\nOther\n\n* Three\n');
  });

  it('makes no draft out of an empty section', () => {
    expect(
      converted(['{new_song}', '{t: One}', '{ns}', '', '{ns}'].join('\n'))
        .songs,
    ).toHaveLength(1);
  });

  it('numbers lines left for a human within the song they are in', () => {
    const songs = converted(
      ['{t: One}', 'Words', '{ns}', '{t: Two}', 'F', 'slova'].join('\n'),
    ).songs;
    expect(songs[1].report.ambiguous).toEqual([2]);
  });
});

describe('ChordPro out', () => {
  const out = (...contents: string[]) =>
    toChordPro(
      contents.map((content) => ({ content })),
      theory,
    );

  it('writes title and subtitle as directives', () => {
    expect(out('* A\n** B\nWords\n')).toBe(
      '{title: A}\n{subtitle: B}\n\nWords\n',
    );
  });

  it('keeps chords inline where they sit', () => {
    expect(out('[Am]Some words[F] here\n')).toBe('[Am]Some words[F] here\n');
  });

  it('writes a chorus-like block as a chorus section', () => {
    expect(out('R: Chorus line\nAnother\n')).toBe(
      '{start_of_chorus: R}\nChorus line\nAnother\n{end_of_chorus}\n',
    );
  });

  it('writes any other label as a comment', () => {
    expect(out('1.: Verse line\n')).toBe('{comment: 1.}\nVerse line\n');
  });

  it('writes a chorus label with nothing under it as a chorus reference', () => {
    expect(out('Verse\n\nR:\n')).toBe('Verse\n\n{chorus: R}\n');
  });

  it('spells inline chords as one bracket each', () => {
    expect(out('[[Am F]]\n')).toBe('[Am] [F]\n');
  });

  it('writes the escaped characters as plain text', () => {
    expect(out('Narrator\\: hello\n')).toBe('Narrator: hello\n');
  });

  it('puts {new_song} between songs', () => {
    expect(out('* A\nOne\n', '* B\nTwo\n')).toBe(
      '{title: A}\n\nOne\n\n{new_song}\n{title: B}\n\nTwo\n',
    );
  });

  it('reads back as the Content it was written from', () => {
    const content = [
      '* A',
      '** B',
      '1.: [Am]Some words[F] here',
      'more [C]lines',
      '',
      'R: [G]Chorus',
      '',
      'Narrator\\: hello',
      '',
    ].join('\n');
    expect(converted(toChordPro([{ content }], theory)).content).toBe(content);
  });
});

describe('how a chord-rows sheet numbers and indents its verses', () => {
  it('turns a verse number into a label', () => {
    expect(draft(['   Am', '1. Some words'].join('\n')).content).toBe(
      '1.: [Am]Some words\n',
    );
  });

  it('drops the indent that lines the words up under the number', () => {
    expect(
      draft(['   Am', '1. Some words', '        F', '   more words'].join('\n'))
        .content,
    ).toBe('1.: [Am]Some words\nmore [F]words\n');
  });

  it('leaves a number that is part of the words alone', () => {
    expect(draft('1.5 litru vody\n').content).toBe('1.5 litru vody\n');
  });

  it('leaves the numbering of a ChordPro sheet as written', () => {
    expect(converted('{t: A}\n1. Words\n').songs[0].content).toBe(
      '* A\n1. Words\n',
    );
  });
});

describe('the report', () => {
  it('never carries a line of the song', () => {
    const { report } = draft(['C', 'A secret lyric'].join('\n'));
    expect(JSON.stringify(report)).not.toContain('secret');
  });
});

describe('German chords written in English', () => {
  const english = (content: string) => germanChordsToEnglish(content, theory);

  it('respells every German chord in the brackets', () => {
    expect(
      english('[B]a [H]b [Fis]c [Es]d [Hmi]e [Emi7]f [D/H]g [[As Cis]]h\n'),
    ).toBe('[Bb]a [B]b [F#]c [Eb]d [Bm]e [Em7]f [D/B]g [[Ab C#]]h\n');
  });

  it('leaves sus, maj and min alone', () => {
    expect(english('[Asus4]a [Cmaj7]b [Amin]c')).toBe(
      '[Asus4]a [Cmaj7]b [Amin]c',
    );
  });

  it('leaves what is not a chord alone', () => {
    expect(english('[Solo] [x2] [N.C.] words')).toBe(
      '[Solo] [x2] [N.C.] words',
    );
  });

  it('touches nothing outside the brackets, nor an escaped bracket', () => {
    expect(english('H and B \\[H] stay\n* Title [H]\nR: [H]x')).toBe(
      'H and B \\[H] stay\n* Title [H]\nR: [B]x',
    );
  });
});

describe('Achordeon’s own metadata in ChordPro', () => {
  const song = {
    content: '* A\nWords\n',
    name: 'A – B',
    settings: { columns: 2, chordColor: '#cc0000', aspectRatio: '2' },
  };

  it('writes the name and every setting as x_achordeon directives', () => {
    expect(toChordPro([song], theory)).toBe(
      [
        '{title: A}',
        '{x_achordeon_name: A – B}',
        '{x_achordeon_columns: 2}',
        '{x_achordeon_chordColor: #cc0000}',
        '{x_achordeon_aspectRatio: "2"}',
        '',
        'Words',
        '',
      ].join('\n'),
    );
  });

  it('reads them back into the draft, not into the Content', () => {
    const [draft] = converted(toChordPro([song], theory)).songs;
    expect(draft.name).toBe('A – B');
    expect(draft.settings).toEqual(song.settings);
    expect(draft.content).toBe('* A\nWords\n');
    expect(draft.report.directives.dropped).toEqual([]);
  });

  it('gives a sheet without them no settings', () => {
    expect(converted('{t: A}\nWords\n').songs[0].settings).toEqual({});
  });

  it('keeps a setting it does not know, for the import to judge', () => {
    expect(
      converted('{t: A}\n{x_achordeon_madeUp: yes}\nWords\n').songs[0].settings,
    ).toEqual({ madeUp: 'yes' });
  });

  it('leaves another app’s own directives out', () => {
    const [draft] = converted('{t: A}\n{x_other_thing: 1}\nWords\n').songs;
    expect(draft.settings).toEqual({});
    expect(draft.report.directives.dropped).toEqual(['x_other_thing']);
  });
});
