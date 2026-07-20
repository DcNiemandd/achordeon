// FontLoader — Epic 7 ▸ subtask 8 (real font bytes, for N faces)
// Spec: PRD-RENDERING §3 (jsPDF registration), §4.10 (embedded both ways,
// bundled catalog), ADR-0002 (Safari will not fetch a font from inside an SVG).
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

import { Injectable, signal, type Signal } from '@angular/core';
import type { FontFaceKey, FontResolver } from '@achordeon/shared/render-core';

/** The bundled files, by the family name the render names (§4.10 catalog). */
const FONT_FILES: Record<string, Partial<Record<'normal' | 'bold', string>>> = {
  'Roboto Mono': {
    normal: 'fonts/RobotoMono-Regular.ttf',
    bold: 'fonts/RobotoMono-Bold.ttf',
  },
  'Crimson Text': {
    normal: 'fonts/CrimsonText-Regular.ttf',
    bold: 'fonts/CrimsonText-Bold.ttf',
  },
  Oswald: {
    normal: 'fonts/Oswald-Regular.ttf',
    bold: 'fonts/Oswald-Bold.ttf',
  },
  Caveat: {
    normal: 'fonts/Caveat-Regular.ttf',
    bold: 'fonts/Caveat-Bold.ttf',
  },
};

/**
 * The face the whole app is set in. Fetched at boot rather than on demand — it
 * is on the path of the very first render, and Epic 11 precaches it for the same
 * reason. Every other family waits until a song actually chooses it.
 */
export const BODY_FAMILY = 'Roboto Mono';

/** `weight` as CSS spells it for the `FontFace` constructor. */
const CSS_WEIGHT = { normal: '400', bold: '700' } as const;

function faceId(face: FontFaceKey): string {
  return `${face.family}|${face.weight}|${face.style}`;
}

/** Base64 of a byte buffer, chunked — `String.fromCharCode(...all)` blows the
 * call stack somewhere north of 100 KB, and every one of these is bigger. */
function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

@Injectable({ providedIn: 'root' })
export class FontLoader {
  private readonly bytes = new Map<string, string>();
  /** One promise per face, so N renders asking at once cause one fetch. */
  private readonly inFlight = new Map<string, Promise<void>>();

  /**
   * Bumped whenever a face lands. `RenderService.layout` reads it, so every
   * render `computed` re-runs against the real face by construction — the same
   * trick the CSS-loaded face already needed, now with a second trigger.
   */
  private readonly loaded = signal(0);
  readonly epoch: Signal<number> = this.loaded.asReadonly();

  constructor() {
    void this.ensure([BODY_FAMILY]);
  }

  /** Bytes for one face, or `undefined` if it has not (yet) been fetched. */
  lookup(face: FontFaceKey): string | undefined {
    return face.style === 'normal' ? this.bytes.get(faceId(face)) : undefined;
  }

  /** The sync lookup `layout` takes — a snapshot of what is loaded right now. */
  readonly resolver: FontResolver = (face) => this.lookup(face);

  /**
   * Load every weight of the named families, once. Awaiting this is what an
   * export must do: the screen may render a frame in the fallback face and fix
   * itself, a downloaded file has no second chance.
   */
  async ensure(families: readonly string[]): Promise<void> {
    const jobs: Promise<void>[] = [];
    for (const family of new Set(families)) {
      const files = FONT_FILES[family];
      if (!files) continue; // a family we bundle no bytes for — CSS fallback only
      for (const weight of ['normal', 'bold'] as const) {
        const url = files[weight];
        if (url) jobs.push(this.load({ family, weight, style: 'normal' }, url));
      }
    }
    await Promise.all(jobs);
  }

  private load(face: FontFaceKey, url: string): Promise<void> {
    const id = faceId(face);
    if (this.bytes.has(id)) return Promise.resolve();
    const running = this.inFlight.get(id);
    if (running) return running;

    const job = this.fetchFace(face, url)
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

  private async fetchFace(face: FontFaceKey, url: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`font ${url}: ${response.status}`);
    const buffer = await response.arrayBuffer();
    this.bytes.set(faceId(face), toBase64(buffer));
    await this.register(face, buffer);
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
