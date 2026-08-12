// FontLoader — Epic 7 ▸ subtask 8 (real font bytes, for N faces)
// Spec: PRD-RENDERING §3 (jsPDF registration), §4.10 (embedded both ways,
// bundled catalog), ADR-0002 (Safari will not fetch a font from inside an SVG),
// ADR-0017 (the catalog is one keyed table).
//
// One fetch, three consumers. A face is loaded once as raw TTF bytes and then:
//
//   - registered with the browser (`FontFace` + `document.fonts.add`) so the
//     canvas measurer and the on-screen SVG both draw with it;
//   - kept as base64 so `emit(inlineFonts)` can inline it into an exported SVG;
//   - handed to jsPDF (`addFileToVFS` + `addFont`) so the PDF has selectable text.
//
// That the three come from the *same bytes* is the whole point: the geometry is
// measured against the face the export embeds, so a PDF cannot disagree with the
// screen about where a chord sits.
//
// **The faces are assets, not a generated constant.** A base64 TTF baked into a
// TS file would be ~1.3× its own weight in the initial bundle, times four
// families — and Epic 11 wants exactly the opposite: precache the body face,
// fetch a title face on first use. So they live in `public/fonts` and are
// fetched.
//
// **Where they live is the catalog's business, not this file's.** The paths used
// to sit in a constant here, hand-synced with the family names in `render-core`;
// a mismatch drew a font nobody loaded. This class now asks the catalog, so the
// two cannot disagree — and a family the *user* installed is an ordinary row
// rather than a second code path.

import { Injectable, inject, signal, type Signal } from '@angular/core';
import {
  DEFAULT_BODY_FONT,
  fromBase64,
  toBase64,
  type FaceSource,
  type FaceVariant,
  type FontBook,
  type FontCatalog,
  type FontFaceKey,
  type FontId,
  type FontResolver,
} from '@achordeon/shared/render-core';
import { FontLibrary } from '../fonts/font-library';

/** `weight` as CSS spells it for the `FontFace` constructor. */
const CSS_WEIGHT = { normal: '400', bold: '700' } as const;

function faceId(face: FontFaceKey): string {
  return `${face.family}|${face.weight}|${face.style}`;
}

@Injectable({ providedIn: 'root' })
export class FontLoader {
  private readonly bytes = new Map<string, string>();
  /** One promise per face, so N renders asking at once cause one fetch. */
  private readonly inFlight = new Map<string, Promise<void>>();

  private readonly library = inject(FontLibrary);

  /**
   * The families this device has — bundled plus installed. Everything below
   * reads rows, never a hardcoded path.
   */
  readonly catalog: FontCatalog = this.library.catalog;

  /**
   * Bumped whenever a face lands. `RenderService.layout` reads it, so every
   * render `computed` re-runs against the real face by construction — the same
   * trick the CSS-loaded face already needed, now with a second trigger.
   */
  private readonly loaded = signal(0);
  readonly epoch: Signal<number> = this.loaded.asReadonly();

  constructor() {
    // The face the whole app is set in, fetched at boot rather than on demand —
    // it is on the path of the very first render, and Epic 11 precaches it for
    // the same reason. Every other family waits until a song chooses it.
    void this.ensure([DEFAULT_BODY_FONT]);
  }

  /** Bytes for one face, or `undefined` if it has not (yet) been fetched. */
  lookup(face: FontFaceKey): string | undefined {
    return this.bytes.get(faceId(face));
  }

  /** The sync lookup `layout` takes — a snapshot of what is loaded right now. */
  readonly resolver: FontResolver = (face) => this.lookup(face);

  /**
   * Every loaded face of the named families, as a `FontBook`.
   *
   * For the PDF's own text — the songbook summary — which is not a render and so
   * has no `RenderPlan` to take its faces from. Without it jsPDF falls back to
   * Helvetica, whose WinAnsi encoding has no `ě ř ů`: the summary came out with
   * holes in every Czech title while the songs beside it were perfect.
   */
  book(ids: readonly FontId[]): FontBook {
    const faces: FontBook = [];
    for (const id of new Set(ids)) {
      const family = this.catalog.get(id);
      if (!family) continue;
      for (const weight of ['normal', 'bold'] as const) {
        const face: FontFaceKey = {
          family: family.family,
          weight,
          style: 'normal',
        };
        const base64 = this.lookup(face);
        if (base64) faces.push({ ...face, base64 });
      }
    }
    return faces;
  }

