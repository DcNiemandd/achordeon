// Parser Phase 1 — line classification & blocking — Epic 2 ▸ subtask 3
// Spec: docs/PARSER-GRAMMAR.md §Phase 1. Position-based grammar only: the
// line-start `*` / label `:` are resolved here and never reach Phase 2, so the
// title-vs-emphasis collision cannot arise (ADR-0005). Escape-AWARE but does not
// consume — the raw characters pass through to Phase 2, which resolves them.

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
  let i = 0;
  while (i < line.length) {
    const c = line[i];
    if (c === '\\') {
      // Escape-aware: skip the escaped char so `\:` can never be a delimiter.
      i += 2;
      continue;
    }
    if (c === ':') {
      let j = i;
      while (j < line.length && line[j] === ':') {
        j++;
      }
      const runLength = j - i;
      const after = j < line.length ? line[j] : undefined;
      if (after === undefined || after === ' ') {
        const label = line.slice(0, i) + ':'.repeat(runLength - 1);
        if (label.length === 0) {
          return null; // empty label text is meaningless → lyric
        }
        const contentStart = after === ' ' ? j + 1 : j;
        return { label, content: line.slice(contentStart) };
      }
      i = j; // colon-run not a delimiter; keep scanning past it
      continue;
    }
    i++;
  }
  return null;
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
    return { kind: 'labelled', label: label.label, content: label.content };
  }
  return { kind: 'lyric', content: line };
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
