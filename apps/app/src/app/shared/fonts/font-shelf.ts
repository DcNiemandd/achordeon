// Font shelf — what the font UI in `app/shared` needs from the font services.
//
// `app/shared` may not import data-access (the import ladder, PRD-UI-SHELL.md
// §3), yet the font list, the add-font dialog and the settings panel's samples
// all work on the device's fonts, and are mounted from more than one page. So
// the dependency points the other way: this folder says what it needs, as an
// abstract class, and the shell binds it to the real services
// (`apps/app/src/app/font-shelf-adapter.ts`, provided in `app.config.ts`). The
// same move `ScreenShape` makes for the screen: a component reads a fact about
// its environment without knowing where the fact comes from.

import type { Signal } from '@angular/core';
import type {
  FontCatalog,
  FontFamily,
  FontId,
} from '@achordeon/shared/render-core';

/** One family the font index offers, as a search result shows it. */
export interface FontSearchResult {
  /** Its key in the index, what `addFromIndex` is called with. */
  readonly key: string;
  /** The family's own name. */
  readonly label: string;
  /** How many faces adding it would install. */
  readonly faces: number;
  /** Its faces come from variable files, which give their default instance only. */
  readonly isVariable: boolean;
}

export abstract class FontShelf {
  /** Every family this device has: bundled and added. */
  abstract readonly catalog: FontCatalog;
  /** Bumps whenever a face finishes loading, so a sample can redraw. */
  abstract readonly epoch: Signal<number>;

  /** Load these families' faces, in these weights, before drawing with them. */
  abstract ensure(
    ids: readonly FontId[],
    weights?: readonly ('normal' | 'bold')[],
  ): Promise<void>;

  /** How many songs and settings use this family. */
  abstract countUsers(id: FontId): Promise<number>;
  /** Remove an added family from this device. */
  abstract remove(id: FontId): Promise<void>;

  /** Add one font file from this device. */
  abstract addFile(buffer: ArrayBuffer): Promise<FontFamily>;
  /** Fetch the font index, so a search can answer. */
  abstract openIndex(): Promise<void>;
  /** Families in the index matching the query. */
  abstract search(query: string): Promise<FontSearchResult[]>;
  /** Add a family from the index, by its key. */
  abstract addFromIndex(key: string, name: string): Promise<FontFamily[]>;
  /** Add the family a pasted link points at. */
  abstract addFromLink(raw: string): Promise<FontFamily[]>;
}
