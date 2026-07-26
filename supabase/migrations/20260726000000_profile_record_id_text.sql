-- Epic 12 ▸ fix — `profiles.record_id` holds a CLIENT id, and a client id is not
-- always a uuid.
--
-- The account row is a singleton: there is one library per account, so its local
-- id is the constant `LOCAL_USER_ID` ('local-user') rather than a per-device
-- `crypto.randomUUID()` — two devices editing their global defaults offline have
-- to produce the SAME row for per-row LWW (ADR-0004) to reconcile them. That
-- constant is deliberately a string a uuid generator cannot mint, which is
-- exactly what a `uuid` column refuses to store: every push carrying the account
-- row failed with `invalid input syntax for type uuid`, and because the push is
-- one transaction the whole sync cycle went with it — so the "you have unsynced
-- changes" warning could never clear.
--
-- `record_id` is a passthrough: nothing joins on it and nothing casts it. It is
-- the client's own id, echoed back so a pull can rebuild that row for the merge,
-- and the client's id space includes sentinels. `text` is what it always was.
alter table public.profiles
  alter column record_id type text using record_id::text;
