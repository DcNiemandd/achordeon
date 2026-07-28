// Line layout — Epic 3 ▸ subtask 6 (chord x-positioning + vertical rhythm)
// Spec: PRD-RENDERING §4.6 (chord x-positioning), §4.7 (vertical rhythm),
// §4.8 (sub-label), §4.9 (chords in the flow).
//
// Positions ONE line's items relative to the line's own top-left (`y = 0` at the
// top of the space the line occupies, `x = lineOrigin`). The caller (block
// layout) stacks these and translates them into column/page space, so this pass
// owns only the intra-line geometry: the signature chord-over-character x, the
// chords that sit IN the line instead of above it, the sub-label that opens the
// row, the per-line chord row, and the base-unit vertical slot heights.

import type { Line, ChordAnchor, Span } from '@achordeon/shared/domain';
import type { TextItem } from './render-plan';
import type { FontSpec } from './text-measurer';
import { toFontSpec, type LayoutContext } from './context';

/** The emphasis in force at one character — the spans are non-overlapping. */
function emphasisAt(
  spans: Span[] | undefined,
  index: number,
): { bold: boolean; italic: boolean } {
  let bold = false;
  let italic = false;
  if (spans) {
    for (const span of spans) {
      if (index >= span.start && index < span.end) {
        if (span.bold) bold = true;
        if (span.italic) italic = true;
      }
    }
  }
  return { bold, italic };
}

interface StyledRun {
  start: number;
  end: number;
  text: string;
  bold: boolean;
  italic: boolean;
}

/** Split a line's text into maximal runs of one emphasis (§4.10 markdown). */
function styledRuns(text: string, spans: Span[] | undefined): StyledRun[] {
  const runs: StyledRun[] = [];
  let i = 0;
  while (i < text.length) {
    const { bold, italic } = emphasisAt(spans, i);
    let j = i + 1;
    while (j < text.length) {
      const next = emphasisAt(spans, j);
      if (next.bold !== bold || next.italic !== italic) break;
      j += 1;
    }
    runs.push({ start: i, end: j, text: text.slice(i, j), bold, italic });
    i = j;
  }
  return runs;
}

/**
 * Cut the runs so every index in `cuts` falls on a run boundary. A chord in the
 * flow is written between two characters, so the run it lands inside has to be
 * split there — otherwise the cursor would have already drawn past the spot.
 */
function cutRuns(
  runs: StyledRun[],
  cuts: Set<number>,
  text: string,
): StyledRun[] {
  if (cuts.size === 0) return runs;
  const out: StyledRun[] = [];
  for (const run of runs) {
    let start = run.start;
    for (let i = run.start + 1; i < run.end; i++) {
      if (cuts.has(i)) {
        out.push({ ...run, start, end: i, text: text.slice(start, i) });
        start = i;
      }
    }
    out.push({ ...run, start, end: run.end, text: text.slice(start, run.end) });
  }
  return out;
}

/** The base lyric font with a run's emphasis applied (a different embedded face). */
function runFont(
  base: FontSpec,
  run: { bold: boolean; italic: boolean },
): FontSpec {
  if (!run.bold && !run.italic) return base;
  return {
    ...base,
    weight: run.bold ? 'bold' : base.weight,
    style: run.italic ? 'italic' : base.style,
  };
}

export interface LineLayout {
  items: TextItem[];
  /** Total vertical slot for this line in base units (chord row + lyric slot, §4.7). */
  height: number;
  /** The row's own baseline, below any reserved chord row — what an inline block label rides (§4.8). */
  baseline: number;
  /** True when a chord row was reserved — kept even when `hideChords` blanks it (§4.6). */
  hasChordRow: boolean;
  /** Rightmost x reached by any item — feeds column width (§4.2). */
  width: number;
}

/**
 * Group anchors sharing one `at` into a single left-aligned run (§4.6
 * same-index group), preserving document order both across and within groups.
 * `[A][B]c` and `[A B]c` collapse to the identical run.
 */
export function groupByIndex(
  chords: ChordAnchor[],
  joiner: string,
): { at: number; text: string }[] {
  const groups = new Map<number, string[]>();
  for (const c of chords) {
    const run = groups.get(c.at);
    if (run) run.push(c.raw);
    else groups.set(c.at, [c.raw]);
  }
  return [...groups].map(([at, raws]) => ({ at, text: raws.join(joiner) }));
}

/**
 * Lay out one line at the given horizontal origin.
 *
 * **Two kinds of chord (§4.9).** One floats above the line, over the exact
 * character it was written on; the other sits IN the line, taking horizontal
 * space and pushing everything after it right. A chord is in the flow when it was
 * written `[[…]]` — or when the line carries no lyric text at all, because then
 * there is no character to float over and a row of chords IS the line. Flow
 * chords take the flow multiplier, which brings them back to lyric size.
 *
 * Vertical rhythm (§4.7): a chord row is reserved ONLY above a line that carries
 * ≥1 floating anchor; the chord row abuts the lyric slot (gap tunable).
 * `hideChords` omits chord glyphs but keeps both the row and every flow chord's
 * advance — so lyric baselines and x are identical with or without chords, and
 * nothing reflows (§4.6).
 */
