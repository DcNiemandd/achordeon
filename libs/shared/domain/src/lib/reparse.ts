// Debounced full-reparse contract for the editor — Epic 2 ▸ subtask 7
// Spec: docs/PARSER-GRAMMAR.md §Reparse. Full reparse, debounced: on change →
// debounce → parse(getValue()) → ONE fresh AST feeding both the render-preview
// and the editor markers. A Song is "one page", so a full parse is sub-ms;
// incremental dirty-tracking would be premature. Framework-agnostic and
// RxJS-free (signals-only stack); the editor adapter (Epic 5) drives it.

import type { SongAst } from './ast';
import { parse } from './parser';
import type { ChordTheory } from './theory';

/**
 * The seam the editor holds. `schedule` on every change (debounced); `flush` to
 * reparse now (e.g. on blur/save/close); `cancel` on teardown. Exactly one
 * `onParsed` fires per settled edit, with the AST both consumers read.
 */
export interface Reparser {
  schedule(content: string): void;
  flush(): void;
  cancel(): void;
}

/**
 * Build a debounced reparser. `onParsed` receives the single AST for the latest
 * settled content; the editor fans it out to the render-preview signal and the
 * warning markers. `delayMs` is the parse→render/markers debounce (~50–150 ms),
 * separate from keystroke autosave.
 */
export function createReparser(
  theory: ChordTheory,
  onParsed: (ast: SongAst) => void,
  delayMs = 80,
): Reparser {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: string | null = null;

  const clear = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const fire = () => {
    timer = null;
    if (pending === null) {
      return;
    }
    const content = pending;
    pending = null;
    onParsed(parse(content, theory));
  };

  return {
    schedule(content) {
      pending = content;
      clear();
      timer = setTimeout(fire, delayMs);
    },
    flush() {
      clear();
      fire();
    },
    cancel() {
      clear();
      pending = null;
    },
  };
}
