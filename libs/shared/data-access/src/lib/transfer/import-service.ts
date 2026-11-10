// ImportService — Epic 7 ▸ subtasks 2–3
// Spec: PRD-INFRASTRUCTURE.md §8 (accept Export JSON + downloaded files with
// embedded metadata; songs replace/ignore/create-new, a songbook replaces the one
// under its id so a reimport updates in place), ADR-0007 (**one** ingest gateway —
// every inbound path runs `migrate` first).
//
// Three steps, deliberately not one call: read (what is in this file), plan
// (what would it do to my library), apply (do it). The middle step is the whole
// point — a file that silently overwrote nineteen songs because the twentieth
// matched would be indefensible, so the answer to "what collides" has to be
// available *before* anything is written.

import { Injectable, inject } from '@angular/core';
import {
  ChordTheory,
  SCHEMA_VERSION,
  applyImport,
  convertChordSheet,
  migrate,
  planImport,
  type ImportChoices,
  type ImportPlan,
  type ImportWrite,
  type MigrateStatus,
  type SnapshotEnvelope,
  type Song,
} from '@achordeon/shared/domain';
import { BODY_FONT, type FontCatalog } from '@achordeon/shared/render-core';
import { BootGate } from '../persistence/boot-gate';
import { ParserService } from '../parser/parser-service';
import { SONGBOOK_REPOSITORY, SONG_REPOSITORY } from '../stores/repositories';
import { readEmbeddedSnapshot } from './embedded-metadata';
import { normalise, type InboundEnvelope } from './normalise';

/** The settings that hold a font id (PRD-RENDERING §4.10). */
const FONT_KEYS = ['bodyFont', 'titleFont', 'italicFont'] as const;

/** A file that could not be read as a library. */
export class ImportError extends Error {
  constructor(readonly reason: 'unreadable' | 'refused') {
    super(reason);
    this.name = 'ImportError';
  }
}

export interface ImportSource {
  readonly snapshot: SnapshotEnvelope;
  /** `warn` = it carries settings this build does not know (additive, from a
   * newer app). Preserved either way — the user is told, not stopped. */
  readonly status: MigrateStatus;
}

@Injectable({ providedIn: 'root' })
export class ImportService {
  private readonly songs = inject(SONG_REPOSITORY);
  private readonly songbooks = inject(SONGBOOK_REPOSITORY);
  private readonly boot = inject(BootGate);
  /** Only ever to re-derive `Song.cache`, which is derived state and never
   * believed off a file (ADR-0014). */
  private readonly parser = inject(ParserService);
  private readonly theory = inject(ChordTheory);

  /**
   * A picked file as a migrated envelope.
   *
   * A **downloaded** file is accepted too, where it carries the metadata the
   * download put in it (§8) — the same JSON, riding inside the picture. That is
   * the difference between "a PNG of my song" and "my song", and the reason a
   * user can hand a friend one file rather than two.
   *
   * `refuse` from the gateway is a hard stop, not a warning: the file was
   * written by a build with a breaking schema this one cannot read, and guessing
   * a down-migration is how a library gets quietly mangled (ADR-0007). It also
   * latches `BootGate`, which raises the blocking update prompt — telling the user
   * to update is only fair if the app then offers to (PRD-INFRASTRUCTURE.md §11).
   */
  async read(file: Blob): Promise<ImportSource> {
    const embedded = await readEmbeddedSnapshot(file);
    const parsed =
      embedded !== null
        ? this.parse(embedded)
        : this.parseText(file, decodeText(await file.arrayBuffer()));
    const { snapshot, status } = migrate(parsed);
    if (status === 'refuse') {
      this.boot.refuseIngest();
      throw new ImportError('refused');
    }
    return { snapshot, status };
  }

  /** What this envelope would do to the library as it stands right now. */
  async plan(snapshot: SnapshotEnvelope): Promise<ImportPlan> {
    const [songs, songbooks] = await Promise.all([
      this.songs.all(),
      this.songbooks.all(),
    ]);
    return planImport(snapshot.data, songs, songbooks);
  }

