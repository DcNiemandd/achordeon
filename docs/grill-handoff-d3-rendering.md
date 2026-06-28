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

## Part B — D3 Rendering PRD (resume)

`docs/PRD-RENDERING.md` **exists** — the architecture + scale + column branches are
settled. This block resumes the grill at the remaining geometry nodes.

```
/grill-with-docs Resume the D3 Rendering PRD grill — the SVG rendering layer in the
`shared` scope (RenderService, consumed by songs-preview, stage, audience, download).
Target doc: docs/PRD-RENDERING.md (already exists — continue it, don't recreate).

Read first: docs/PRD-RENDERING.md (what's settled), docs/PRD.md (backlog; D3 = 🔵),
CONTEXT.md (one-song-one-page, render settings, aspect ratio), docs/PRD-DOMAIN-MODEL.md
(Song/Settings shapes, resolveSettings, SETTINGS registry — note scale is now
'auto'|number), docs/PARSER-GRAMMAR.md + docs/adr/0005 (pure semantic AST: Block/Line,
char-anchored chords by index, labelInline), docs/adr/0002 (SVG target, measureText
layout, drawImage raster, no foreignObject, base64 fonts), docs/adr/0001 + 0006
(settings in metadata, already-resolved cascade).

Honor the established seams: parser owns structure, renderer owns ALL geometry
(ADR-0005/0002); settings arrive already-resolved via resolveSettings (ADR-0006), never
re-parsed from content (ADR-0001); rendering is shared, not per-feature.

ALREADY SETTLED (in PRD-RENDERING.md — do NOT re-grill, build on these):
- §1 Pipeline: layout(ast,settings)→RenderPlan (geometry brain, all measureText here)
  → emit(plan,opts)→SVG string (dumb serializer). RenderPlan is the test surface +
  escape hatch for a future native emitter.
- §2 Emitters vs sinks: ONE emitter (SVG). PNG/PDF/ZIP are sinks over the one SVG.
  RenderService (shared) = layout + emit SVG + expose RenderPlan; DownloadService =
  format facade (toPng/toPdf/toZip, multi-page). Renderer is HEADLESS — emits a
  self-contained SVG string (fonts base64-inlined), never reads a mounted DOM node, so
  songbook export can render offscreen in a loop. API: toPdf(render(song)) functional,
  render→RenderedSong{plan,svg,fonts}; NOT fluent render().toPdf().
- §3 PDF = VECTOR in v1 (svg2pdf.js + jsPDF, fonts via addFont = selectable text);
  raster dropped; PNG stays. Guardrail (SSOT here): first spike must prove svg2pdf
  reproduces chord-over-char x-positioning + font embedding, else raster fallback.
- §4.1 Boxes + ONE uniform fit scale (content box → render box; vector, NEVER reflows).
  scale setting = 'auto'|number, default 'auto' (max fit) / manual may overflow (no
  clamp). NO type/font scale. Raster scale = export DPI, DownloadService only. Aspect
  ratio ALWAYS user-owned. Domain model synced (scale default 1 → 'auto').
- §4.2 Columns: author sets COUNT; renderer chooses break points (no authored breaks).
  Block is ATOMIC (never split across columns). Breaks BALANCE columns (minimize
  tallest = maximize fit scale), document order preserved, computed in base units.
  Over-tall block overflow = future upgrade.
- §4.3 Songbook = two uniform fits (inner content→render box, outer render box→page
  slot). Page numbers live in page margin, never in song render (songbook branch).
- §4.4 Future autofit (NOT v1): varies columns + title position only; never aspect ratio.

REMAINING NODES (grill top-down, one question at a time, recommend first):
1. Title position — top vs left-as-column/row; is the title a pseudo-column? how it
   interacts with the balanced column model.
2. labelInline rendering — label+content one line vs label-then-content two lines.
3. Chord-only line / block sizing — bridge convention ("slightly larger" — how much;
   chords distributed across width).
4. Chord x-positioning — x = measureText(text.slice(0, at)); end-of-line anchor
   (text.length); multiple chords at one index; chord row height. (Signature behaviour;
   highest svg2pdf guardrail risk — consider first.)
5. Vertical rhythm / line metrics — line height from measureText ascent/descent, chord
   row above each lyric line, inter-block spacing.
6. Fonts — the font setting, base64-inline mechanics + fallback; chordColor/chordSize.
7. RenderPlan shape — the actual data structure to implement against.
8. Songbook page chrome — margins + page numbers (deferred from §4.3).
```
