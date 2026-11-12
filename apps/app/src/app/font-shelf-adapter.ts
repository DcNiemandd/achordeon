// The font shelf, bound to the real font services.
//
// A shell file, because only the shell may both import data-access and know
// what `app/shared` asks for (`shared/fonts/font-shelf.ts`). Provided once in
// `app.config.ts`. Every member only hands the call on: anything cleverer
// belongs in the services themselves.

import { Injectable, inject } from '@angular/core';
import type { FontFamily, FontId } from '@achordeon/shared/render-core';
import {
  FontFetcher,
  FontLibrary,
  FontLoader,
} from '@achordeon/shared/data-access';
import { FontShelf, type FontSearchResult } from './shared/fonts';

@Injectable()
export class FontShelfAdapter extends FontShelf {
  private readonly loader = inject(FontLoader);
  private readonly library = inject(FontLibrary);
  private readonly fetcher = inject(FontFetcher);

  readonly catalog = this.loader.catalog;
  readonly epoch = this.loader.epoch;

  ensure(
    ids: readonly FontId[],
    weights?: readonly ('normal' | 'bold')[],
  ): Promise<void> {
    return this.loader.ensure(ids, weights);
  }

  countUsers(id: FontId): Promise<number> {
    return this.library.countUsers(id);
  }

  remove(id: FontId): Promise<void> {
    return this.library.remove(id);
  }

  addFile(buffer: ArrayBuffer): Promise<FontFamily> {
    return this.library.add(buffer);
  }

  openIndex(): Promise<void> {
    return this.fetcher.open();
  }

  search(query: string): Promise<FontSearchResult[]> {
    return this.fetcher.search(query);
  }

  addFromIndex(key: string, name: string): Promise<FontFamily[]> {
    return this.fetcher.addFamily(key, name);
  }

  addFromLink(raw: string): Promise<FontFamily[]> {
    return this.fetcher.add(raw);
  }
}
