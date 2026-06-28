# Achordeon — Rendering PRD (shared rendering)

The visual layer: how a parsed Song (semantic AST) plus already-resolved render
settings become pixels — on screen, as a PNG, and as a vector PDF. The renderer is
**shared** (Nx `scope: shared`), consumed by songs-preview, stage, audience, and
download. Complements `PARSER-GRAMMAR.md` (the AST it consumes), `PRD-DOMAIN-MODEL.md`
(Song/Settings shapes, `resolveSettings`), and ADR-0002 (SVG render target).

> Status: **living / in progress (D3).** Settled: the render pipeline + output seam
> (§1–§3). Open: the geometry algorithm (scale-to-fit, columns, aspect ratio,
> title position, `labelInline`, chord x-positioning) — being grilled as
> _requirements_; the layout algorithm itself is authored by hand.

Repo-root `docs/`, not the published Docusaurus site.

---

## Honoured seams (inputs)

The renderer sits below every feature and above nothing it controls:

- **The parser owns structure; the renderer owns ALL geometry** (ADR-0005, ADR-0002).
  Input is the **pure semantic AST**: `Block`/`Line`, `text` strings with chords
  anchored by **character index** (`ChordAnchor.at`), `labelInline`, `valid` per
  anchor. No font/DOM/canvas info crosses this line — the renderer turns a character
  index into a pixel x itself, via `measureText`.
- **Settings arrive already-resolved** (`resolveSettings`, ADR-0006). The renderer
  receives a complete `GlobalSettings`-shaped value (every key present) and **never**
  re-runs the cascade and **never** re-parses settings out of content (ADR-0001).
- **Rendering is shared, not per-feature.** One renderer; no feature ships its own.

---

## 1. Pipeline — two internal stages, one geometry brain

`RenderService` is split into two stages that never share a code path:

```
layout(ast, settings) ─► RenderPlan ─► emit(plan, opts) ─► SVG string
        (the brain)                       (dumb serializer)
```

- **`layout(ast, settings) → RenderPlan`** — the geometry brain. Runs every
  `measureText` call against an **offscreen** canvas; does scale-to-fit, column
  breaking, and computes absolute `(x, y)` for every line, chord glyph, title, and
  label. Output is a **pure data structure** — positioned boxes + text + resolved
  pixel anchors. No SVG, no DOM, no mounted element.
- **`emit(plan, opts) → string`** — the serializer ("emitter"). A dumb walk over
  `RenderPlan` that writes SVG markup. Makes **no layout decisions** and calls
  `measureText` **never**. One emitter per output syntax; today there is exactly one
  (SVG).

**Why the explicit `RenderPlan` seam** (vs. AST → SVG-string in one pass):

- **Testable geometry.** Assertions read `RenderPlan` (`chord "C" at x≈42.3, y≈18`)
  instead of regex-scraping SVG strings — same purity ethos as the parser (ADR-0005).
- **One geometry engine, many outputs.** The three outputs (§2) all derive from the
  single `layout` pass; nothing re-measures and nothing re-parses.
- **Escape hatch (not built).** A future _native_ vector-PDF path could be a second
  emitter walking the **same** `RenderPlan` (`emitPdf(plan)`), with no second layout
  engine. Kept possible by the seam; **not** implemented (see §3).

## 2. One renderer, three outputs — emitters vs. sinks

Not every "format" is a peer emitter. Most are **sinks** layered on the one SVG:

| Output           | Consumes    | Mechanism                           |
| ---------------- | ----------- | ----------------------------------- |
| **Screen**       | the SVG     | mount a live `<svg>` in the DOM     |
| **PNG**          | the **SVG** | `drawImage(svg → offscreen canvas)` |
| **PDF (vector)** | the **SVG** | `svg2pdf.js` + jsPDF (see §3)       |
| **ZIP**          | the PNGs    | pack image files                    |

Only a hypothetical _native_ PDF would be "a different emit." PNG / PDF / ZIP are
**post-processors of the one SVG** — which is the entire point of ADR-0002: PNG comes
free from the browser rasterizing your SVG. Modelling PNG as a `RenderPlan → PNG`
emitter would mean hand-writing a rasterizer — the very `html2canvas`-redraw path
ADR-0002 rejected.

**Service boundary (per `PRD-INFRASTRUCTURE.md` §1):**

- **`RenderService`** (shared) — `layout` + `emit` SVG. Produces a **self-contained
  SVG string** and exposes the `RenderPlan`. Screen and audience consume this
  directly.
- **`DownloadService`** — the **format facade** (`toPng`, `toPdf`, `toZip`,
  multi-page / songbook). Orchestrates `RenderService` + rasterize + pack.

**The renderer is headless ("business-only").** It must **not** read a mounted DOM
node. The emitted SVG is fully self-contained — **fonts base64-inlined** (ADR-0002:
Safari fails on external font URLs) — so DownloadService can render songs **offscreen,
in a loop**, for a songbook PDF/ZIP whose songs are never on screen. (This is the
defect in the HTML/CSS PoC, which printed the live mounted node and so could only ever
export what was visible.)

