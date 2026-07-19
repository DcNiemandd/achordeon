# Achordeon — Rendering PRD (shared rendering)

The visual layer: how a parsed Song (semantic AST) plus already-resolved render
settings become pixels — on screen, as a PNG, and as a vector PDF. The renderer is
**shared** (Nx `scope: shared`), consumed by songs-preview, stage, audience, and
download. Complements `PARSER-GRAMMAR.md` (the AST it consumes), `PRD-DOMAIN-MODEL.md`
(Song/Settings shapes, `resolveSettings`), and ADR-0002 (SVG render target).

> Status: **living / requirements settled (D3).** Settled: the render pipeline + output
> seam (§1–§3); the geometry requirements (§4 scale-to-fit, columns, aspect ratio, title
> region, `labelInline` gutter, chord x-positioning, vertical rhythm, fonts); the
> `RenderPlan` shape + `layout` signature (§5); songbook page chrome (§6). Some §4 policy
> is flagged **experimental / tunable** (gutter, chord-only distribution, spacing
> constants) — the _seams_ are stable; the magnitudes are the author's to tune. The
> layout algorithm itself is authored by hand; implementation tracks under **P1**.

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

> **Portability — two cheap disciplines now, the rest deferred (YAGNI).** The core is
> kept transferable (a future VSCode plugin, embeddable web component / `<iframe>`)
> without building any of that yet. Two near-zero rules pay for themselves immediately
> and make later extraction a file-move rather than a rewrite:
>
> 1. **The geometry core imports no `@angular/*`.** `layout` and `emit` are plain
>    functions; **`@Injectable() RenderService` is a thin adapter** that does DI wiring
>    and delegates. The core must not reach for `inject()`, signals, or RxJS in its
>    logic — that entanglement is the only thing expensive to undo later.
> 2. **`measureText` is injected, not called directly.** `layout(ast, settings, measure)`
>    takes a measurement function/interface (`TextMeasurer`: `width`,
>    `fontBoundingBox{Ascent,Descent}`, …). This is needed **now for testing** — jsdom
>    returns `width: 0`, so a DOM-free seam is what lets geometry be asserted against
>    `RenderPlan` (the §1 testability win) with a fake measurer. Mirrors the
>    `ChordTheory` port (ADR-0008).
>
> **Deferred (true YAGNI):** the separate Nx lib (`shared-render-core`), a `node-canvas`
> / Node measurer, the VSCode-plugin / `<iframe>` packaging, and any multi-class port
> hierarchy — added when a second consumer actually exists. **Caveat for that day:**
> `node-canvas` and browser canvas use different rasterizers, so metrics differ slightly;
> byte-identical cross-env output would require standardizing the measurement backend.
> **No ADR yet** — written the day the core is actually extracted, when the trade-off
> turns real and irreversible.

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
- **Spike result — PASSED (2026-06-29).** A throwaway spike (`svg2pdf.js` 2.7 + `jsPDF`
  4.2, custom TTF via `addFileToVFS`+`addFont`, run headless over a hand-built
  chord-anchored SVG) produced a PDF with **selectable text and an embedded font subset
  (`FontFile2`), no raster image**, and **chord x-positions faithful to the SVG** (chords
  over exact characters, incl. the end-of-line anchor and a same-index group; confirmed by
  eye). Both guardrail conditions met ⇒ **vector is confirmed for v1; raster is the unused
  contingency.** (b) x-positioning was generated from real glyph advances — the production
  path uses the `measureText` port (§5) but the svg2pdf step that consumes those x's is
  proven.
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
  - **`'auto'` has a ceiling — the render box has a minimum size** (`minBoxEm`, a
    **tuning** constant, not a setting). The box is what the medium scales to fill,
    so a box drawn tight around a two-line song is an instruction to magnify it
    enormously — a one-line song printed in letters an inch tall. Below the floor the
    box grows while the content keeps its natural size, so the song gains blank page
    rather than magnification. The floor is on the **short axis** (portrait and
    landscape cap alike) and the ratio is preserved, so §4.1's "the render box's shape
    is the `aspectRatio` setting" still holds. **Applies to `'auto'` only** — a manual
    number is the user overriding the fit deliberately, and stays unclamped.
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

### 4.5 Title region

The Title + Subtitle form one **title block** laid out as a region that is **never a
content column and never balanced** (§4.2). The `columns` count means content columns
only; the title region is reserved first, the content columns fill what remains. Two
orthogonal `song`-scope settings drive it:

