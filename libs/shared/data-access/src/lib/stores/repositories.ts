// Store DI wiring — Epic 4 ▸ subtask 3
// Spec: PRD-INFRASTRUCTURE.md §2/§4 (PersistenceService owns IndexedDB; stores sit on the paged API)

import { InjectionToken, inject } from '@angular/core';
import type { Song, Songbook } from '@achordeon/shared/domain';
import { AchordeonDb } from '../persistence/db';
import { DexieEntitySource } from '../persistence/entity-source';
import { PagedRepository } from '../persistence/paged-repository';
import type { PagingConfig, SortKey } from '../persistence/paging';

/** The single IndexedDB handle, injectable so tests/tools can swap the instance. */
export const ACHORDEON_DB = new InjectionToken<AchordeonDb>('ACHORDEON_DB', {
  providedIn: 'root',
  factory: () => new AchordeonDb(),
});

/**
 * Song search: fast tier = Name + the Title/Subtitle cache, slow tier = raw
 * content.
 *
 * **Name is in the fast tier**, per `PagingConfig.searchTiers`. It is the string
 * the explorer actually shows and the one CONTEXT.md calls "used for finding" —
 * a library where searching the name you are looking at finds nothing is broken,
 * and a song with no Title yet (a fresh one) would be unfindable entirely.
 */
export const songPagingConfig: PagingConfig<Song> = {
  searchTiers: (s) => [
    `${s.name}\n${s.cache.title}\n${s.cache.subtitle}`,
    s.content,
  ],
  sortValue: (s, key: SortKey) =>
    key === 'name'
      ? s.name
      : key === 'created'
        ? s.createdAt
        : key === 'changed'
          ? s.updatedAt
          : s.favorite,
};

/** Songbook search: metadata only (name + title-page fields); no lyric tier. */
export const songbookPagingConfig: PagingConfig<Songbook> = {
  searchTiers: (b) => [`${b.name}\n${b.title}\n${b.subtitle}\n${b.author}`, ''],
  sortValue: (b, key: SortKey) =>
    key === 'name' ? b.name : key === 'created' ? b.createdAt : b.updatedAt,
};

export const SONG_REPOSITORY = new InjectionToken<PagedRepository<Song>>(
  'SONG_REPOSITORY',
  {
    providedIn: 'root',
    factory: () =>
      new PagedRepository(
        new DexieEntitySource(inject(ACHORDEON_DB).songs),
        songPagingConfig,
      ),
  },
);

export const SONGBOOK_REPOSITORY = new InjectionToken<
  PagedRepository<Songbook>
>('SONGBOOK_REPOSITORY', {
  providedIn: 'root',
  factory: () =>
    new PagedRepository(
      new DexieEntitySource(inject(ACHORDEON_DB).songbooks),
      songbookPagingConfig,
    ),
});

/** One page's worth of rows appended per infinite-scroll fetch. */
export const PAGE_LIMIT = 50;