export function layoutLine(
  line: Line,
  ctx: LayoutContext,
  lineOrigin: number,
): LineLayout {
  const { metrics, styles, tuning } = ctx;
  const lyricFont = toFontSpec(styles.lyric);
  const chordFont = toFontSpec(styles.chord);
  const flowScale = tuning.flowChordMultiplier;

  const allFlow = line.text.trim() === '';
  const flowChords = allFlow
    ? line.chords
    : line.chords.filter((c) => c.inline);
  const aboveChords = allFlow ? [] : line.chords.filter((c) => !c.inline);

  const hasChordRow = aboveChords.length > 0;
  const chordRowH = hasChordRow ? metrics.chord.height : 0;
  const chordGap = hasChordRow
    ? tuning.spacing.chordRowGapFactor * metrics.chord.height
    : 0;
  const lyricTop = chordRowH + chordGap;

  // The row is a lyric slot, stretched if something sharing that baseline is
  // taller than a lyric — a flow chord under a generous `chordSize`, say.
  let ascent = metrics.lyric.ascent;
  let descent = metrics.lyric.descent;
  if (flowChords.length > 0) {
    ascent = Math.max(ascent, metrics.chord.ascent * flowScale);
    descent = Math.max(descent, metrics.chord.descent * flowScale);
  }
  if (line.label !== undefined) {
    ascent = Math.max(ascent, metrics.sublabel.ascent);
    descent = Math.max(descent, metrics.sublabel.descent);
  }
  const lyricBaseline = lyricTop + ascent;
  const chordBaseline = metrics.chord.ascent;
  const height = lyricBaseline + descent;

  const items: TextItem[] = [];
  let cursor = lineOrigin;

  // A sub-label opens the row in the flow, content following after the gutter
  // gap. It is deliberately NOT in the block's label gutter (§4.8): a long
  // instrument name would otherwise indent every line in the column.
  if (line.label !== undefined) {
    items.push({
      text: line.label,
      x: cursor,
      y: lyricBaseline,
      role: 'sublabel',
    });
    cursor +=
      ctx.measure.measure(line.label, toFontSpec(styles.sublabel)).width +
      tuning.spacing.gutterGapEm * tuning.baseSizePx;
  }

  const flowGroups = groupByIndex(flowChords, tuning.sameIndexJoiner).sort(
    (a, b) => a.at - b.at,
  );
  const runs = cutRuns(
    styledRuns(line.text, line.spans),
    new Set(flowGroups.map((g) => g.at)),
    line.text,
  );

  /**
   * Draw every flow group written at or before `at` that is still waiting, and
   * advance past it. Groups are consumed in index order, so one written past the
   * last character (or on a line with no characters at all) still lands.
   */
  let pending = 0;
  const emitFlowUpTo = (at: number): void => {
    while (pending < flowGroups.length && flowGroups[pending].at <= at) {
      const group = flowGroups[pending++];
      if (!ctx.hideChords) {
        const item: TextItem = {
          text: group.text,
          x: cursor,
          y: lyricBaseline,
          role: 'chord',
        };
        if (flowScale !== 1) item.sizeScale = flowScale;
        items.push(item);
      }
      cursor += ctx.measure.measure(group.text, chordFont).width * flowScale;
    }
  };

  // The lyric is drawn as one item per emphasis run, so a bold/italic stretch
  // takes its own (wider) face. A plain line is one run.
  const runX: number[] = [];
  for (const run of runs) {
    emitFlowUpTo(run.start);
    runX.push(cursor);
    // A run of pure whitespace draws nothing — it is the gap between two flow
    // chords — but it still advances the cursor by its own width.
    if (run.text.trim() !== '') {
      const item: TextItem = {
        text: run.text,
        x: cursor,
        y: lyricBaseline,
        role: 'lyric',
      };
      if (run.bold) item.weight = 'bold';
      if (run.italic) item.style = 'italic';
      items.push(item);
    }
    cursor += ctx.measure.measure(run.text, runFont(lyricFont, run)).width;
  }
  emitFlowUpTo(Infinity); // anything written past the last character
  let width = Math.max(lineOrigin, cursor);

  // The x of a character index, summing each intervening run in its own face —
  // a bold stretch before the anchor is wider than the plain measure would say,
  // and a flow chord before it has already pushed the character right.
  const xAt = (at: number): number => {
    for (let r = 0; r < runs.length; r++) {
      const run = runs[r];
      if (at <= run.start) return runX[r];
      if (at < run.end) {
        return (
          runX[r] +
          ctx.measure.measure(
            line.text.slice(run.start, at),
            runFont(lyricFont, run),
          ).width
        );
      }
    }
    return cursor; // at === text.length (or beyond) → past the last glyph
  };

  for (const group of groupByIndex(aboveChords, tuning.sameIndexJoiner)) {
    // Left-edge-at-anchor: the chord's left edge sits at the left edge of the
    // anchored character; `at === text.length` floats it past the last glyph.
    const x = xAt(group.at);
    width = Math.max(
      width,
      x + ctx.measure.measure(group.text, chordFont).width,
    );
    if (!ctx.hideChords) {
      items.push({ text: group.text, x, y: chordBaseline, role: 'chord' });
    }
  }

  return { items, height, baseline: lyricBaseline, hasChordRow, width };
}
