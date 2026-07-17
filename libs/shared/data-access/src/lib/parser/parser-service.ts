// ParserService — Epic 5 ▸ subtask 4
// Spec: PRD-INFRASTRUCTURE.md §2/§12, ADR-0005, docs/PARSER-GRAMMAR.md §Reparse

import { Injectable, inject } from '@angular/core';
import {
  ChordTheory,
  createReparser,
  parse,
  type Reparser,
  type SongAst,
} from '@achordeon/shared/domain';

/**
 * Content text → semantic AST (PRD-INFRASTRUCTURE.md §12).
 *
 * **A DI adapter over pure functions, and nothing more.** The grammar lives in
 * `shared/domain` where it is framework-free and exhaustively unit-tested; all
 * this adds is the one dependency the pure layer refuses to reach for — the
 * `ChordTheory` implementation (ADR-0008). The same partial-application trick
 * `RenderService` uses for `measureText`.
 *
 * It is total: `parse` never throws, whatever half-typed text is in the editor
 * (ADR-0005). Problems come back as structured warnings.
 */
@Injectable({ providedIn: 'root' })
export class ParserService {
  private readonly theory = inject(ChordTheory);

  parse(content: string): SongAst {
    return parse(content, this.theory);
  }

  /**
   * A debounced full reparse, feeding **one** AST per settled edit to both the
   * render preview and the editor's markers (PARSER-GRAMMAR §Reparse). A song is
   * one page, so a full parse is sub-millisecond and incremental dirty-tracking
   * would be premature.
   */
  createReparser(onParsed: (ast: SongAst) => void, delayMs?: number): Reparser {
    return createReparser(this.theory, onParsed, delayMs);
  }
}
