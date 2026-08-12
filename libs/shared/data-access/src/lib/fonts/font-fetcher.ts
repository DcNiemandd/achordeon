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
  searchFamilies,
  type FontCandidate,
  type FontIndex,
} from './font-url';

/** Where the generated family index is served from (`gen-font-index.mjs`). */
const INDEX_URL = 'fonts/google-index.json';

@Injectable({ providedIn: 'root' })
export class FontFetcher {
  private readonly library = inject(FontLibrary);

  /**
   * The 231 KB of family names, fetched at most once a session.
   *
   * It used to be pulled only when someone pasted a Google Fonts link. Searching
   * the catalogue makes it the primary path, so it is now loaded when the add
   * dialog opens — still on no render's path, and still one fetch.
   */
  private index?: Promise<FontIndex>;

  /** Warm the index, so the first keystroke has something to search. */
  async open(): Promise<void> {
    await this.load();
  }

  /**
   * The families whose name contains what was typed.
   *
   * Empty until the index has arrived, which is a state the caller can see
   * coming: it asked for it on open.
   */
  async search(query: string, limit = 20): Promise<FontCandidate[]> {
    return searchFamilies(await this.load(), query, limit);
  }

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

    const added: FontFamily[] = [];
    for (const name of request.families) {
      added.push(...(await this.addFamily(familyKey(name), name)));
    }
    return added;
  }

  /**
   * Add one family by its index key — what a search result is picked with.
   *
   * The same path a pasted link takes, deliberately: which files a family is
   * worth fetching is one decision (`filesFor`), and a second way in would be a
   * second answer to it.
   */
  async addFamily(key: string, name = key): Promise<FontFamily[]> {
    const row = (await this.load())[key];
    if (!row) {
      throw new FontUrlError(`no font called ${name}`);
    }
    const added: FontFamily[] = [];
    for (const file of filesFor(row)) {
      added.push(await this.addFile(jsdelivrUrl(row.d, file)));
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
