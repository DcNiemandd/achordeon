// Domain entity shapes — Epic 1 ▸ subtask 2
// Spec: docs/PRD-DOMAIN-MODEL.md (§Base record, §Song, §Songbook)

import type { SongSettings, SongbookSettings } from './settings';

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
 * A songbook record. PRD-DOMAIN-MODEL.md §Songbook.
 */
export interface Songbook extends BaseRecord {
  name: string; // library label
  title: string; // title-page fields — AUTHORED via GUI, not parsed
  subtitle: string;
  author: string;
  settings: SongbookSettings; // sparse render overrides (see Settings model)
  entries: Uuid[]; // ordered Song references; a songId MAY repeat (a "slot")
}
