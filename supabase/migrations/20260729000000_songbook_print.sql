-- The book-bound print settings, on the songbook row.
--
-- A songbook's print STRUCTURE — a title page, a contents page, page numbers and
-- where they sit — is a property of the book, not of the device it prints from.
-- "This hymnal has a contents page" travels with the hymnal, so it syncs; the
-- paper it lands on (size, margin) is the device's and stays local.
--
-- Nullable with no default, like `profiles.all_songs_order`: "this book has never
-- said" and "this book chose the standard layout" are different facts, and a
-- `default '{}'::jsonb` would erase the difference on every existing row. The
-- client maps null to `undefined` and resolves the default at the point of use
-- (resolveSongbookPrint).
--
-- Additive on both sides: no local schema version bump (ADR-0007,
-- preserve-unknown) and no backfill. `public.songbooks` is granted wholesale
-- (see 20260724170000_sync_grants.sql), so — unlike the per-column `profiles` —
-- a new column here needs no separate grant to be writable.

alter table public.songbooks
  add column if not exists print jsonb;
