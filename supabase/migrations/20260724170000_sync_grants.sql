-- Epic 10 follow-up — table privileges for the sync schema.
--
-- RLS decides WHICH rows a role may touch; a GRANT decides whether the role may
-- touch the table AT ALL. The sync-schema migration set up RLS but never granted
-- the tables to `authenticated`, so every signed-in request failed with 42501
-- (permission denied) — a 403, before RLS was even consulted. The lobby tables
-- granted explicitly; these must too.
--
-- `plan` is deliberately LEFT OUT of the profile insert/update column grants: the
-- tier is server-owned (dashboard / monetization webhook), so even though RLS
-- lets a user write their own profile row, they cannot raise their own tier.

grant usage on schema public to authenticated;

grant select on public.profiles to authenticated;
grant insert (id, record_id, username, settings, created_at, updated_at, deleted_at)
  on public.profiles to authenticated;
grant update (record_id, username, settings, created_at, updated_at, deleted_at)
  on public.profiles to authenticated;

grant select, insert, update on public.songs to authenticated;
grant select, insert, update on public.songbooks to authenticated;
-- songbook_songs is rewritten wholesale on a reorder (clear-and-reinsert), so it
-- is the one sync table that also needs DELETE.
grant select, insert, update, delete on public.songbook_songs to authenticated;
