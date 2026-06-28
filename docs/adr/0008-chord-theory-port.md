# 8. Music theory behind a ChordTheory port

Date: 2026-06-28

## Status

Accepted

## Context

Two pieces of the app need music-theory knowledge: the **parser** validates whether
bracket content is a real chord (ADR-0005), and **transpose** shifts chords and rewrites
the source (D2). Both lean on `@tonaljs/*` for the genuinely fiddly part — recognising
chord symbols (qualities, aliases, slash bass) and pitch-class arithmetic. The
minimal-deps policy (`PRD-INFRASTRUCTURE.md` §2) admits tonal for exactly this, but we
want the option to replace it later with a from-scratch engine without rewriting the
parser, transpose, or their tests.

A second force: the **transpose spelling rule is a product decision, not theory.**
CONTEXT requires direction-based spelling (up → sharps, down → flats) with clean output
(naturals at boundaries, never `E#`/`B#`/`Cb`/`Fb` or double-accidentals). tonal's
`transpose()` works on _interval names_ and preserves letter-name logic, so it readily
produces `E#`, `B#`, and double-sharps — the opposite of what we want. So spelling cannot
be delegated to the engine; it must be ours.

## Decision

Put a **port/adapter seam** around music theory.

- **Port `ChordTheory` in `shared/domain`** — a pure abstract class (DI token + type) with
  the _minimal descriptive_ surface the app needs, no decisions:
  - `parseChord(text): ParsedChord | null` (`null` = not a valid chord)
  - `noteChroma(note): number | null` (pitch-class 0..11)
  - `ParsedChord = { root, bass: string | null, quality }`
- **Adapter `TonalChordTheory` in `shared/data-access`** — the _only_ file importing
  `@tonaljs/*`; provided via `{ provide: ChordTheory, useClass: TonalChordTheory }`.
- **Spelling and transpose are domain policy, not on the port.** A pure function
  `transposeContent(content, semitones, theory)` in `shared/domain` owns the algorithm:
  parse each valid chord via the port, shift `root` and `/bass` by `±n` chroma, and
  **spell from a fixed direction table** —
  up `[C C# D D# E F F# G G# A A# B]`, down `[C Db D Eb E F Gb G Ab A Bb B]` —
  preserving the quality suffix verbatim and skipping invalid-as-annotation brackets.
  Passing the port as a parameter keeps the function pure (no DI to test).
- **Services inject the port.** `ParserService` (chord validity) and `TransposeService`
  depend on `ChordTheory`, not tonal; one seam serves both. There is no stored transpose
  offset — transpose is a destructive source rewrite, undo/redo via editor history.
- **Two-tier testing.** Pure core (`transposeContent`, parser) tested against a
  hand-rolled fake `ChordTheory`; a **contract suite** that any `ChordTheory`
  implementation must pass runs against the tonal adapter today and the future custom
  engine unchanged — making the swap provably behaviour-preserving.

The spelling algorithm and settled transpose rules are documented in
`docs/PRD-DOMAIN-MODEL.md`; the chord sub-grammar in `docs/PARSER-GRAMMAR.md`.

## Consequences

- `shared/domain` stays pure and dependency-free — trivially testable and navigable; the
  third-party engine is quarantined in one adapter file.
- Replacing tonal is a new adapter + one provider change, validated by the existing
  contract suite; parser, transpose, and the pure tests are untouched.
- The port is deliberately small because all _decisions_ (spelling, transpose, validity
  policy) stay in the domain — the engine only reports facts.
- Refines ADR-0005: "chord validity uses @tonaljs" becomes "chord validity uses the
  `ChordTheory` port, today backed by @tonaljs."
- Direction-based spelling is destructive and not round-trip-exact (up-then-down may
  re-spell), an accepted v1 cost per CONTEXT; key-aware spelling is a future refinement.
