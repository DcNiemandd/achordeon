// Parser entry — compose Phase 1 + Phase 2, resolve title/subtitle — Epic 2 ▸ subtask 5
// Spec: docs/PARSER-GRAMMAR.md (§Foundations, §Error/warning), ADR-0005.

import type { Block, SongAst, Warning, WarningCode } from './ast';
import { phase1, type TitleCandidate } from './phase1';
import { scanContent } from './phase2';
import type { ChordTheory } from './theory';

/**
 * "Last wins" → one effective value; every earlier candidate becomes a
 * `SHADOWED_*` warning under its own source line (PARSER-GRAMMAR §asterisk rule).
 */
function resolveEffective(
  candidates: TitleCandidate[],
  code: WarningCode,
  warnings: Warning[],
): string | undefined {
  if (candidates.length === 0) {
    return undefined;
  }
  for (let i = 0; i < candidates.length - 1; i++) {
    warnings.push({
      code,
      line: candidates[i].line,
      range: candidates[i].range,
    });
  }
  return candidates[candidates.length - 1].value;
}

/**
 * Content text → pure semantic AST. Total: any input (including half-typed text)
 * yields a `SongAst`; problems surface as structured warnings, never exceptions.
 */
export function parse(content: string, theory: ChordTheory): SongAst {
  const { blocks: rawBlocks, titles, subtitles } = phase1(content);

  const warnings: Warning[] = [];
  const title = resolveEffective(titles, 'SHADOWED_TITLE', warnings);
  const subtitle = resolveEffective(subtitles, 'SHADOWED_SUBTITLE', warnings);
  warnings.sort((a, b) => a.line - b.line);

  const blocks: Block[] = rawBlocks.map((rb) => {
    const lines = rb.lines.map((raw) => scanContent(raw, theory));
    return rb.label !== undefined
      ? { label: rb.label, labelInline: rb.labelInline ?? false, lines }
      : { lines };
  });

  const ast: SongAst = { blocks, warnings };
  if (title !== undefined) {
    ast.title = title;
  }
  if (subtitle !== undefined) {
    ast.subtitle = subtitle;
  }
  return ast;
}
