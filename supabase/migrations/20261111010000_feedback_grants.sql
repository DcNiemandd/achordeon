-- Table privileges for the feedback function's two tables (20260802000000).
--
-- RLS and table privileges are separate, and both have to say yes. That
-- migration relied on service_role bypassing RLS, which it does, but a bypass
-- of RLS is not a GRANT: on a database whose default privileges give new tables
-- to no API role (the local Postgres 17 image does exactly that), every call
-- the function made failed with 42501. The limiter read that as "cannot tell"
-- and let every report through, and a report GitHub refused could not be stored
-- either, so it was lost. The same gap `20260724170000_sync_grants.sql` closed
-- for `authenticated`.
--
-- Only what the function does: count, record and sweep the ledger, and add a
-- report. It never reads a report back, so it gets no select on that table.
-- Granting is idempotent, so a database that already had these loses nothing.
grant select, insert, delete on public.feedback_throttle to service_role;
grant insert on public.feedback_reports to service_role;
