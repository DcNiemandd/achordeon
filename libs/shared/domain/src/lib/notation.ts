// Chord notation — English/German spelling — Epic 12
// Spec: ADR-0008 (notation policy is the domain's, never the engine's),
// ADR-0006 (it cascades like any other setting), PRD-RENDERING §4.10.
//
// The English/German switch, and the whole of it: it re-spells the chords a page
// DRAWS. It never rewrites the song. Source stays one language, so a file means
// the same thing on every device, `transposeContent` stays a lossless token
// rewrite, and switching the setting is a view change you can switch back.

import type { Line, SongAst } from './ast';
import type { ChordNotation } from './chords';
import type { ChordTheory } from './theory';

/**
 * A note name as German spells it.
 *
 * The whole difference is one letter: German calls B natural `H` and keeps the
 * plain `B` for B♭. `C#`, `Eb`, `A` are spelled the same in both, so this is two
 * cases and not a table. (`Cis`/`Es`/`As` is a third notation, not this one.)
 */
function germanNote(note: string): string {
  if (note === 'B') return 'H';
  if (note === 'Bb') return 'B';
  return note;
}

/**
 * One chord symbol as `notation` spells it.
 *
 * **English is the identity.** It is the language the source is written in, so
 * "spelled in English" means "as it was typed": a song that has always rendered
 * `Bb` still renders `Bb`, and one written `[H]` keeps its `H`. Only German
 * re-spells — and it re-spells every chord it can parse, so a book that mixes
 * `H` and `Bb` comes out consistent.
 *
 * Anything the engine does not recognise as a chord is returned untouched: an
 * annotation (`[Solo]`, `[x2]`) is text, not a symbol, and re-spelling text would
 * be a bug. So is a chord whose notes are the same in both languages — the symbol
 * is handed back verbatim rather than rebuilt, so no reformatting can leak in
 * through a chord that had nothing to do with the setting.
 */
export function spellChord(
  symbol: string,
  notation: ChordNotation,
  theory: ChordTheory,
): string {
  if (notation !== 'german') return symbol;
  const parsed = theory.parseChord(symbol);
  if (parsed === null) return symbol;

  const root = germanNote(parsed.root);
  const bass = parsed.bass === null ? null : germanNote(parsed.bass);
  if (root === parsed.root && bass === parsed.bass) return symbol;
  return root + parsed.quality + (bass === null ? '' : `/${bass}`);
}

/**
 * The same AST with every chord anchor spelled in `notation`.
 *
 * Applied once, at the top of the render (`RenderService.layout`), so screen,
 * PNG, PDF and the songbook exports cannot disagree about what a chord is called
 * — and so the editor keeps showing the source as it really is.
 *
 * Returns the AST itself when nothing moved, which is every render in English and
 * most renders in German (a song with no B in it). A `computed` downstream then
 * sees the same reference and has nothing to recompute.
 */
export function respellChords(
  ast: SongAst,
  notation: ChordNotation,
  theory: ChordTheory,
): SongAst {
  if (notation !== 'german') return ast;

  let changed = false;
  const blocks = ast.blocks.map((block) => {
    let blockChanged = false;
    const lines = block.lines.map((line): Line => {
      let lineChanged = false;
      const chords = line.chords.map((chord) => {
        if (!chord.valid) return chord;
        const raw = spellChord(chord.raw, notation, theory);
        if (raw === chord.raw) return chord;
        lineChanged = true;
        return { ...chord, raw };
      });
      if (!lineChanged) return line;
      blockChanged = true;
      return { ...line, chords };
    });
    if (!blockChanged) return block;
    changed = true;
    return { ...block, lines };
  });

  return changed ? { ...ast, blocks } : ast;
}
