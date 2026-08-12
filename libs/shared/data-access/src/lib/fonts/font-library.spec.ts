import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TestBed } from '@angular/core/testing';
import { FontFileError, isBodyCapable } from '@achordeon/shared/render-core';
import { AchordeonDb } from '../persistence/db';
import { ACHORDEON_DB } from '../stores/repositories';
import { FontLibrary } from './font-library';

const FONTS = join(__dirname, '../../../../../../apps/app/public/fonts');

function read(name: string): ArrayBuffer {
  const buffer = readFileSync(join(FONTS, name));
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
}

describe('FontLibrary', () => {
  let db: AchordeonDb;
  let fonts: FontLibrary;

  beforeEach(async () => {
    db = new AchordeonDb(`fonts-${crypto.randomUUID()}`);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: ACHORDEON_DB, useValue: db }],
    });
    fonts = TestBed.inject(FontLibrary);
    await fonts.load();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('adds a face under a slug of the family the file names', async () => {
    // Two devices adding the same file must land on the same id, with no
    // identity reconciliation anywhere (ADR-0017).
    const family = await fonts.add(read('Oswald-Regular.ttf'));

    expect(family.id).toBe('custom:oswald');
    expect(family.label).toBe('Oswald');
  });

  it('accumulates a family face by face', async () => {
    // A file is one face. Adding the bold is not adding a second family.
    await fonts.add(read('CrimsonText-Regular.ttf'));
    const family = await fonts.add(read('CrimsonText-Bold.ttf'));

    expect(fonts.installed()).toHaveLength(1);
    expect(Object.keys(family.faces).sort()).toEqual([
      'bold-normal',
      'normal-normal',
    ]);
  });

  it('is short of the faces it has no files for', async () => {
    // Which is what puts it through the donor rule rather than into an error.
    const family = await fonts.add(read('Caveat-Regular.ttf'));

    expect(isBodyCapable(family)).toBe(false);
  });

  it('is body-capable once all four are in', async () => {
    for (const face of ['Regular', 'Bold', 'Italic', 'BoldItalic']) {
      await fonts.add(read(`RobotoMono-${face}.ttf`));
    }

    expect(isBodyCapable(fonts.installed()[0])).toBe(true);
  });

  it('replaces a face rather than duplicating it', async () => {
    await fonts.add(read('Oswald-Regular.ttf'));
    await fonts.add(read('Oswald-Regular.ttf'));

    expect(await db.fonts.count()).toBe(1);
  });

  it('keeps a user copy apart from the family the app bundles', async () => {
    // Same font, two rows, two CSS names — one registration must not silently
    // win for both.
    await fonts.add(read('Oswald-Regular.ttf'));

    expect(fonts.catalog.get('oswald')?.family).toBe('Oswald');
    expect(fonts.catalog.get('custom:oswald')?.family).toBe('custom:oswald');
  });

  it('refuses a file that is not TrueType, and stores nothing', async () => {
    // Refused here, with the user watching, rather than as a PDF missing a face
    // weeks later (ADR-0016).
    const junk = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

    await expect(fonts.add(junk.buffer)).rejects.toThrow(FontFileError);
    expect(await db.fonts.count()).toBe(0);
  });

  it('gives the bytes back for the face it stored', async () => {
    const family = await fonts.add(read('Oswald-Bold.ttf'));
    const face = family.faces['bold-normal'];

    const bytes =
      face?.kind === 'stored' ? await fonts.faceBytes(face.key) : undefined;

    expect(bytes?.length).toBeGreaterThan(0);
  });

  it('deletes a family whole, and never refuses to', async () => {
    // Non-destructive: the id survives in every song that named it, so re-adding
    // brings those pages back. There is nothing here to protect the user from.
    await fonts.add(read('Oswald-Regular.ttf'));
    await fonts.add(read('Oswald-Bold.ttf'));

    await fonts.remove('custom:oswald');

    expect(fonts.installed()).toHaveLength(0);
    expect(await db.fonts.count()).toBe(0);
  });

  it('survives a reload of the same database', async () => {
    await fonts.add(read('Caveat-Regular.ttf'));

    await fonts.load();

    expect(fonts.installed().map((one) => one.id)).toEqual(['custom:caveat']);
  });
});
