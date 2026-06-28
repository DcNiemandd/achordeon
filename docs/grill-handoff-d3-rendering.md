# Grill handoff — D3 Rendering PRD

Two copy-paste blocks. **Part A** is generic (my working prefs — reuse for any grilling
session). **Part B** is the D3-specific task. Paste both together into a fresh session,
or keep Part A around as a reusable preamble.

---

## Part A — Generic grilling prefs (reusable)

```
Working preferences for this grilling session:

- Ask ONE question at a time and always give your recommended answer first; wait for my
  reply before the next question. Grill top-down — decide the highest-in-hierarchy things
  first, then walk down each branch resolving dependencies.
- Use context7 BEFORE asserting any library / framework / CLI behavior — never design on
  memory for a dependency.
- Never run git commit or stage anything. I commit myself. "Save the progress" just means
  write the files to disk.
- Record decisions inline as they crystallize:
  - CONTEXT.md is the glossary / ubiquitous language ONLY — no implementation or
    architecture. Preserve my original wording; only fix factual bugs or add missing parts.
  - Write an ADR (docs/adr/, sequential number) only when a decision is hard-to-reverse
    AND surprising-without-context AND a real trade-off. Otherwise record it as a note in
    the target PRD doc.
  - Keep the docs/PRD.md backlog + dependency graph in step (flip status, add links).
- Challenge my words against the glossary, sharpen fuzzy/overloaded terms into precise
  canonical ones, and stress-test domain relationships with concrete edge-case scenarios.
  Cross-reference claims against the actual code; surface contradictions.
- Naming: "Achordeon" for display, "achordeon" for code/paths/identifiers — never mix.
- Architecture grammar: vertical = feature (an Nx `scope`); horizontal = layer (Nx `type`:
  feature/ui/data-access/domain/util); "module" is informal UX-speak only.
```

---

## Part B — D3 Rendering PRD (specific)

```
/grill-with-docs Grill the D3 Rendering PRD — the SVG rendering layer in the `shared`
scope (RenderService, consumed by songs-preview, stage, audience, and download). This is
the next item after the shared domain floor (R4/R5) was completed. Target doc: create
docs/PRD-RENDERING.md.

Read first: docs/PRD.md (backlog + scope map), CONTEXT.md (one-song-one-page principle,
render settings, aspect ratio), docs/PRD-DOMAIN-MODEL.md (Song/Settings shapes,
resolveSettings, the SETTINGS registry + value-kinds), docs/PARSER-GRAMMAR.md + docs/adr/
0005 (the pure semantic AST the renderer consumes — Block/Line, char-anchored chords,
labelInline), and docs/adr/0002 (SVG render target, Canvas measureText for layout,
cross-browser raster, no foreignObject, base64-inlined fonts).

Honor the established seams: the parser owns structure, the renderer owns ALL geometry
(ADR-0005/0002); settings arrive already-resolved via resolveSettings (ADR-0006) and are
never re-parsed from content (ADR-0001); rendering is shared, not per-feature.

Open questions to drive toward (grill top-down):
- The scale-to-fit-one-page algorithm — how content is measured (measureText on an
  offscreen canvas) and scaled so a song fills a single page with no scrolling.
- Column layout and column breaking; chord-only blocks rendered larger (bridge convention).
- Aspect-ratio handling and crop-to-content; printing to A4/custom while keeping ratio.
- Title position (top vs left as a separate column/row); labelInline rendering.
- Chord-over-character x-positioning from a character index via measureText.
- How ONE renderer feeds three outputs (screen / PNG via drawImage(svg→canvas) / future
  vector PDF) with no second renderer and no re-parse.
```
