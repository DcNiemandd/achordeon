// Music-theory seam — Epic 2 ▸ subtask 1
// Spec: ADR-0008, PRD-DOMAIN-MODEL.md §Music-theory seam, docs/PARSER-GRAMMAR.md

/**
 * A recognised chord, split into the three parts transpose needs. Purely
 * descriptive — carries no decision (spelling/transpose policy lives in the
 * domain, ADR-0008). `quality` is the suffix exactly as written, so transpose
 * can preserve it verbatim while re-spelling `root`/`bass`.
 */
export interface ParsedChord {
  root: string; // e.g. 'C', 'C#', 'Bb' — the tonic note
  bass: string | null; // the /slash note, or null when there is none
  quality: string; // suffix after the root, before the /slash — verbatim
}

/**
 * The only music-theory surface the app depends on (ADR-0008). Minimal and
 * descriptive: it reports facts (is this a chord? what pitch-class is this
 * note?), never policy. The `@tonaljs/*` engine is quarantined behind one
 * adapter (`TonalChordTheory`, in `shared/data-access`); the domain — parser and
 * `transposeContent` — depends on this port so the engine stays swappable.
 *
 * An abstract class = a DI token + a type. Kept framework-free (no `@angular/*`)
 * so `shared/domain` stays pure; wired via `{ provide: ChordTheory, useClass:
 * TonalChordTheory }` in the composition layer.
 */
export abstract class ChordTheory {
  /** Parse a chord symbol; `null` = not a valid chord (render verbatim, never transpose). */
  abstract parseChord(text: string): ParsedChord | null;

  /** Pitch-class (chroma) 0..11 of a note, ignoring octave; `null` = not a note. */
  abstract noteChroma(note: string): number | null;
}
