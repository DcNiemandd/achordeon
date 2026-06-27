# 2. The renderer targets SVG, not HTML/CSS

Date: 2026-06-27

## Status

Accepted

## Context

A Song renders to a single page ("one song, one page") with chords positioned
above exact character positions, scaled to fit an aspect ratio. That rendered
output must reach three places: the on-screen preview, an image download (PNG),
and a PDF (single, multi-page, and songbook). The renderer is built from scratch.

The proof-of-concept rendered HTML/CSS and rasterized it to PNG, which **only
worked in Chromium**. The cause is the rasterization technique: DOM-to-image
libraries (`html-to-image`, `dom-to-image`) wrap the HTML in an SVG
`<foreignObject>` and rasterize that, and `<foreignObject>` has long-standing bugs
in Safari/WebKit and Firefox (tainted canvas, fonts not applied, blank output).
So the render target and the cross-browser-export problem are the same decision.

A second force: we want, eventually, a **vector** PDF (selectable text, crisp
print) and to let the user choose a raster-vs-vector pipeline — without
maintaining two separate renderers.

### Options

- **A — HTML/CSS render + canvas-redraw rasterizer (`html2canvas-pro`).** Build
  the layout in normal DOM/flexbox; rasterize with a library that re-draws the DOM
  onto a canvas (no `foreignObject`), so PNG works cross-browser. Easiest layout
  authoring. But the rasterizer re-implements CSS, so fidelity gaps must be
  validated for chord positioning; and a vector PDF still requires a _separate_
  renderer that draws into the PDF directly — a second layout engine to keep in
  sync.

- **B — SVG render target.** One renderer emits SVG. The same SVG drives the
  on-screen view, the PNG (rasterized via `drawImage(svg → canvas)`, **no
  `foreignObject`** → cross-browser), and a future vector PDF (SVG → PDF, e.g.
  `svg2pdf.js`). Cost: laying out text in SVG is manual — you compute every glyph
  position yourself rather than leaning on CSS flow.

## Decision

Adopt **Option B**. The renderer is a from-scratch **SVG** renderer.

- On-screen preview = the SVG.
- Image download = SVG rasterized to PNG via an offscreen canvas (`drawImage`),
  with **fonts inlined as base64** (Safari fails on external font URLs). This works
  in every browser, removing the Chromium-only limitation.
- PDF v1 = the PNG embedded into pages via `pdf-lib`/`jsPDF` (raster). PDF later =
  vector straight from the SVG, enabling a user-chosen raster-vs-vector pipeline
  from the _same_ renderer.
- Layout metrics = native Canvas `measureText()` against an offscreen canvas
  (`.width`, `actualBoundingBox{Ascent,Descent}`) for line heights, chord
  x-positions, column breaks, and the scale-to-fit / aspect-ratio math. No
  third-party measurement library.

## Consequences

- The chord-over-exact-character model is native to SVG (absolute glyph
  placement), so the domain that made CSS awkward makes SVG natural.
- Cross-browser PNG export is solved at the architecture level, not patched per
  browser; "PNG, Chromium-only" stops being a limitation.
- A single renderer feeds screen + raster + vector — no second layout engine, no
  divergence risk; the future "choose your pipeline" feature is cheap.
- Fonts must be inlined for export to be reliable; this is a hard requirement, not
  an optimization.
- More upfront layout math (manual text positioning) than CSS would need. Since
  visuals are being built after the infrastructure, committing the render target
  now is the right time.
- Reversing this later means rewriting the renderer wholesale — hence this record.