  /**
   * How many of these songs the parser has something to say about.
   *
   * Import compares ids and never looks at the content, so a song whose markup is
   * wrong lands silently and is discovered on the page. This is the answer to a
   * problem with no other fix: **a downloaded skill goes stale and nothing
   * notices** — skills do not auto-update and their sandbox has no network to
   * check with, so one built before a grammar change teaches the old rule, the
   * model writes content that parses differently now, and the import succeeds.
   * The envelope half of that is already solved (ADR-0007 migrates whatever
   * `schemaVersion` a stale skill wrote); the grammar half is this.
   *
   * Checking the content rather than stamping and comparing a grammar version
   * catches every cause at once — a stale skill, a model that never had one, a
   * bad conversion, a hand-edited file — and it is the more useful message
   * anyway: not "your tooling is old" but "these songs have problems".
   *
   * **Named, not counted**, and one entry per song however many warnings it
   * carries — the same rule the conflict list follows, for the same reason: "4
   * songs have problems" is a number, and what the reader needs is which four,
   * because that is what tells them where to go and look.
   *
   * Cost measured before committing to it, as the plan asked: a 200-song export
   * (175 KB of content) parses in ~28 ms, so the whole file is checked rather
   * than a capped sample or a lazy count.
   */
  /**
   * The fonts this file names that this device has not got.
   *
   * The existing `warn` channel means "this file carries settings this build
   * does not know" and detects an unknown **key**. This is an unknown *value* on
   * a key the build knows perfectly well, which nothing else catches — and it is
   * the difference between a song arriving and a song arriving looking wrong.
   *
   * Font-specific rather than a general per-setting predicate on the registry.
   * That was considered and is over-built for one case: the useful message is
   * not "a setting has a value I don't recognise", it is the name of the font
   * she is missing, and only this check can produce it.
   *
   * The ids are **not repaired** (ADR-0017). They render as the default and come
   * back the moment the family is installed; rewriting them at the boundary
   * would destroy the only evidence of what the sender's page looked like.
   */
  missingFonts(snapshot: SnapshotEnvelope, catalog: FontCatalog): string[] {
    const bags = [
      ...snapshot.data.songs.map((song) => song.settings),
      ...snapshot.data.songbooks.map((book) => book.settings),
    ];
    const missing = new Set<string>();
    for (const bag of bags) {
      for (const key of FONT_KEYS) {
        const id = bag?.[key];
        if (typeof id !== 'string' || id === BODY_FONT) continue;
        if (!catalog.get(id)) missing.add(id);
      }
    }
    return [...missing];
  }

  flagged(songs: readonly Song[]): string[] {
    const names: string[] = [];
    for (const song of songs) {
      if (this.parser.parse(song.content).warnings.length > 0) {
        names.push(song.name);
      }
    }
    return names;
  }

  /** Write the plan under the user's answer. Returns what actually landed. */
  async apply(
    plan: ImportPlan,
    choices: Omit<ImportChoices, 'now' | 'newId'>,
  ): Promise<ImportWrite> {
    const write = applyImport(plan, {
      ...choices,
      now: Date.now(),
      newId: () => crypto.randomUUID(),
    });
    // Songs first: a songbook whose songs are not there yet is a book of blank
    // slots, and the write is not one transaction (two tables, two repos).
    if (write.songs.length) await this.songs.bulkPut(write.songs);
    if (write.songbooks.length) await this.songbooks.bulkPut(write.songbooks);
    return write;
  }

