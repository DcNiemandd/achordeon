-- The All songs order, on the account row.
--
-- The virtual "All songs" songbook has no stored order — a real book's order IS
-- its content, an array of slots, and this one has no array. So its order is
-- *described* instead (axis, direction, favourites-first) and the description has
-- to live somewhere that syncs: you sorted your library, and it is the same
-- library on the phone you perform from as on the laptop you arranged it on.
--
-- `profiles` is that somewhere. It already mirrors the local singleton `user`
-- record for the per-row LWW merge (ADR-0004), which is exactly the reconciliation
-- this needs — two devices reordering offline settle by `updated_at` like any
-- other row.
--
-- Nullable with no default, deliberately. "This account has never said" and "this
-- account chose alphabetical" are different facts, and only the first may be
-- overwritten by a device that has an opinion; a `default '{}'::jsonb` would erase
-- that difference on every existing row. The client maps null to `undefined` and
-- resolves the default at the point of use.
--
-- Additive on both sides: no local schema version bump (ADR-0007,
-- preserve-unknown) and no backfill here. An older client simply never writes the
-- column, and its pushes keep working.

alter table public.profiles
  add column if not exists all_songs_order jsonb;

-- The column grants are per-column on this table (the tier flag is server-owned,
-- so `profiles` cannot be granted wholesale — see 20260724170000_sync_grants.sql).
-- A new column is therefore invisible to the client until it is named here, and
-- the symptom of forgetting is a silent 403 on the whole upsert.
grant insert (all_songs_order) on public.profiles to authenticated;
grant update (all_songs_order) on public.profiles to authenticated;
