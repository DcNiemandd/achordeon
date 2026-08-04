-- The privilege the policy sat on top of.
--
-- 20260804000000 added the anon INSERT policy but not the INSERT grant, so an
-- anonymous host still got `42501 permission denied for table lobby_events` —
-- RLS and table privileges are separate systems and both have to say yes. That
-- migration now carries the grant for anywhere built from scratch; this one
-- exists because it had already been applied here, and a migration that has run
-- does not run again.
--
-- Idempotent, so a database that already took the fixed version of the earlier
-- migration is unharmed by this one.

grant insert on public.lobby_events to anon;
