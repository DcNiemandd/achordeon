// Domain entity shapes — Epic 1 ▸ subtask 2
// Spec: docs/PRD-DOMAIN-MODEL.md (§Base record, §Song, §Songbook)

import type {
  GlobalSettings,
  SongSettings,
  SongbookSettings,
} from './settings';
import type { SongbookPrint } from './songbook-print';

/** Stable, client-generated id (survives rename). */
export type Uuid = string;

/**
 * Persisted-entity envelope. Every stored record extends this.
 * PRD-DOMAIN-MODEL.md §Base record.
 */
export interface BaseRecord {
  id: Uuid; // stable, client-generated; survives rename
  createdAt: number; // epoch ms
  updatedAt: number; // epoch ms; bumped on every meaningful change
  deletedAt: number | null; // tombstone; null = live. Lists filter out non-null.
}

/**
 * How the virtual **All songs** songbook is ordered (CONTEXT.md §Songbook).
 *
 * A stored book's order IS its content — an array of slots. All songs has no such
 * array, so its order has to be *described* instead: an axis, a direction, and
 * whether favourites float. The same three questions the Song explorer asks, so
 * the description and the list's own controls speak one vocabulary.
 *
 * `sort` is structurally the paging layer's `SortKey`, and deliberately declared
 * here rather than imported from it: the domain sits below `shared/data-access` in
 * the import ladder, and this is a fact about the library's own book, not about
 * the query that happens to serve it. A drift between the two breaks the build at
 * the store, which is the only place that spans both.
 */
export interface AllSongsOrder {
  sort: 'name' | 'created' | 'changed';
  dir: 'asc' | 'desc';
  favoritesFirst: boolean;
}

/**
 * What All songs is ordered by until someone says otherwise: names, A→Z, with
 * favourites left in place.
 *
 * Alphabetical because it is the only axis whose answer does not change under you
 * — "created" reorders the book every time you write a song, which is a strange
 * thing for the list you go to *find* something in to do.
 */
export const DEFAULT_ALL_SONGS_ORDER: AllSongsOrder = {
  sort: 'name',
  dir: 'asc',
  favoritesFirst: false,
};

/**
 * Account row (the `user` Dexie table / Snapshot `user[]`). PRD-INFRASTRUCTURE.md §1/§4.
 * Holds only account-global state that should travel to every device; device-local
 * bookkeeping (deviceId, sync watermark) lives outside the Snapshot.
 */
export interface User extends BaseRecord {
  username: string; // mirrored to Supabase for username-keyed requests
  planCache: 'free' | 'pro'; // cached tier; source of truth is Supabase profiles.plan
  settings: GlobalSettings; // Global scope render defaults — base of the cascade (ADR-0006)
  /**
   * The All songs order (see {@link AllSongsOrder}). Account-global, so it travels
   * to every device — you sorted *your library*, and it is the same library on the
   * phone you perform from as on the laptop you arranged it on.
   *
   * **Optional, and that is the schema story**: an added field is additive, so
   * ADR-0007's preserve-unknown makes it lossless with no migration step and no
   * `SCHEMA_VERSION` bump — an older client round-trips it untouched, and a row
   * written before it existed reads back as `undefined` and resolves to
   * {@link DEFAULT_ALL_SONGS_ORDER}.
   *
   * Not a member of the `SETTINGS` registry, though it is a preference: that
   * registry is *render* settings, which cascade Global → Songbook → Song and get
   * resolved into a render (ADR-0006). An ordering is not a property of a drawn
   * page — it would ride into `RenderOpts` meaning nothing — and it has exactly
   * one scope, the account, where every render setting has three.
   */
  allSongsOrder?: AllSongsOrder;
}

/**
 * The id of the one `User` row. There is exactly one account per library, so the
 * row is a singleton and its id is a constant rather than minted per device —
 * two devices editing their global settings offline must produce the SAME row for
 * per-row LWW (ADR-0004) to reconcile them, and random ids would instead merge
 * into two accounts and let `find` pick whichever came first.
 *
 * Like `ALL_SONGS_ID`, an id `crypto.randomUUID()` cannot produce.
 */
export const LOCAL_USER_ID = 'local-user';

/**
 * Parser cache — DERIVED, never authored. Rewritten from `content` on save.
 * PRD-DOMAIN-MODEL.md §Song.
 */
export interface SongCache {
  title: string; // effective Title resolved from content ("last wins")
  subtitle: string; // effective Subtitle resolved from content
}

/**
 * A song record. PRD-DOMAIN-MODEL.md §Song.
 */
export interface Song extends BaseRecord {
  name: string; // library label (find/list); freely editable. ≠ Title.
  content: string; // source text — Title (* …), Subtitle (** …), blocks, chords all live here
  favorite: boolean; // global per-song flag, sortable
  settings: SongSettings; // sparse render overrides (see Settings model)
  cache: SongCache; // DERIVED — see above
}

/**
 * The virtual **All songs** songbook (CONTEXT.md §Songbook).
 *
 * Always present, never stored: a read-only-order view of the whole library that
 * cannot be reordered and from which songs cannot be removed. It is an id
 * `crypto.randomUUID()` cannot produce, so a real songbook can never collide with
 * it — which is what lets `/songbooks/:id` carry both without a second route.
 */
export const ALL_SONGS_ID = 'all-songs';

/** True for the virtual songbook — the one every write path must refuse. */
export function isAllSongs(id: Uuid): boolean {
  return id === ALL_SONGS_ID;
}

/**
 * A songbook record. PRD-DOMAIN-MODEL.md §Songbook.
 */
export interface Songbook extends BaseRecord {
  name: string; // library label
  title: string; // title-page fields — AUTHORED via GUI, not parsed
  subtitle: string;
  author: string;
  settings: SongbookSettings; // sparse render overrides (see Settings model)
  entries: Uuid[]; // ordered Song references; a songId MAY repeat (a "slot")
  /**
   * The book-bound half of its print settings — title page, summary, page numbers
   * (see {@link SongbookPrint}). The device-bound half (paper size, margins) is
   * NOT here; it lives device-local.
   *
   * **Optional, and that is the schema story** (like {@link User.allSongsOrder}):
   * additive, so ADR-0007's preserve-unknown makes it lossless — an older client
   * round-trips it, and a row written before it existed reads back as `undefined`
   * and resolves through {@link resolveSongbookPrint} to the default book.
   */
  print?: SongbookPrint;
}
