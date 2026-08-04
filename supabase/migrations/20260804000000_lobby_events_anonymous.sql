-- Lobby analytics, from the first lobby — not from the first login.
--
-- The original table (20260723000000) scoped both policies `to authenticated`
-- and made `owner` NOT NULL, on the reasoning that Epic 10 would wire the auth
-- that populates `auth.uid()` and until then denied inserts were harmless.
--
-- They are not harmless, they are a hole in the history: hosting a lobby never
-- required an account (CONTEXT.md §Tier — "the app never requires login"), so
-- the hosts being dropped on the floor are exactly the ones a first look at
-- usage would most want to count. Every anonymous lobby since has logged a 401
-- and vanished.
--
-- So `owner` becomes optional and the anon role may append. Nothing else moves:
-- the table stays append-only (still no update or delete policy), still carries
-- `song_ref` and never song content, and is still never read on the live path.

alter table public.lobby_events
  alter column owner drop not null;

-- A signed-in host still owns its rows; an anonymous one owns none. The check is
-- what stops an anonymous caller writing rows attributed to somebody else —
-- `auth.uid()` is null for the anon role, so `owner` must be null too.
create policy "lobby_events insert anonymous"
  on public.lobby_events
  for insert
  to anon
  with check (owner is null);

-- Read stays owner-only, so anonymous rows are readable by nobody. That is the
-- intended shape rather than an oversight: they belong to no account, and this
-- is a write-only history that only aggregate queries (service role) ever touch.
