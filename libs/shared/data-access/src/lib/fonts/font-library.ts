// FontLibrary — the fonts this device has, bundled and added
// Spec: ADR-0016 (a font is acquired, not referenced), ADR-0017 (a font id is a
// family slug, and the catalog is injected), PRD-RENDERING §4.10.
//
// The device half of the catalog. `render-core` declares what a `FontCatalog`
// is and takes one as a parameter; this is what the app hands it — the bundled
// table merged with whatever the user has installed.
//
// **The catalog object is stable and its answers are not.** `createLayout` binds
// its platform dependencies once, so handing it a new catalog on every install
// would mean rebinding the renderer. It gets this facade instead, which reads a
// signal: installing a font changes what `list()` returns without anything
// downstream having to be told.

import { Injectable, computed, inject, signal } from '@angular/core';
import {
  BUNDLED_FONTS,
  FONT_ALIASES,
  FontFileError,
  customFontId,
  parseSfnt,
  toBase64,
  type FaceSource,
  type FontCatalog,
  type FontFamily,
  type FontId,
} from '@achordeon/shared/render-core';
import { ACHORDEON_DB } from '../stores/repositories';
import type { FontFaceRow } from '../persistence/db';

/** Where a face's bytes came from, for the row and for what the export names. */
export interface FontOrigin {
  /** The URL it was fetched from, when it was not a local file. */
  readonly source?: string;
}

@Injectable({ providedIn: 'root' })
export class FontLibrary {
  private readonly db = inject(ACHORDEON_DB);

  /** Every installed face, as rows. One read at boot, then kept in step by writes. */
  private readonly rows = signal<readonly FontFaceRow[]>([]);

  /** The installed families, faces grouped — catalog rows in the picker's order. */
  readonly installed = computed<readonly FontFamily[]>(() =>
    groupFamilies(this.rows()),
  );

  /** Bundled first, installed after: a library grows below what shipped with it. */
  private readonly families = computed<readonly FontFamily[]>(() => [
    ...BUNDLED_FONTS,
    ...this.installed(),
  ]);

  /**
   * The catalog the renderer and the pickers both read.
   *
   * Not a `createFontCatalog` snapshot: this one has to answer differently after
   * an install, and the object handed to `createLayout` is bound for the life of
   * the app.
   */
  readonly catalog: FontCatalog = {
    get: (id) => {
      const alias = FONT_ALIASES[id] ?? id;
      return this.families().find((family) => family.id === alias);
    },
    list: () => this.families(),
  };

  /** Read what is installed. Awaited at boot, before the first render. */
  async load(): Promise<void> {
    this.rows.set(await this.db.fonts.toArray());
  }

  /** One installed face as base64, or `undefined` once it has been deleted. */
  async faceBytes(key: string): Promise<string | undefined> {
    return (await this.db.fonts.get(key))?.bytes;
  }

  /**
   * Add one face from one file (ADR-0016).
   *
   * The parse decides everything and refuses loudly: a file that is not TrueType
   * is turned away here, with the user watching, rather than becoming a PDF that
   * is missing a face weeks later.
   *
   * Returns the family the face joined, so a caller can select it straight away.
   */
  async add(buffer: ArrayBuffer, origin: FontOrigin = {}): Promise<FontFamily> {
    const parsed = parseSfnt(buffer);
    const familyId = customFontId(parsed.family);
    const row: FontFaceRow = {
      key: `${familyId}|${parsed.variant}`,
      familyId,
      label: parsed.family,
      variant: parsed.variant,
      bytes: toBase64(buffer),
      // A variable file can only supply its default instance, so it counts as
      // the one face it really draws and the rest are borrowed (ADR-0017).
      isVariable: parsed.isVariable,
      ...(parsed.license ? { license: parsed.license } : {}),
      ...(origin.source ? { source: origin.source } : {}),
      addedAt: Date.now(),
    };
    // `put`, not `add`: re-adding a face replaces it. Someone who fetched a
    // better build of the same file means to update it, not to be told it is
    // already there.
    await this.db.fonts.put(row);
    await this.load();

    const family = this.catalog.get(familyId);
    if (!family) {
      // The row went in and came back out ungrouped, which can only mean the
      // write did not stick — private mode, or a full disk.
      throw new FontFileError('the font could not be stored');
    }
    return family;
  }

  /**
   * Forget a family, faces and all.
   *
   * **Never blocked.** The id survives in every song that named it (ADR-0017),
   * which renders as the default and re-appears the moment the family is added
   * back — so this destroys nothing a re-add cannot restore. What the caller owes
   * the user is a count, not a veto.
   */
  async remove(id: FontId): Promise<void> {
    await this.db.fonts.where('familyId').equals(id).delete();
    await this.load();
  }
}

/**
 * Faces → families.
 *
 * The CSS family of an installed font is its **id**, not its label. A user's own
 * copy of Lora and a bundled Lora would otherwise be one name to
 * `document.fonts`, and the second registration would silently win for both. The
 * id is unique by construction, which is the only property this name needs.
 */
function groupFamilies(rows: readonly FontFaceRow[]): FontFamily[] {
  const families = new Map<FontId, FontFamily>();
  for (const row of [...rows].sort((a, b) => a.addedAt - b.addedAt)) {
    const existing = families.get(row.familyId);
    const faces: Record<string, FaceSource> = { ...existing?.faces };
    faces[row.variant] = { kind: 'stored', key: row.key };
    families.set(row.familyId, {
      id: row.familyId,
      label: row.label,
      // Nothing in the file says whether it is a serif, and asking someone to
      // classify a font they just added is a question with no good answer. They
      // get their own shelf instead, which is also the one they will look on.
      category: 'custom',
      family: row.familyId,
      // The renderer's own stack, for the frame before the bytes are registered.
      fallback: 'system-ui, sans-serif',
      faces: faces as FontFamily['faces'],
      license: existing?.license ?? row.license ?? '',
    });
  }
  return [...families.values()];
}
