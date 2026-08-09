// Chord notation — English/German spelling — Epic 12
// Spec: ADR-0008 (notation policy is the domain's, never the engine's),
// ADR-0006 (it cascades like any other setting), PRD-RENDERING §4.10.
//
// The English/German switch, and the whole of it: it re-spells the chords a page
// DRAWS. It never rewrites the song. Source stays one language, so a file means
// the same thing on every device, `transposeContent` stays a lossless token
// rewrite, and switching the setting is a view change you can switch back.
//
// Both settings spell. English used to be the identity — "as typed" — which made
// the setting `german | off` rather than `german | english`: a book pasted from
// two sources printed `H` beside `Bb`, and `Hb` printed as `Hb`, a spelling no
// notation has. Each half now names B natural and B flat its own way, so either
// setting turns a mixed song into one language.
//
// One rule of it reaches further than the page: transpose already rewrites the
// source, and when it does it has to pick a spelling. `spellNoteInSource` is the
// subset of the German rule that is safe to write into text that will be parsed
// again — see its doc for why that subset is smaller than what the page prints.

import type { Line, SongAst } from './ast';
import { toEnglishNotation, type ChordNotation } from './chords';
import type { ChordTheory } from './theory';

/**
 * A note name as `notation` spells it **in the source** — the only re-spelling
 * transpose may write back into the song's text.
 *
 * It is deliberately smaller than what {@link spellChord} prints, and by exactly
 * one letter. German prints B♭ as a bare `B`, which is unambiguous on paper
 * because nothing reads paper back. A bare `B` in the *source* is B natural for
 * everyone — reading never follows a preference (`toEnglishNotation`, the mixed
 * convention; PARSER-GRAMMAR §Notation) — so writing the printed spelling into
 * the text would move every B♭ up a semitone the next time the file was parsed,
 * on this device as much as on any other. B♭ therefore stays `Bb` in the text and
 * only *prints* as `B`.
 *
 * That leaves one re-spelling that survives the round trip: B natural → `H`, which
 * reads back as the same note under either setting. So this is what a German
 * transpose is allowed to leave behind, and it changes the text the author sees
 * without changing a note of what the page draws (`B` and `H` both print as `H`).
 *
 * `germanNote` is built **on** this rather than beside it, so the `H` rule cannot
 * drift between what a page prints and what a transpose writes.
 */
export function spellNoteInSource(
  note: string,
  notation: ChordNotation,
): string {
  if (notation !== 'german') return note;
  return note === 'B' ? 'H' : note;
}

/**
 * A note name as German spells it.
 *
 * The whole difference is one letter: German calls B natural `H` and keeps the
 * plain `B` for B♭. `C#`, `Eb`, `A` are spelled the same in both, so this is two
 * cases and not a table. (`Cis`/`Es`/`As` is a third notation, not this one.)
 *
 * The `Bb` → `B` half is print-only and lives here alone; the `B` → `H` half is
 * shared with the source, so it is taken from {@link spellNoteInSource}.
 */
function germanNote(note: string): string {
  if (note === 'Bb') return 'B';
  return spellNoteInSource(note, 'german');
}

/**
 * One chord symbol as `notation` spells it.
 *
 * Both settings re-spell, and each re-spells every chord it can parse, so a book
 * that mixes `H` and `Bb` comes out in one language whichever is chosen. English
 * is **not** the identity: it is a language, not "as it was typed", so a `[H]` in
 * an English song prints `B` and an `[Hb]` prints `Bb` — the latter being a
 * spelling neither language has, and the clearest sign that "as typed" was never
 * a third notation but the absence of one.
 *
 * English is exactly {@link toEnglishNotation}, the same rewrite reading applies,
 * which is why it needs no engine: the read step already defines what German
 * spelling a source may carry (a leading `H` and a `/H`), so undoing it in the
 * text is the whole of the English spelling. German has to go through the parse,
 * because its `Bb` → `B` half is about the *note*, not about the letters typed.
 *
 * Anything the engine does not recognise as a chord is returned untouched: an
 * annotation (`[Solo]`, `[x2]`) is text, not a symbol, and re-spelling text would
 * be a bug — `[Hold]` is the case that bites, since the English rewrite alone
 * would make it `[Bold]`. So is a chord whose notes are the same in both
 * languages — the symbol is handed back verbatim rather than rebuilt, so no
 * reformatting can leak in through a chord that had nothing to do with the
 * setting.
 */
export function spellChord(
  symbol: string,
  notation: ChordNotation,
  theory: ChordTheory,
): string {
  if (notation !== 'german') {
    const spelt = toEnglishNotation(symbol);
    // Nothing German in it, so nothing to re-spell — and no reason to ask the
    // engine whether it is even a chord. This is every symbol in almost every
    // song, so the English render stays as cheap as it was when it did nothing.
    if (spelt === symbol) return symbol;
    return theory.parseChord(symbol) === null ? symbol : spelt;
  }

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
 * Returns the AST itself when nothing moved, which is most renders in either
 * language — English unless the song was typed with an `H`, German unless it has
 * a B in it. A `computed` downstream then sees the same reference and has nothing
 * to recompute.
 */
export function respellChords(
  ast: SongAst,
  notation: ChordNotation,
  theory: ChordTheory,
): SongAst {
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