  /**
   * Load the named families, once. Awaiting this is what an export must do: the
   * screen may render a frame in the fallback face and fix itself, a downloaded
   * file has no second chance.
   *
   * `weights` narrows *which* faces — every one of them by default, because a
   * render or an export needs whatever the page turns out to use. A caller that
   * knows it will only ever draw one line in one weight (the settings panel's
   * font sample) says so: Caveat's bold is a quarter of a megabyte nobody looks
   * at.
   */
  async ensure(
    ids: readonly FontId[],
    weights: readonly ('normal' | 'bold')[] = ['normal', 'bold'],
  ): Promise<void> {
    const jobs: Promise<void>[] = [];
    for (const id of new Set(ids)) {
      const family = this.catalog.get(id);
      if (!family) continue; // an id this device has no row for — CSS fallback only
      for (const [variant, source] of Object.entries(family.faces) as [
        FaceVariant,
        FaceSource,
      ][]) {
        const [weight, style] = variant.split('-') as [
          'normal' | 'bold',
          'normal' | 'italic',
        ];
        if (!weights.includes(weight)) continue;
        jobs.push(
          this.load({ family: family.family, weight, style }, () =>
            this.read(source),
          ),
        );
      }
    }
    await Promise.all(jobs);
  }

  /**
   * The bytes behind one face, wherever they live.
   *
   * The only thing in this class that cares which: a bundled face is a fetch of
   * an asset the service worker has, an added one is a row in IndexedDB and is
   * never fetched at all (ADR-0016 — a URL is acquired once, not referenced).
   */
  private async read(source: FaceSource): Promise<string> {
    if (source.kind === 'asset') {
      const response = await fetch(source.path);
      if (!response.ok) {
        throw new Error(`font ${source.path}: ${response.status}`);
      }
      return toBase64(await response.arrayBuffer());
    }
    const bytes = await this.library.faceBytes(source.key);
    if (!bytes) throw new Error(`font ${source.key}: not stored`);
    return bytes;
  }

  private load(face: FontFaceKey, read: () => Promise<string>): Promise<void> {
    const id = faceId(face);
    if (this.bytes.has(id)) return Promise.resolve();
    const running = this.inFlight.get(id);
    if (running) return running;

    const job = this.fetchFace(face, read)
      .catch(() => {
        // A face that will not load is not a broken app: the SVG names a CSS
        // fallback after it, so the screen degrades to another serif. The PDF
        // has no fallback (§3) — `DownloadService` is the one that must notice,
        // which it does by finding no bytes in the book.
        this.inFlight.delete(id);
      })
      .then(() => void 0);
    this.inFlight.set(id, job);
    return job;
  }

  private async fetchFace(
    face: FontFaceKey,
    read: () => Promise<string>,
  ): Promise<void> {
    const base64 = await read();
    this.bytes.set(faceId(face), base64);
    await this.register(face, fromBase64(base64));
    this.loaded.update((n) => n + 1);
  }

  /** Hand the same bytes to the browser, so screen and export agree. */
  private async register(
    face: FontFaceKey,
    buffer: ArrayBuffer,
  ): Promise<void> {
    // Absent in jsdom and on engines without the CSS Font Loading API; there the
    // bytes still serve the export, and the screen falls back.
    const ctor = (globalThis as { FontFace?: typeof FontFace }).FontFace;
    // `FontFaceSet.add` predates the DOM lib this TS version ships, which types
    // the set as read-only. The method is in every engine that has the API.
    const fonts = (
      globalThis as unknown as {
        document?: { fonts?: { add(font: FontFace): void } };
      }
    ).document?.fonts;
    if (!ctor || !fonts) return;
    const loaded = await new ctor(face.family, buffer, {
      weight: CSS_WEIGHT[face.weight],
      style: face.style,
    }).load();
    fonts.add(loaded);
  }
}
