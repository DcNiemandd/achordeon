// Parser Phase 1 — line classification & blocking — Epic 2 ▸ subtask 3
// Spec: docs/PARSER-GRAMMAR.md §Phase 1. Position-based grammar only: the
// line-start `*` / label `:` are resolved here and never reach Phase 2, so the
// title-vs-emphasis collision cannot arise (ADR-0005). Escape-AWARE but does not
// consume — the raw characters pass through to Phase 2, which resolves them.

import { findLabelDelimiter } from './chords';

/** A block before Phase 2: raw content strings awaiting the inline scan. */
export interface RawBlock {
  label?: string;
  labelInline?: boolean;
  lines: string[];
}

/** A `*`/`**` line lifted to song level, with its source location for warnings. */
export interface TitleCandidate {
  value: string;
  line: number;
  range: [number, number];
}

export interface Phase1Result {
  blocks: RawBlock[];
  titles: TitleCandidate[];
  subtitles: TitleCandidate[];
}

type Classified =
  | { kind: 'blank' }
  | { kind: 'title'; value: string | undefined; line: number; length: number }
  | {
      kind: 'subtitle';
      value: string | undefined;
      line: number;
      length: number;
    }
  | { kind: 'labelled'; label: string; content: string }
  | { kind: 'lyric'; content: string };

/**
 * The colon-run rule (PARSER-GRAMMAR §Labelled content): the first unescaped
 * colon-run immediately followed by a space or end-of-line is a label. Its last
 * colon is the delimiter (consumed); earlier colons stay as literal label text.
 * Empty label text → not a label. Returns null for an ordinary lyric.
 */
function findLabel(line: string): { label: string; content: string } | null {
  // The rule itself lives in `findLabelDelimiter` — the editor's highlighter
  // colours labels with the same recogniser, so the two cannot disagree.
  const delimiter = findLabelDelimiter(line);
  if (delimiter !== -1) {
    // Everything before the run, plus the run's earlier colons as literal text.
    let runStart = delimiter;
    while (runStart > 0 && line[runStart - 1] === ':') {
      runStart--;
    }
    const label = line.slice(0, runStart) + ':'.repeat(delimiter - runStart);
    // Exactly one following space is consumed; the rest is the content line.
    const after = line[delimiter + 1];
    const contentStart = after === ' ' ? delimiter + 2 : delimiter + 1;
    return { label, content: line.slice(contentStart) };
  }
  return null;
}

/**
 * Strip a content line's leading whitespace — the trim the pass ends with.
 *
 * Leading spaces/tabs on a content line are almost always the editor's own
 * indentation (you tabbed a lyric across, you pasted an indented block), not
 * something the song wants; keeping them shoved the line right and pulled every
 * chord on it off its character. So they go.
 *
 * The run of `[ \t]` naturally stops at the first non-whitespace char — including
 * a backslash — so a leading `\ ` survives untouched and Phase 2 resolves it to a
 * deliberate space (`ESCAPABLE`). That is the whole escape mechanism: no special
 * casing here, just "strip real leading whitespace, and an escaped space is not
 * real leading whitespace because the backslash is not whitespace".
 */
function stripLeadingWhitespace(content: string): string {
  return content.replace(/^[ \t]+/, '');
}

function classify(line: string, lineNo: number): Classified {
  if (line.trim() === '') {
    return { kind: 'blank' };
  }
  // Longest match: test `**` before `*` (PARSER-GRAMMAR §asterisk rule). The
  // marker must sit at column 0 AND be followed by a space — that space keeps
  // `***`, `*bold*`, `*x` out of this branch with no special case. An escaped
  // leading `*` starts with `\`, so it simply fails these prefix tests.
  if (line.startsWith('** ')) {
    const body = line.slice(3);
    return {
      kind: 'subtitle',
      value: body.trim() === '' ? undefined : body,
      line: lineNo,
      length: line.length,
    };
  }
  if (line.startsWith('* ')) {
    const body = line.slice(2);
    return {
      kind: 'title',
      value: body.trim() === '' ? undefined : body,
      line: lineNo,
      length: line.length,
    };
  }
  const label = findLabel(line);
  if (label) {
    // The label already consumed one delimiting space; strip any further indent
    // the same as a bare lyric, so `Verse:    sing` and `Verse: sing` render alike.
    return {
      kind: 'labelled',
      label: label.label,
      content: stripLeadingWhitespace(label.content),
    };
  }
  return { kind: 'lyric', content: stripLeadingWhitespace(line) };
}

/**
 * Split content into lines, classify each, and group into blocks. Blank lines are
 * boundaries (consecutive blanks collapse; no empty blocks emitted); a labelled
 * line always opens a new block; title/subtitle lines are boundaries lifted to
 * song level.
 */
export function phase1(content: string): Phase1Result {
  const lines = content.split(/\r\n|\r|\n/);
  const blocks: RawBlock[] = [];
  const titles: TitleCandidate[] = [];
  const subtitles: TitleCandidate[] = [];

  let current: RawBlock | null = null;
  const flush = () => {
    if (current) {
      blocks.push(current);
      current = null;
    }
  };

  lines.forEach((raw, lineNo) => {
    const c = classify(raw, lineNo);
    switch (c.kind) {
      case 'blank':
        flush();
        break;
      case 'title':
        flush();
        if (c.value !== undefined) {
          titles.push({ value: c.value, line: c.line, range: [0, c.length] });
        }
        break;
      case 'subtitle':
        flush();
        if (c.value !== undefined) {
          subtitles.push({
            value: c.value,
            line: c.line,
            range: [0, c.length],
          });
        }
        break;
      case 'labelled':
        flush();
        current = {
          label: c.label,
          labelInline: c.content.length > 0,
          lines: c.content.length > 0 ? [c.content] : [],
        };
        break;
      case 'lyric':
        if (!current) {
          current = { lines: [] };
        }
        current.lines.push(c.content);
        break;
    }
  });
  flush();

  return { blocks, titles, subtitles };
}