  /**
   * Text → envelope, with the shape actually checked and then completed.
   *
   * A file is untrusted input, and `JSON.parse` will happily hand back a number.
   * This is the boundary where "some text a user picked" becomes a typed value,
   * so it is where the check belongs — not three layers down where the failure
   * would read as a bug in the migrator.
   *
   * Two steps, and the order is the whole of ADR-0014: `isEnvelope` decides
   * whether this is one of ours at all, and `normalise` then fills in what a
   * **hand-written** envelope legitimately left out. The gate does not move and
   * does not gain a rival — normalisation is a step inside it, before `migrate`,
   * which every inbound path still runs (ADR-0007).
   */
  private parse(raw: string): SnapshotEnvelope {
    const value = parseJson(raw);
    if (!isEnvelope(value)) throw new ImportError('unreadable');
    return this.normalised(value);
  }

  /**
   * A file read as text: an Achordeon file if it is one, otherwise a Chord sheet
   * file (plan phase 3, Q44) — which becomes the shortest hand-written envelope,
   * `{ songs: [{ name, content }] }`, and goes through the same gate as any
   * other (ADR-0014). Every song in it is new: a sheet carries no id.
   */
  private parseText(file: Blob, text: string): SnapshotEnvelope {
    const value = parseJson(text);
    if (isEnvelope(value)) return this.normalised(value);
    const songs = this.chordSheetSongs(file, text);
    if (songs === null) throw new ImportError('unreadable');
    return this.normalised({
      schemaVersion: SCHEMA_VERSION,
      data: { songs, songbooks: [] },
    } as InboundEnvelope);
  }

  /**
   * The songs a Chord sheet file holds, or null when the file is not one.
   *
   * Only a file named like one is read this way — a nameless blob (a link's
   * payload) or a `.jpg` that failed as JSON is still not ours. A `.txt` with no
   * chords in it is the words it holds, brought in as written.
   */
  private chordSheetSongs(
    file: Blob,
    text: string,
  ): { name: string; content: string }[] | null {
    const fileName = file instanceof File ? file.name : '';
    const dot = fileName.lastIndexOf('.');
    const extension = dot === -1 ? '' : fileName.slice(dot).toLowerCase();
    if (!CHORD_SHEET_EXTENSIONS.has(extension)) return null;
    const stem = fileName.slice(0, dot).trim() || fileName;

    const sheet = convertChordSheet(text, this.theory);
    if (sheet.kind !== 'converted') {
      return [{ name: stem, content: text }];
    }
    return sheet.songs.map((song, i) => ({
      name: song.name ?? (sheet.songs.length > 1 ? `${stem} (${i + 1})` : stem),
      content: song.content,
    }));
  }

  private normalised(value: InboundEnvelope): SnapshotEnvelope {
    return normalise(value, {
      newId: () => crypto.randomUUID(),
      now: Date.now(),
      derive: (content) => {
        const ast = this.parser.parse(content);
        return { title: ast.title ?? '', subtitle: ast.subtitle ?? '' };
      },
    });
  }
}

/** The file types read as a Chord sheet (plan phase 3, Q44). */
export const CHORD_SHEET_EXTENSIONS: ReadonlySet<string> = new Set([
  '.cho',
  '.chordpro',
  '.crd',
  '.pro',
  '.txt',
]);

/**
 * A file's bytes as text: UTF-8 when they are UTF-8, else windows-1250 — the
 * encoding older Czech `.txt` and `.crd` files were saved in (Q23). No picker:
 * a byte sequence that is not valid UTF-8 is not an English file.
 */
function decodeText(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1250').decode(bytes);
  }
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/**
 * Is this one of ours?
 *
 * Deliberately as little as it can be: a version to migrate from and the two
 * collections an import reads. Everything a *complete* record carries is checked
 * nowhere, because demanding it would reject exactly the hand-written envelopes
 * the published schema exists to invite (ADR-0014). What the gate does not
 * establish, `normalise` supplies.
 */
function isEnvelope(value: unknown): value is InboundEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const envelope = value as Partial<SnapshotEnvelope>;
  const data = envelope.data;
  return (
    typeof envelope.schemaVersion === 'number' &&
    typeof data === 'object' &&
    data !== null &&
    Array.isArray(data.songs) &&
    Array.isArray(data.songbooks)
  );
}
