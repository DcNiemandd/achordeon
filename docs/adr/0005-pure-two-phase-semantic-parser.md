# 5. The parser is a pure, two-phase semantic parser

Date: 2026-06-28

## Status

Accepted

## Context

`ParserService` turns a Song's **content text** into the model the rest of the app
consumes — the on-screen render, PNG/PDF export, and search all read it, and
transpose rewrites the source it describes. It is the single from-scratch grammar
piece in the app, and it runs on every keystroke behind a live editor.

The Achordeon content grammar has a defining property: it lives at **two levels with
different rules**. Block and line structure (title `*`, subtitle `**`, label `…:`,
block boundaries) is decided by a token's **position in the line** — `*` means
"title" only at column 0. Inline structure (chords `[…]`, escapes `\`, future
markdown `*emphasis*`) lives _inside_ a line, where the very same `*` means something
else entirely. A single character thus carries two meanings depending on where it
sits, and a half-typed document must still parse without throwing.

Three forces shaped the decision: the renderer must own all geometry (ADR-0002), so
the parser should stop before any measurement; the editor is undecided (and must
stay swappable); and chord theory (validity, enharmonic transpose) is a fiddly,
solved domain.

### Options

- **A — Single global tokenizer.** One character-stream lexer emits a flat token
  stream that a parser assembles. The classic compiler shape, but every inline rule
  must carry "am I at line start?" column state, so the lexer becomes
  context-sensitive and the `*` (title-vs-emphasis) ambiguity is resolved in awkward
  lookbehind. A layout-aware variant would also fold in font metrics, duplicating
  what the renderer must own.

- **B — Pure, two-phase, line-oriented semantic parser.** **Phase 1** splits into
  lines, classifies each by shape, and groups blocks; **Phase 2** ("the tokenizer")
  inline-scans only the content portion of content lines. The output is a pure
  **semantic AST** — structure only, chords anchored to a **character index**, no
  font/DOM/canvas — leaving 100% of geometry to the renderer. Chord validity and
  transpose lean on a library (`@tonaljs/chord`). Cost: text layout is the
  renderer's job (more upfront math there), and a chosen highlighting editor keeps
  its own _separate_ highlight grammar.

## Decision

Adopt **Option B**. The parser is pure, two-phase, and semantic.

- **Two phases, never sharing a code path.** Phase 1 = line classification +
  blocking; Phase 2 = inline scan over content text only. A line-start `*` is
  resolved in Phase 1 and never reaches Phase 2, so the title-vs-emphasis collision
  simply does not arise.
- **Pure semantic AST.** `string → AST`, no font/DOM/canvas dependency. Chords are
  anchored by **character index** into a clean per-line `text` string (overlay, not
  interleaved runs); the renderer turns an index into a pixel x via `measureText`
  (ADR-0002). Render settings are never parsed from text (ADR-0001).
- **Single effective title/subtitle**, "last wins"; the parser is **total** (never
  throws) and surfaces problems as structured, localizable warnings.
- **`@tonaljs/chord` for chord validity and transpose** — chord theory is not
  hand-rolled (minimal-deps policy: justified case-by-case). Transpose is a
  source-text rewrite, not an AST transform.
- **Editor-agnostic**, full reparse on a debounce. The specific editor remains an
  open decision; the parser does not depend on it.

The precise grammar (Phase 1/2 rules, chord sub-grammar, escapes, warnings) lives in
`docs/PARSER-GRAMMAR.md`; this record captures only the architecture and its _why_.

## Consequences

- The grammar's two-level nature is mirrored by the two phases, so the `*` collision
  is structurally impossible rather than handled — and each phase is unit-tested in
  isolation.
- `string → AST` purity makes the parser trivially testable and **editor-agnostic**:
  Monaco or CodeMirror can be chosen later without touching it.
- There are deliberately **two tokenizers**: the editor's highlight grammar
  (colouring, local) and `ParserService` (semantics + cross-document diagnostics like
  "shadowed title"). Both are bound to `docs/PARSER-GRAMMAR.md` as their contract and
  must be kept in step.
- One AST feeds screen, PNG, and PDF with no re-parse; transpose and search read the
  same model.
- The renderer carries more layout math (manual text positioning) — an accepted cost,
  consistent with ADR-0002.
- Reversing this (e.g. to a layout-aware or single-pass parser) is a wholesale
  rewrite of the core grammar engine — hence this record.