- **`titlePosition`** (`select`) — **`'top' | 'left'`**, where the block sits.
- **`titleLayout`** (`select`, default `'stacked'`) — **`'stacked' | 'inline'`**, how
  subtitle relates to title. _(Domain-model ripple: a new registry row, see
  `PRD-DOMAIN-MODEL.md`.)_

The two axes are independent — four combinations, all v1:

- **`top` + `stacked`** — title row, subtitle row beneath it.
- **`top` + `inline`** — title and subtitle on **one** row, side by side.
- **`left` + `stacked`** — two parallel CCW spines: title outer (leftmost), subtitle
  inner (toward content).
- **`left` + `inline`** — title and subtitle on **one** CCW spine line.

**Anchoring (both placements): the title block hugs the top-left corner** — left-aligned
for `top`, top-aligned for the `left` spine; **never centred**.

**`left` spine geometry** — the block is rotated **90° CCW** (`rotate(-90)`): the text
reads **bottom-to-top** (first char at the bottom), glyphs tilted for a head-left read.
The font line-height(s) become the band's **width**; the longer string sets the band's
**height**. Top-aligned, so a title shorter than the content-column height leaves blank
band space **below**.

> Future autofit (§4.4) may relocate the title between `top` and `left`; because the
> region is discrete and non-balancing, this needs no change to the balancing math.

### 4.6 Chord x-positioning (the signature behaviour)

How a `ChordAnchor` (`raw`, `at`, `valid`) becomes a pixel x over its lyric line.
This is the highest svg2pdf guardrail risk (§3) — the PDF spike must reproduce it.

- **Left-edge anchor.** A chord's **left edge** sits at `x = measureText(text.slice(0, at))`
  — the left edge of the anchored character. Chords are **not** centred over the char.
- **End-of-line anchor.** `at === text.length` ⇒ `x = measureText(text)` (full line
  width); the chord floats just past the last glyph.
- **Same-index group.** All anchors sharing one `at` render, in document order, as a
  **single left-aligned run beginning at the anchor x**, members joined by **one space
  in the chord font** (`raw.join(' ')`). The anchor x is the **left edge of the group**;
  members spread rightward. Consequence: `[A][B]c` and `[A B]c` are **byte-identical**
  output — there are no text chars between adjacent brackets, so both parse to two
  anchors at the same `at`. `raw` is rendered verbatim, including invalid annotations
  (`[N.C.]`, `[x2]`), which float in the run like any chord.
- **Different-index collision = overlap allowed (v1).** When a chord is wider than the
  lyric gap to the next anchor (`[Cmaj7]a [G7]b`), the two chord glyphs **overlap**. The
  renderer does **not** shove chords apart and does **not** stretch the lyric to make
  room (§4.1 never reflows). Each chord's left edge stays pinned to its own anchor x,
  because that x marks an exact, distinct character — shoving would lie about which char
  the chord sits over and break both the signature promise and the svg2pdf guardrail.
  Packed overlap is the author's problem (fix with spacing), consistent with "manual
  scale may overflow, no clamp."
  - **The one invariant:** left-edge-at-anchor is absolute; the only rightward spread is
    _within_ a same-index group (whose members legitimately mark the same char).
  - **Future:** a chord-collision / spacing render setting (opt-in min-gap shove). Not v1.
- **Chord row — per line, not uniform.** A chord row is reserved **only above lines that
  carry ≥1 anchor**; a chord-less lyric line is plain lyric height with no empty row
  above it. Row height = chord-font line height (`measureText` ascent+descent). Rationale:
  tighter vertical packing → larger fit scale (serves "one song, one page"), and matches
  standard chord-sheet rendering. **Hide-chords (Audience) stays reflow-safe:** a chorded
  line keeps its reserved row when glyphs are blanked, so nothing reflows; a chord-less
  line never had a row to begin with.

### 4.7 Vertical rhythm

Everything below is computed in **base (scale-1) units** and then scaled uniformly by
the fit (§4.1) — so spacing never drives a reflow.