> **Screen SVG vs. export SVG differ in one way:** export **must** base64-inline
> fonts; screen may use CSS-loaded fonts. Same emitter, an `inlineFonts` option.

## 3. PDF is vector in v1 — raster dropped (SSOT)

**This section is the single source of truth for the PDF pipeline decision and its
guardrail. Other docs link here; none restate it.**

- **v1 PDF = vector**, produced by feeding the one SVG to **`svg2pdf.js` + jsPDF**.
  Fonts are embedded in the PDF via jsPDF `addFont` / `addFileToVFS` (TTF), so PDF
  text is **selectable**, not outlined. The same font assets thus serve two
  mechanisms: **base64-inlined in the SVG** (for screen/PNG) and **registered in
  jsPDF** (for PDF).
- **Raster PDF is dropped** as the default. PNG is **not** dropped — it remains for
  single-image download and ZIP-of-images.
- **Guardrail.** The first render spike must prove `svg2pdf.js` faithfully reproduces
  (a) per-glyph **chord-over-character x-positioning** and (b) **font embedding as
  selectable text**. If the spike fails, raster-PDF (PNG-into-pages via jsPDF/pdf-lib)
  is the documented **fallback** — but vector is the plan and raster is the
  contingency, not the default.
- **One emitter in v1.** `RenderPlan → emit → SVG`. A native `emitPdf(plan)` is the
  documented escape hatch only if `svg2pdf.js` cannot meet the guardrail; it is **not**
  built speculatively.

---

## 4. Geometry — requirements (in progress)

> Being grilled as behavioural requirements; the algorithm is authored by hand.
> More sections land here as decisions crystallize: column layout + breaking,
> title position, `labelInline`, chord-only sizing (bridge convention), chord
> x-positioning via `measureText`.

### 4.1 Boxes and the single scale

- **Content box** — the bounding box of laid-out content (columns placed) at the
  renderer's base reference size. **Medium-independent** — the same for a phone
  screen, A4, or a songbook slot.
- **Render box** — the target box. Its **shape is the `aspectRatio` setting**, which
  is **always user-owned** (never auto, not even by future autofit).
- **Fit scale — the one scale.** A single **uniform** scale maps the content box onto
  the render box. Because SVG scales vectorially, this scales text + chords together
  and **never reflows** — changing scale never re-wraps a line or re-balances columns.
  - `scale` setting = **`'auto' | number`, default `'auto'`**. `'auto'` → the largest
    uniform scale that fits the content box inside the render box. A manual number →
    uniform override that **may overflow (user's problem; no clamp)**.
  - **There is no type/font scale.** Font size is never authored. "Bigger text" =
    fewer columns, a render-box ratio nearer the content, or a manual `scale` beyond
    fit (accepting overflow).
- **Raster scale** — export-only DPI knob (the PoC's `smallerSide = 1920px`), so a
  rasterized PNG is sharp. A `DownloadService` concern; **not** layout, **not** a
  render setting, has no effect on geometry.

> **Domain-model ripple (synced):** `PRD-DOMAIN-MODEL.md` `scale` changes from
> `default: 1` to `default: 'auto'`, and its meaning changes from a font multiplier to
> a uniform content-box scale (`select-or-custom` kind: `'auto'` preset + custom
> number).

### 4.2 Columns

- **The author sets the column _count_** (the `columns` setting); the renderer
  chooses **where** columns break. No column-break marker exists in content
  (ADR-0001; the parser grammar has no such token).
- **A Block is atomic** — never split across a column boundary. Break points fall
  **only at Block boundaries**; a Block moves to the next column wholesale.
- **Breaks balance the columns** — chosen to **minimize the tallest column**, because
  the tallest column _is_ the content-box height, and minimizing it **maximizes the
  uniform fit scale**. Document order is preserved (column 1 top-to-bottom, then
  column 2…); balancing only picks which Block boundaries become breaks.
- Computed in **base (scale-1) units**, independent of the final fit scale — no
  circular dependency (assignment → content box → scale flows one way).
- **Over-tall single Block** (taller than one balanced column / the page): v1 accepts
  the fallout — the Block dominates its column and the fit scale shrinks the whole
  song. A dedicated **overflow** strategy (the Block overflowing rather than shrinking
  the song) is a **future renderer upgrade**, not v1. (Scrolling for over-long songs
  is likewise future, per `CONTEXT.md`.)

### 4.3 Songbook — two uniform fits

Two nested uniform scales, no re-layout between them (one `RenderPlan` per song,
placed):

- **inner** — content box → render box (the fit scale above), per song.
- **outer** — render box → songbook **page slot** (the A4 page minus margins).

Page numbers live in the page **margin** and are **never part of a song's render**
(songbook branch; grilled later) — so a number can never collide with song content.

### 4.4 Future — autofit (not v1)

Varies **columns + title position only** to best fill the user's fixed-ratio render
box (minimize the content-box ↔ render-box gap). It **never changes the aspect
ratio** — that stays user-owned. v1 = manual columns + title position + ratio, slack
accepted.
