// RenderService — Epic 5 ▸ subtask 6
// Spec: PRD-RENDERING §1 (portability), §2 (screen vs export), §5 (the `layout` call)

import { Injectable, inject, signal, type Signal } from '@angular/core';
import {
  DEFAULT_BODY_FONT,
  DEFAULT_TUNING,
  createCanvasMeasurer,
  createLayout,
  emit,
  resolveFonts,
  type FontCatalog,
  type FontId,
  type Layout,
  type RenderOpts,
  type RenderPlan,
} from '@achordeon/shared/render-core';
import {
  ChordTheory,
  respellChords,
  type ChordNotation,
  type GlobalSettings,
  type SongAst,
} from '@achordeon/shared/domain';
import { FontLoader } from './font-loader';

/**
 * AST + resolved settings → SVG (PRD-RENDERING §2). Screen, PNG and PDF all come
 * from this one string; nothing re-measures and nothing re-parses.
 *
 * **The `@Injectable()` IS the partial application** (§5): `measure` is a
 * set-once platform dependency, bound here, so every render call is
 * `layout(ast, settings, opts)`. The geometry itself is pure and lives in
 * `shared/render-core`, which imports no `@angular/*` — this class holds the DI
 * wiring and delegates. That discipline is what keeps a future VSCode plugin or
 * embedded viewer a file-move rather than a rewrite.
 *
 * **Settings arrive already resolved.** The cascade is `resolveSettings`'
 * business (ADR-0006); the renderer receives a complete `GlobalSettings`-shaped
 * value and never re-runs it, and never parses settings out of content
 * (ADR-0001).
 */
/**
 * The families one render draws with, as catalog ids: the body face, plus its
 * title choice where that is a family of its own.
 *
 * Asked of the catalog rather than derived from the setting, so an alias, an
 * unknown id and the `body` sentinel all resolve exactly the way the geometry
 * will resolve them — the two lists cannot drift.
 */
function familiesFor(settings: GlobalSettings, catalog: FontCatalog): FontId[] {
  const fonts = resolveFonts(
    catalog,
    { title: settings.titleFont as FontId },
    DEFAULT_TUNING,
  );
  return [DEFAULT_BODY_FONT, ...(fonts.title.id ? [fonts.title.id] : [])];
}

@Injectable({ providedIn: 'root' })
export class RenderService {
  /**
   * One measurer for the app: it caches per `(font, text)`, and the whole point
   * of that cache is that the same tokens are measured again on every reflow and
   * every batch export.
   */
  private readonly measurer = createCanvasMeasurer();

  /**
   * The bundled faces (§4.10). Every render asks it for the faces its own
   * settings named, so a plan carries the bytes for the title font *this song*
   * chose and no others.
   */
  private readonly fontLoader = inject(FontLoader);

  /**
   * Only to spell chords (`notation`). The renderer asks no theory question
   * of its own — it draws what the AST says — but "what is this chord called in
   * German" is a naming question, and naming is the last thing that happens
   * before a symbol is drawn.
   */
  private readonly theory = inject(ChordTheory);

  private readonly layoutWith: Layout = createLayout(this.measurer, {
    fonts: this.fontLoader.resolver,
    catalog: this.fontLoader.catalog,
  });

  /**
   * Flips once the page's web fonts have settled.
   *
   * The bundled family is CSS-loaded, so on the first frame it does not exist
   * yet and the canvas measures the *fallback* font instead. Those metrics are
   * wrong by a few percent, which is enough to drift every chord off its
   * character — and the measurer memoises, so without this they would stay wrong
   * for the whole session. When the font lands we drop the cache and bump this
   * signal; `layout` reads it, so every render `computed` re-runs against the
   * real face by construction. Consumers opt in to nothing.
   */
  private readonly fontEpoch = signal(0);

  /** Exposed so a caller can tell a first-frame render from a settled one. */
  readonly fontsReady: Signal<boolean> = (() => {
    const ready = signal(false);
    // `document.fonts` is absent in jsdom and on very old engines; there, the
    // first measurement is simply the only one, which is the old behaviour.
    const fonts = (
      globalThis as { document?: { fonts?: { ready?: Promise<unknown> } } }
    ).document?.fonts;
    void fonts?.ready?.then(() => {
      this.measurer.clear();
      this.fontEpoch.update((n) => n + 1);
      ready.set(true);
    });
    return ready.asReadonly();
  })();

  /** The geometry, as pure data — what tests assert against (§1). */
  layout(
    ast: SongAst,
    settings: GlobalSettings,
    opts?: RenderOpts,
  ): RenderPlan {
    this.fontEpoch(); // re-render when the real font arrives (see `fontEpoch`)
    this.fontLoader.epoch(); // …and again for each bundled face that lands
    // A title face is fetched on first use (Epic 11's precache split), so the
    // first render of a serif-titled song legitimately has no bytes for it. Ask
    // now, re-render when it lands — which the epoch above makes automatic.
    void this.fontLoader.ensure(familiesFor(settings, this.fontLoader.catalog));
    // The one place chords are named (see `respellChords`). Here rather than in
    // the parser so the editor keeps showing the source as written, and here
    // rather than in each caller so screen, PNG, PDF and the songbook exports
    // cannot disagree. `?? 'english'` for a settings bag written before the key
    // existed — the reader is never handed an incomplete cascade, but tests and
    // hand-built bags are a different matter.
    const notation = (settings.notation ?? 'english') as ChordNotation;
    return this.layoutWith(
      respellChords(ast, notation, this.theory),
      settings,
      opts,
    );
  }

  /**
   * Every face these settings will draw with, really loaded.
   *
   * The screen may render a frame in a fallback and correct itself; a downloaded
   * file cannot, and a PDF has no fallback at all (§3). So every export path
   * awaits this before it lays anything out.
   */
  async ensureFonts(settings: readonly GlobalSettings[]): Promise<void> {
    await this.fontLoader.ensure(
      settings.flatMap((one) => familiesFor(one, this.fontLoader.catalog)),
    );
  }

  /**
   * A plan → a self-contained SVG string.
   *
   * Separate from `layout` because callers want the plan too: the preview reads
   * the plan's box for the page's aspect ratio, and Epic 7 walks the same plan
   * for PDF. `emit` is a dumb serializer — it makes no layout decisions and calls
   * `measure` never (§1) — so emitting twice from one plan is cheap and, more to
   * the point, cannot disagree with itself.
   *
   * `inlineFonts` is the only difference between the screen SVG and the export
   * one (§2). Screen leaves it off and relies on the CSS-loaded face; export
   * base64-inlines the bytes, because Safari will not fetch an external font
   * from inside an SVG (ADR-0002) and a downloaded file has no CSS to lean on.
   */
  emit(plan: RenderPlan, inlineFonts = false): string {
    return emit(plan, { inlineFonts });
  }

  /** Layout + emit, for callers that only want the picture. */
  toSvg(
    ast: SongAst,
    settings: GlobalSettings,
    opts?: RenderOpts,
    inlineFonts = false,
  ): string {
    return this.emit(this.layout(ast, settings, opts), inlineFonts);
  }
}