- **Pitch source = `fontBoundingBox`** (string-independent), never `actualBoundingBox`
  (glyph-tight → line pitch would jitter and baselines wouldn't align across columns).
  A **refinement of ADR-0002** (which named `actualBoundingBox` for line heights); not a
  reversal, so a PRD note, not a new ADR. **Graceful runtime fallback** (no spike needed):
  if `fontBoundingBox{Ascent,Descent}` comes back missing/zero, fall back to
  `actualBoundingBox` + a fixed leading factor.
  - **Lyric line slot** = `lyric.fontBoundingBoxAscent + fontBoundingBoxDescent`.
  - **Chord row** = `chord.fontBoundingBoxAscent + fontBoundingBoxDescent`.
  - **Chorded line** = chord row + lyric slot; **chord-less line** = lyric slot only (§4.6).
  - The chord row **abuts** its lyric slot — no gap between them; the chord's natural
    descent is the breathing room.
- **Spacing magnitudes are tunable internal constants, NOT render settings.** Inter-line
  leading (default factor 1.0, i.e. rely on `fontBoundingBox`) and the inter-block gap
  (≈ one lyric line slot) are constants the author of the renderer tunes to taste; users
  get "bigger text / more air" through scale, columns, and aspect ratio (§4.1), never a
  per-gap knob. Exact values are a visual-tuning detail, deliberately not grilled.

### 4.8 Label layout — the left gutter (`labelInline`)

> v1 default; flagged **experimental** — the author expects to A/B variants here. The
> seam (labels are a per-line `lineOrigin` translation) is stable; the policy below is
> the starting point.

- **Per-column label gutter** = the widest **inline** label (`labelInline: true`) in
  that column, plus a gap. Sized by inline labels **only**.
- **Inline-label block** (`labelInline: true`) — every content line starts at
  `x = gutter`; the label renders **in the gutter** on the first content line's row.
  Continuation lines align under the **content**, not under the label.
- **Two-line-label block** (`labelInline: false`) — **gutter is 0**: the label is on its
  own row at `x = 0`, content rows at `x = 0` below it.
- **Unlabelled block** — `x = 0` (no inline label ⇒ no indent).
- **Net rule:** only inline-labelled blocks indent to the gutter; everything else starts
  at `x = 0`. So an inline-labelled section's body is indented relative to an unlabelled
  one — the indent is the cost of the inline label (the PoC look).
- **Chord x** = `lineOrigin + measureText(text.slice(0, at))`, where `lineOrigin` is the
  gutter for inline-label blocks and `0` otherwise — §4.6 unchanged, just translated.
- **Variants parked (tunable/future):** song-global vs per-block gutter, label left- vs
  right-aligned within the gutter, and a per-line offset.

### 4.9 Chord-only lines & the bridge convention

> Captured from `CONTEXT.md` / `PARSER-GRAMMAR.md`; recommended default, **tunable** —
> not separately grilled. Both are **render properties read off the AST**, not parse types.

- **Chord-only line** (a line whose `text` is empty/whitespace but carries anchors) —
  its chords are **distributed along the line** rather than measured over characters
  (there are none). Default: **packed from the left at a fixed gap** (`chordOnlyGapEm`).
  Justified-across-the-column is the other implemented mode and was the original default,
  changed because it made the gap a function of the column width — the same four chords
  sat inches apart in a one-column song and tight in a three-column one. Exact
  distribution remains a visual-tuning detail.
- **Bridge convention** — a Block whose lines are **all** chord-only renders **slightly
  larger** than normal blocks. Recommended mechanism: a per-block size multiplier applied
  in base units (so the uniform fit still scales the whole song afterward, §4.1). The
  multiplier magnitude is a tunable constant; the **trigger** (all-lines-chord-only ⇒
  bridge) is the fixed rule.

### 4.10 Fonts, chord colour & chord size

- **Font selection is post-v1.** v1 ships **one bundled font**; the `font` setting
  (registry `scopes: ['songbook','song']`) stays as a future capability but is not
  user-selectable in v1. (Scope note: the offline-PWA aspect is an afterthought, not a
  v1 driver — see `PRD.md`/`CONTEXT.md`; font bundling is justified below by **export**,
  not PWA.)
- **The one font is still embedded both ways** — this is core v1, not PWA-dependent:
  - **base64-inlined** into the SVG (`@font-face`) so screen + PNG render identically
    cross-browser (ADR-0002: external font URLs fail in Safari);
  - **registered in jsPDF** (`addFileToVFS` + `addFont`) so the vector PDF has selectable
    text (§3). Each (font × style) is a separate TTF / registration; v1 needs **Regular**
    (and **Bold** if chords or markdown-bold use it). Italic defers with markdown-italic.
  - **Fallback:** SVG `font-family` lists the embedded face then a CSS generic; the PDF
    path has no generic fallback, so a missing registration is a hard §3 guardrail fail.
- **`chordSize`** (registry default `1`) = a **multiplier of the lyric font size**, not an
  absolute size (consistent with §4.1 "font size is never authored" — it's a _ratio_, so
  it's allowed). `1` = chords equal to lyric cap height. It feeds the chord-row height
  (§4.7), so changing it changes vertical rhythm before the uniform fit.
- **`chordColor`** (registry default `#9f1212`) = fill applied to **chord glyphs only**;
  lyrics render in a fixed colour (black) — there is no lyric-colour setting in v1. The
  subtitle is the one other role with a colour of its own (a grey, from the PoC); it is a
  **tuning** constant, not a setting.

> **The v1 look is the PoC's, transcribed.** `DEFAULT_TUNING` in `render-core/tuning.ts`
> carries the HTML/CSS proof-of-concept's magnitudes converted out of px: 16px base,
> chords at **0.7em**, subtitle 1.2em grey, title 1.5em bold, 1.5-slot inter-block gap,
> 1em column gap, 0.25em label gutter. Two consequences worth naming:
>
> - **`chordSize: 1` means "the PoC default" (0.7 × the lyric size), not "the lyric
>   size."** It remains a multiplier of the lyric font size as described above; only the
>   role's base factor moved.
> - **The bundled family is Roboto Mono** (`@fontsource-variable/roboto-mono`, already in
>   the app's build). It is the family `tuning.fontFamily` must name, and the name must
>   match a face the platform has actually loaded — a family nobody loaded measures and
>   draws as the system default, silently.

### 4.11 Padding — the page's white border

A **`padding` setting** (registry default `0.5`, `scopes: ['song']`) reserves a blank
border between the song and the edge of its render box.

- **Unit: em** — a multiple of the base font size, so padding lives in **base units**
  alongside every other magnitude (§4.7) and is carried by the uniform fit. The border is
  therefore always the same size _relative to the text_, at any scale, on any medium. The
  PoC's `padding: 8px` at a 16px base is `0.5`.
- **It is an INSET, not an outset.** `layout` translates every item in by the padding and
  grows the **content** box by twice it on each axis; `fitContent` then wraps that padded
  box at the user's `aspectRatio`. Padding can consequently **never** bend the render box
  away from the shape the user chose — the axiom of §4.1 ("the render box's shape is the
  `aspectRatio` setting, always user-owned") survives intact.
- **An empty song stays a zero box.** Padding is a border around content; with no content
  there is nothing to border, and a page of pure margin is not a render.
- **Not a songbook scope.** The songbook contributes a **print margin** that _adds_ to
  each song's padding rather than overriding it — see §6.

---

## 5. `RenderPlan` — the data structure

The output of `layout` and the input to `emit` — **pure data, no SVG/DOM**, so `emit`
stays a dumb walk and the native-emitter escape hatch (§1) stays open.

```ts
// shared-render-core — pure data, framework-neutral (§1 portability note)
type TextRole = 'title' | 'subtitle' | 'label' | 'lyric' | 'chord';

interface TextItem {
  text: string;
  x: number; // baseline-LEFT origin, BASE (pre-fit) units
  y: number; // baseline y, base units
  role: TextRole; // → styles[role]; the only thing emit branches on
  rotate?: -90; // title CCW spine only (§4.5); absent = upright
}

interface TextStyle {
  family: string;
  sizePx: number;
  weight: 'normal' | 'bold';
  fill: string;
}
interface EmbeddedFont {
  family: string;
  weight: 'normal' | 'bold';
  base64: string;
} // SVG @font-face + jsPDF addFont

interface RenderPlan {
  box: { width: number; height: number }; // render box = aspect-ratio crop → SVG viewBox
  fit: number; // uniform content→box scale (§4.1)
  origin: { x: number; y: number }; // top-left of scaled content in the box (hugs top-left, §4.5)
  items: TextItem[]; // EVERYTHING to draw, base units
  styles: Record<TextRole, TextStyle>; // resolved per-role style
  fonts: EmbeddedFont[]; // the bytes, embedded both ways
}
```

**The `layout` call — `measure` is bound once, not passed per render.** `measure` is a
set-once **platform dependency** (a port); `opts` is per-render runtime state. Their
lifetimes differ, so `measure` is bound via factory/DI and never sits beside `opts`:

```ts
// pure core — measure stays explicit (trivially testable with a fake)
function layoutCore(ast: Song, settings: GlobalSettings, measure: TextMeasurer, opts?: { hideChords?: boolean }): RenderPlan;

// portable surface — bind the platform measurer once
const layout = createLayout(measure); // → (ast, settings, opts?) => RenderPlan

// Angular surface — the @Injectable() IS the partial application
@Injectable()
class RenderService {
  constructor(private measure: TextMeasurer) {}
  layout(ast: Song, settings: GlobalSettings, opts?: { hideChords?: boolean }) {
    return layoutCore(ast, settings, this.measure, opts);
  }
}
```

- **`measure`** — the `TextMeasurer` port (§1 portability note): `text + font → { width,
fontBoundingBoxAscent, fontBoundingBoxDescent }`. The **only** way `layout` obtains pixel
  metrics; no direct canvas/DOM. Bound once (DI or `createLayout`), so the per-render call
  is `layout(ast, settings, opts?)`. The pure core keeps it explicit.
- **`opts`** — viewer options, **not** settings. v1: `{ hideChords?: boolean }`.

**Design choices baked in:**

- **Coords in base (pre-fit) units; one transform applies the fit.** `emit` wraps all
  items in `<g transform="translate(origin) scale(fit)">` and writes raw `x/y`. The plan
  is scale-independent → tests assert "chord `C` at base-x ≈ 42.3" with no scale math (the
  §1 testability win). The songbook **outer** fit (§4.3) is a _second_ transform applied
  by `DownloadService` when composing pages — **not** in the per-song plan.
- **Flat positioned `items`, not a block/column tree.** Every geometry rule (same-index
  groups §4.6, chord-only distribution §4.9, gutter offset §4.8) is already resolved into
  concrete `x/y` by `layout`; `emit` needs no structure.
- **`hideChords` lives in `layout`, reflow-proof.** Chord-row reservation is driven by the
  **AST** (does the line carry anchors? §4.6), never by the flag — so all lyric `y` are
  identical with or without chords. `hideChords: true` reserves the rows the same but
  **omits the chord `TextItem`s** from `items`. Toggling = re-run `layout` (cheap, pure);
  no second hiding pathway. (Assumes the audience client **re-renders locally** from synced
  content + settings; a pre-rendered-SVG delivery would instead need a CSS-hideable chord
  group — an audience-sync concern, out of scope here.)
- **`fonts` carries the bytes** so the SVG is self-contained for headless export (§2) and
  the same asset feeds jsPDF (§3). `emit`'s own option is `{ inlineFonts }` (§2): screen
  may skip inlining, export must inline.

---

## 6. Songbook page chrome & print-dialog options

Page chrome is a **`DownloadService` concern, never in the per-song `RenderPlan`/SVG** —
that boundary is what guarantees a page number can never collide with song content (§4.3).
`DownloadService` composes the document (title page → optional summary → song pages) and
stamps chrome into the **margins**; each song SVG stays pure.

**Print-dialog options** (download-time options, **not** render settings — they don't
cascade or persist on entities, so they stay **out of the SETTINGS registry**, alongside
`hideChords` / `inlineFonts`):

| Option                   | v1            | Notes                                                             |
| ------------------------ | ------------- | ----------------------------------------------------------------- |
| **Page size**            | ✅ option     | A4 / Letter / … — sets the page; slot = page − margins.           |
| **Page margins**         | ✅ option     | In em, like `padding`. **Adds to** each song's `padding` (§4.11). |
| **Title page visible**   | ✅ toggle     | Built from the Songbook's Title / Subtitle / Author.              |
| **Summary visible**      | ✅ toggle     | The setlist as a contents page (CONTEXT §Summary list).           |
| **Page number visible**  | ✅ toggle     | —                                                                 |
| **Page number position** | ✅ option     | `left \| center \| right` in the **bottom** margin.               |
| **Multiple songs/page**  | 🔮 **not v1** | One song per page in v1 ("one song, one page"); multi-up later.   |

- **Composition order:** title page (if visible) → summary (if visible) → song pages, one
  song per page (outer fit, §4.3).
- **Numbering:** page-number position is horizontal (`left/center/right`); vertical is the
  **bottom margin** (fixed in v1). Numbering starts at the first **song** page = `1`; the
  title page and summary are **unnumbered** (tunable).
- **Margins add, they do not override.** The songbook's page margin and a song's `padding`
  (§4.11) are the **same quantity at two levels**, and the printed border is their **sum**.
  This is deliberately _not_ the settings cascade (ADR-0006), and that is why the margin is
  a **print-dialog option and `padding` is NOT a songbook-scope setting**: a songbook says
  "every song in this book gets this much extra air on the page", which is an addition to
  whatever breathing room the song already asked for — not a replacement for it. A song
  that wants a generous border keeps it inside a tightly-margined book.
  - Mechanically: the song's `padding` is inside its per-song `RenderPlan` (the inner fit,
    §4.3); the page margin is applied by `DownloadService` when it sizes the page slot (the
    outer fit). Two transforms, one visual result. Both are in em against the same base
    size, which is what makes "add" meaningful.
- **Page size / number toggle+position / title-page / summary / margins** are v1 dialog
  options; **multi-song-per-page is deferred.**
