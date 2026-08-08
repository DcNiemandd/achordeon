// `toAchordeon` is pure text-to-text, so this is the whole of its testability.
//
// Run by `nx test skill` (see tools/skill/project.json). It loads the theory
// through `_domain.mjs`, which means these fixtures are checked against the
// SHIPPED chord recogniser rather than a stand-in — the point of §2 being that the
// converter stopped carrying its own copy of one.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { toAchordeon } from './_domain.mjs';

/** The converted text, for a fixture written as a template literal. */
const convert = (text, options) => toAchordeon(text, options).text;

describe('chord rows folded into the words below', () => {
  test('places each chord over the character it sat above', () => {
    //                    col 0     col 10    col 20 (past the end of the words)
    const out = convert(
      ['Am        F         C', 'Some words of a song'].join('\n'),
    );
    assert.equal(out, '[Am]Some words[F] of a song[C]\n');
  });

  test('a chord past the end of the words hangs at the end', () => {
    const { text, report } = toAchordeon(
      ['C         G', 'Short line'].join('\n'),
      {},
    );
    assert.equal(text, '[C]Short line[G]\n');
    assert.equal(report.clamped, 1);
  });

  test('chords clamped to the same spot become one bracket', () => {
    // Both hang past the end of a two-character lyric, so both land at the same
    // index — and Achordeon writes several chords at one spot as one bracket.
    const out = convert(['     C  G', 'Hi'].join('\n'));
    assert.equal(out, 'Hi[C G]\n');
  });

  test('a chord row with no words under it becomes a bracket line', () => {
    const { text, report } = toAchordeon(
      ['Am F C G', '', 'Some words'].join('\n'),
      {},
    );
    assert.equal(text, '[Am F C G]\n\nSome words\n');
    assert.equal(report.bareRows, 1);
  });

  test('a bar-line-only row is not a chord row', () => {
    // All tokens chordish, none a real chord — so it stays a lyric.
    const out = convert(['| | : |', 'Words below'].join('\n'));
    assert.equal(out, '| | : |\nWords below\n');
  });

  test('never splices a chord into a label or before the first word', () => {
    // The chord sat at column 0, which is inside `Verse:` — it is pushed past the
    // delimiter rather than into it, because a label is not a lyric.
    const { text, report } = toAchordeon(
      ['Am', 'Verse: the words'].join('\n'),
      {},
    );
    assert.equal(text, 'Verse:[Am] the words\n');
    assert.equal(report.clamped, 1);
  });

  test('leaves a tablature row alone rather than turning it into rubble', () => {
    const out = convert(['Am', 'e|--1---3--|'].join('\n'));
    assert.equal(out, '[Am]\ne|--1---3--|\n');
  });

  test('an annotation row rides along with the chords', () => {
    const out = convert(
      ['Am    x2    N.C.', 'Words and more words'].join('\n'),
    );
    assert.equal(out, '[Am]Words [x2]and mo[N.C.]re words\n');
  });
});

describe('a line that already carries brackets', () => {
  test('is left exactly as it was', () => {
    const { text, report } = toAchordeon('[Am]Already inline\n', {});
    assert.equal(text, '[Am]Already inline\n');
    assert.equal(report.alreadyInline, 1);
    assert.equal(report.merged, 0);
  });

  test('is still a merge target, with columns counted as PRINTED', () => {
    // The `[x2]` takes no width on the page, so the G belongs over the `m` of
    // `more` — four characters to the right of where the raw string says.
    const { text, report } = toAchordeon(
      ['C         G', 'Some words[x2] more'].join('\n'),
      {},
    );
    assert.equal(text, '[C]Some words[x2][G] more\n');
    assert.equal(report.inlineTargets, 1);
  });
});

describe('ChordPro directives', () => {
  test('title and artist become * and ** markers', () => {
    const { text, report } = toAchordeon(
      ['{title: Wild Mountain Thyme}', '{artist: Traditional}', 'Words'].join(
        '\n',
      ),
      {},
    );
    assert.equal(text, '* Wild Mountain Thyme\n** Traditional\nWords\n');
    assert.equal(report.directives.converted, 2);
  });

  test('the short forms are the same directives', () => {
    assert.equal(convert('{t:A}\n{st:B}\n'), '* A\n** B\n');
  });

  test('block markers are dropped — blocks are blank-line separated', () => {
    const { text, report } = toAchordeon(
      ['{start_of_chorus}', 'Words', '{end_of_chorus}'].join('\n'),
      {},
    );
    assert.equal(text, 'Words\n');
    assert.equal(report.directives.dropped, 2);
  });

  test('anything else is left as text and reported BY NAME', () => {
    const { text, report } = toAchordeon('{capo: 3}\n', {});
    assert.equal(text, '{capo: 3}\n');
    assert.deepEqual(report.directives.kept, ['capo']);
  });

  test('a title marker is never read as a chord row', () => {
    assert.equal(convert('* A\nWords\n'), '* A\nWords\n');
  });

  test('a brace that is not a directive stays a lyric', () => {
    assert.equal(convert('{not a directive}\n'), '{not a directive}\n');
  });
});

describe('the one-letter row', () => {
  test('is read as a chord where the file proves the layout', () => {
    const { text, report } = toAchordeon(
      ['Am        F', 'Some words of a song', 'C', 'And more words'].join('\n'),
      {},
    );
    assert.equal(
      text,
      ['[Am]Some words[F] of a song', '[C]And more words'].join('\n') + '\n',
    );
    assert.equal(report.promoted, 1);
  });

  test('is left alone, and named, where nothing settles it', () => {
    // A Czech "a" over a line of words, in a file with no other chord row.
    const { text, report } = toAchordeon(['a', 'nějaká slova'].join('\n'), {});
    assert.equal(text, 'a\nnějaká slova\n');
    assert.deepEqual(report.ambiguous, [1]);
    assert.equal(report.confirmed, 0);
  });
});

describe('whitespace and encoding', () => {
  test('expands tabs before aligning, at the width asked for', () => {
    const { text, report } = toAchordeon(
      ['C\tG', 'Some words here'].join('\n'),
      { tabWidth: 4 },
    );
    assert.equal(text, '[C]Some[G] words here\n');
    assert.equal(report.tabbedLines, 1);
  });

  test('normalises CRLF and says so', () => {
    const { text, report } = toAchordeon('Words\r\nMore\r\n', {});
    assert.equal(text, 'Words\nMore\n');
    assert.equal(report.wasCrlf, true);
  });

  test('drops a byte-order mark a text editor left behind', () => {
    assert.equal(convert('﻿Words\n'), 'Words\n');
  });

  test('always ends the file with a newline', () => {
    assert.equal(convert('Words'), 'Words\n');
  });
});

describe('the shape of the contract', () => {
  test('reads nothing from the environment — the report is counts only', () => {
    const { report } = toAchordeon(['C', 'A secret lyric'].join('\n'), {});
    assert.equal(
      JSON.stringify(report).includes('secret'),
      false,
      'the report must never carry a line of the song',
    );
  });

  test('refuses a tab width that is not a positive integer', () => {
    assert.throws(() => toAchordeon('x', { tabWidth: 0 }), RangeError);
  });
});
