// Getting a font from a link — ADR-0016 (a font is acquired, not referenced)
//
// The one-time fetch. Everything after it is the same path a picked file takes:
// parse, validate, store. Nothing here runs at render time, and nothing the app
// draws ever reaches a third-party host.

import { Injectable, inject } from '@angular/core';
import type { FontFamily } from '@achordeon/shared/render-core';
import { FontLibrary } from './font-library';
import {
  FontUrlError,
  familyKey,
  filesFor,
  jsdelivrUrl,
  readFontUrl,
  type FontIndex,
} from './font-url';

/** Where the generated family index is served from (`gen-font-index.mjs`). */
const INDEX_URL = 'fonts/google-index.json';

@Injectable({ providedIn: 'root' })
export class FontFetcher {
  private readonly library = inject(FontLibrary);

  /**
   * The 188 KB of family names, fetched at most once and only ever because
   * someone pasted a Google Fonts link. It is on no render's path.
   */
  private index?: Promise<FontIndex>;

  /**
   * Add every family a pasted link names, and answer with what arrived.
   *
   * Several, because one embed URL routinely names four — that is what the
   * Google Fonts site hands you when you have picked four.
   */
  async add(raw: string): Promise<FontFamily[]> {
    const request = readFontUrl(raw);
    if (request.kind === 'file') {
      return [await this.addFile(request.url)];
    }

    const index = await this.load();
    const added: FontFamily[] = [];
    for (const name of request.families) {
      const row = index[familyKey(name)];
      if (!row) {
        throw new FontUrlError(`no font called ${name}`);
      }
      for (const file of filesFor(row)) {
        added.push(await this.addFile(jsdelivrUrl(row.d, file)));
      }
    }
    return added;
  }

  private async addFile(url: string): Promise<FontFamily> {
    const response = await fetch(url).catch(() => {
      // A cross-origin font read needs `Access-Control-Allow-Origin`, and its
      // absence arrives as a bare TypeError with no status to report. The
      // allow-list is what keeps this from being routine, so a failure here is
      // worth naming as the host rather than as the file.
      throw new FontUrlError('that font could not be downloaded');
    });
    if (!response.ok) {
      throw new FontUrlError(`that font is not there (${response.status})`);
    }
    // The parse inside `add` is what decides whether these bytes are usable —
    // being fetched from an allow-listed host says nothing about the file.
    return this.library.add(await response.arrayBuffer(), { source: url });
  }

  private load(): Promise<FontIndex> {
    this.index ??= fetch(INDEX_URL)
      .then((response) => {
        if (!response.ok)
          throw new FontUrlError('the font list is unavailable');
        return response.json() as Promise<FontIndex>;
      })
      .catch((error) => {
        // Not cached as a rejected promise: a failed load is usually a cold
        // offline boot, and the next attempt should be allowed to succeed.
        this.index = undefined;
        throw error;
      });
    return this.index;
  }
}
