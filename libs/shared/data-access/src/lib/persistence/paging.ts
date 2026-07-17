// Paged/cursor query engine — Epic 4 ▸ subtask 2
// Spec: PRD-INFRASTRUCTURE.md §4 (paged/cursor API), CONTEXT.md §Search (two-tier)

import type { BaseRecord } from '@achordeon/shared/domain';

/** Sort axes the Song explorer offers (CONTEXT.md §Song explorer). */
export type SortKey = 'name' | 'created' | 'changed' | 'favorite';
export type SortDir = 'asc' | 'desc';

/**
 * Opaque forward cursor. In the v1 load-all-then-slice backing it encodes an
 * offset; a later Dexie/Supabase keyset backing can redefine it without any caller
 * change — treat it as a token, never parse it.
 */
export type Cursor = string;

/** One page request. `cursor` null/absent = first page. */
export interface PageQuery {
  cursor?: Cursor | null;
  limit: number;
  sort: SortKey;
  dir?: SortDir; // omitted = the natural default for the sort key
  query?: string; // search text; empty/absent = no filter
}

/** One page response. `nextCursor` null = the result is exhausted. */
export interface Page<T> {
  rows: T[];
  nextCursor: Cursor | null;
}

/**
 * How a given entity is searched and sorted — the only entity-specific part of
 * paging, injected so the engine itself stays generic.
 */
export interface PagingConfig<T> {
  /**
   * Two-tier search text: `[primary, secondary]`. A primary (metadata:
   * Title/Subtitle/Name) hit ranks above a secondary (content) hit, so
   * metadata matches surface first (CONTEXT.md §Search).
   */
  searchTiers: (record: T) => readonly [primary: string, secondary: string];
  /** Comparable value for a sort axis. */
  sortValue: (record: T, key: SortKey) => string | number | boolean;
}

/**
 * Sensible default direction per axis: A→Z names, newest-first dates, favorites
 * first. Exported because a `dir`-less query is answered with one of these, so
 * anything that *shows* the current direction (the explorer's arrow) must be able
 * to ask what "no direction given" actually resolved to.
 */
export const DEFAULT_SORT_DIR: Record<SortKey, SortDir> = {
  name: 'asc',
  created: 'desc',
  changed: 'desc',
  favorite: 'desc',
};

const encodeCursor = (offset: number): Cursor => String(offset);
const decodeCursor = (cursor: Cursor | null | undefined): number => {
  const n = Number(cursor);
  return Number.isInteger(n) && n > 0 ? n : 0;
};

// -1 = no match; 0 = primary (metadata) hit; 1 = secondary (content) hit.
function matchTier(tiers: readonly [string, string], needle: string): number {
  if (tiers[0].toLowerCase().includes(needle)) return 0;
  if (tiers[1].toLowerCase().includes(needle)) return 1;
  return -1;
}

function compareValues(
  a: string | number | boolean,
  b: string | number | boolean,
): number {
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    return (a ? 1 : 0) - (b ? 1 : 0);
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
}

/**
 * The pure paging brain: filter tombstones, apply two-tier search, order, and cut
 * one page. Kept pure (no I/O) so it is exhaustively unit-testable; a repository
 * (`PagedRepository`) just feeds it `source.all()`. This IS the v1 "load-all then
 * slice" mock — the same `Page` shape a keyset backing will later produce.
 */
export function pageRecords<T extends BaseRecord>(
  all: T[],
  query: PageQuery,
  config: PagingConfig<T>,
): Page<T> {
  const limit = Math.max(0, query.limit);
  const needle = (query.query ?? '').trim().toLowerCase();
  const sign = (query.dir ?? DEFAULT_SORT_DIR[query.sort]) === 'asc' ? 1 : -1;

  // Lists show live rows only; tombstones stay in the store for sync (subtask 5).
  const live = all.filter((r) => r.deletedAt === null);

  const ranked = needle
    ? live
        .map((r) => ({ r, tier: matchTier(config.searchTiers(r), needle) }))
        .filter((x) => x.tier >= 0)
    : live.map((r) => ({ r, tier: 0 }));

  ranked.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier; // metadata matches first
    const byKey =
      compareValues(
        config.sortValue(a.r, query.sort),
        config.sortValue(b.r, query.sort),
      ) * sign;
    if (byKey !== 0) return byKey;
    // Stable total order across pages: id breaks every remaining tie.
    return a.r.id < b.r.id ? -1 : a.r.id > b.r.id ? 1 : 0;
  });

  const offset = decodeCursor(query.cursor);
  const rows = ranked.slice(offset, offset + limit).map((x) => x.r);
  const nextOffset = offset + rows.length;
  const nextCursor =
    nextOffset < ranked.length ? encodeCursor(nextOffset) : null;
  return { rows, nextCursor };
}
