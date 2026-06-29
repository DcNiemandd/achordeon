# 10. CodeMirror 6 is the editor, behind a loose-coupling seam

Date: 2026-06-29

## Status

Accepted

## Context

The Song authoring surface (D1, `songs` scope) needs a **highlighting code
editor**, not a plain `<textarea>`: the product wants syntax colouring of the
Achordeon markup plus inline warning underlines (shadowed title/subtitle, etc.).
`PARSER-GRAMMAR.md` settled the editor-facing contract — the editor consumes a pure
`ParserService` (string → AST, ADR-0005) and needs exactly four hooks: a highlight
grammar, diagnostic markers, a reparse trigger, and programmatic insert-at-cursor.

Two candidates were on the table: **Monaco** (the VS Code editor) and **CodeMirror
6**. The original parser doc kept Monaco alive on one premise — "the editor the
author already knows." During grilling that premise collapsed: the author does not
in fact know Monaco well, so both editors are an equal learning curve, and Monaco's
only differentiator was withdrawn. Every remaining axis then pointed the same way:

- **Offline PWA bundle.** Achordeon is a service-worker-precached offline PWA.
  Monaco is MB-scale and ships separate web-worker bundles that must be precached and
  re-fetched on update; CodeMirror 6 is tree-shaken ES modules (tens of KB, no
  workers, single bundle).
- **Angular 21 integration.** Monaco's official integration is worker plumbing
  (`self.MonacoEnvironment.getWorker(Url)` + bundler-specific worker config); the
  community Angular wrappers historically lag Angular majors, and this app is on a
  bleeding-edge Angular 21. CodeMirror 6 is framework-agnostic — `new EditorView({
parent })` in `ngAfterViewInit`, `view.destroy()` in `ngOnDestroy` — no workers,
  no wrapper dependency, no version-lag risk.
- **IDE features are irrelevant.** Monaco's strengths (IntelliSense, minimap,
  multi-cursor, diff) are large-codebase IDE features. A Song is a tens-of-lines
  custom DSL; none of them apply. On the actual feature list (highlight + warning
  underlines + insert buttons) the two editors are a tie.
- **Touch / future phone editing.** CodeMirror 6 advertises mobile-optimised editing
  over native platform features; Monaco is documented as unsupported on mobile
  browsers. v1 authoring is desktop-first, but this keeps a future phone-editing
  option open at zero extra cost.

## Decision

**Adopt CodeMirror 6 as the Achordeon editor, in the `songs` scope, behind a loose
coupling seam.** The editor is a replaceable detail, not a load-bearing dependency.

- **Keep the editor loosely coupled.** The rest of the app must not import or know
  about CodeMirror. The editor lives behind a thin Angular component (the editor
  _adapter_) that depends only on the editor-agnostic contract already defined in
  `PARSER-GRAMMAR.md`: it feeds editor content to the pure `ParserService` and maps
  the resulting AST + warnings onto the four hooks (highlight grammar, diagnostic
  markers, reparse trigger, insert-at-cursor). No CodeMirror type crosses that
  boundary. This is the same quarantine discipline as the `ChordTheory` port
  (ADR-0008): the third-party engine sits in one place and the domain stays pure.
- **Highlighting via a CodeMirror stream parser, not a Lezer grammar.** The
  two-phase, line-oriented Achordeon grammar maps directly onto a lightweight stream
  parser; a full Lezer grammar is unnecessary weight. (The semantic, cross-document
  diagnostics — e.g. shadowed title — remain in `ParserService`, never in the
  highlighter, which is colouring-only and local.)
- **Own the theming.** CodeMirror 6 ships neutral; styling it to match Achordeon
  (rather than looking like an embedded code IDE) is deliberate work we take on, in
  exchange for control.

The editor's _internal_ design — highlight grammar rules, insert-button behaviour,
marker wiring — is **not** settled here; it is the subject of `PRD-EDITOR.md`. This
ADR settles only the editor choice and the coupling discipline around it.

## Consequences

- **The choice is reversible by design, and must stay that way.** Because no
  CodeMirror type escapes the adapter and `ParserService` is pure and editor-
  agnostic, swapping editors later is a rewrite of one adapter library — the four
  hooks plus theming and highlight grammar — not of the domain, the parser, or their
  tests. The loose-coupling rule is what keeps this true; if app code starts
  importing CodeMirror directly, that property is lost. **Treat a CodeMirror import
  outside the editor adapter as a defect.**
- The accumulated CodeMirror-specific code (stream-parser highlight grammar, theme,
  marker and insert-button wiring) is real sunk cost on a swap — bounded, but not
  free. That is the accepted price of picking a concrete editor at all.
- The offline PWA stays light: no editor web-workers to precache, a small bundle, and
  a cleaner service-worker update story (D5).
- Phone editing is left as a free future option rather than a v1 commitment; v1
  authoring is desktop-first.
