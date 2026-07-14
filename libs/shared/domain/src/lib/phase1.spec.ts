import { phase1 } from './phase1';

describe('phase1 — classification & blocking', () => {
  describe('blocks & blank boundaries', () => {
    it('groups consecutive lyric lines into one block', () => {
      const { blocks } = phase1('one\ntwo\nthree');
      expect(blocks).toEqual([{ lines: ['one', 'two', 'three'] }]);
    });

    it('splits blocks on a blank line', () => {
      const { blocks } = phase1('a\nb\n\nc');
      expect(blocks).toEqual([{ lines: ['a', 'b'] }, { lines: ['c'] }]);
    });

    it('collapses consecutive blanks and ignores leading/trailing blanks', () => {
      const { blocks } = phase1('\n\na\n\n\n\nb\n\n');
      expect(blocks).toEqual([{ lines: ['a'] }, { lines: ['b'] }]);
    });

    it('emits no blocks for empty or whitespace-only input', () => {
      expect(phase1('').blocks).toEqual([]);
      expect(phase1('   \n\t\n  ').blocks).toEqual([]);
    });
  });

  describe('title / subtitle (asterisk rule)', () => {
    it('lifts a title and its body verbatim, and it is a boundary', () => {
      const { blocks, titles } = phase1('a\n* My Song\nb');
      expect(titles).toEqual([{ value: 'My Song', line: 1, range: [0, 9] }]);
      expect(blocks).toEqual([{ lines: ['a'] }, { lines: ['b'] }]);
    });

    it('lifts a subtitle (longest match: ** before *)', () => {
      const { subtitles, titles } = phase1('** The Author');
      expect(subtitles).toEqual([
        { value: 'The Author', line: 0, range: [0, 13] },
      ]);
      expect(titles).toEqual([]);
    });

    it('keeps the whole rest of the line literal (no colon/bracket/escape parsing)', () => {
      const { titles } = phase1('* Song: Live [Acoustic]');
      expect(titles[0].value).toBe('Song: Live [Acoustic]');
    });

    it('collects every title in order (resolution is later)', () => {
      const { titles } = phase1('* First\n* Second');
      expect(titles.map((t) => t.value)).toEqual(['First', 'Second']);
    });

    it('treats an empty-body marker as absent (no value, still a boundary)', () => {
      const { titles, subtitles, blocks } = phase1('a\n* \nb\n**   \nc');
      expect(titles).toEqual([]);
      expect(subtitles).toEqual([]);
      expect(blocks).toEqual([
        { lines: ['a'] },
        { lines: ['b'] },
        { lines: ['c'] },
      ]);
    });

    it('does not treat ***, *bold*, or *x as title/subtitle', () => {
      const { titles, subtitles, blocks } = phase1('*** whoa\n*bold*\n*x');
      expect(titles).toEqual([]);
      expect(subtitles).toEqual([]);
      expect(blocks).toEqual([{ lines: ['*** whoa', '*bold*', '*x'] }]);
    });
  });

  describe('labelled content (colon-run rule)', () => {
    const label = (line: string) => {
      const { blocks } = phase1(line);
      return { label: blocks[0].label, content: blocks[0].lines[0] };
    };

    it('matches the grammar table', () => {
      expect(label('1.: First verse')).toEqual({
        label: '1.',
        content: 'First verse',
      });
      expect(label('R:: Block X')).toEqual({ label: 'R:', content: 'Block X' });
      expect(label('1:::')).toEqual({ label: '1::', content: undefined });
      expect(label('2.: And [C]trade')).toEqual({
        label: '2.',
        content: 'And [C]trade',
      });
      expect(label('Narrator: hi')).toEqual({
        label: 'Narrator',
        content: 'hi',
      });
    });

    it('a colon not followed by space-or-EOL is not a delimiter', () => {
      expect(phase1('http://x').blocks).toEqual([{ lines: ['http://x'] }]);
      expect(phase1('12:30 set').blocks[0].label).toBe(undefined);
    });

    it('empty label text is not a label', () => {
      expect(phase1(': foo').blocks).toEqual([{ lines: [': foo'] }]);
    });

    it('an escaped colon never counts as a delimiter', () => {
      const { blocks } = phase1('Narrator\\: hi');
      expect(blocks).toEqual([{ lines: ['Narrator\\: hi'] }]);
    });

    it('consumes exactly one following space into the content', () => {
      expect(label('Verse:  spaced').content).toBe(' spaced');
    });
  });

  describe('label position & block boundaries', () => {
    it('records labelInline=true when content shares the label line', () => {
      const { blocks } = phase1('Verse: foo\nbar');
      expect(blocks).toEqual([
        { label: 'Verse', labelInline: true, lines: ['foo', 'bar'] },
      ]);
    });

    it('records labelInline=false when the body starts on the next line', () => {
      const { blocks } = phase1('Verse:\nfoo');
      expect(blocks).toEqual([
        { label: 'Verse', labelInline: false, lines: ['foo'] },
      ]);
    });

    it('allows a label-only block with zero content lines', () => {
      const { blocks } = phase1('Verse:');
      expect(blocks).toEqual([
        { label: 'Verse', labelInline: false, lines: [] },
      ]);
    });

    it('starts a new block at each labelled line with no blank between', () => {
      const { blocks } = phase1('A: x\nB: y');
      expect(blocks).toEqual([
        { label: 'A', labelInline: true, lines: ['x'] },
        { label: 'B', labelInline: true, lines: ['y'] },
      ]);
    });
  });
});
