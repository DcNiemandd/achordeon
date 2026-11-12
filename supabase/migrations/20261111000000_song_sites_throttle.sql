-- The Song sites proxy's rate limit (plans/import-chord-sheets.md, Q55).
--
-- The same ledger `feedback_throttle` keeps, for the same reason: a per-IP
-- budget has to be counted somewhere the function can read, and it holds only a
-- salted hash of the address and when it asked. Nothing about the song, the
-- search or the site is stored (ADR-0019).
create table if not exists public.song_sites_throttle (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  created_at timestamptz not null default now()
);

-- No policies: only the function, with the service role, reads or writes it.
alter table public.song_sites_throttle enable row level security;

-- RLS and table privileges are separate, and both have to say yes. Without this
-- grant every call fails with 42501, the limiter reads that as "cannot tell"
-- and lets the call through, and the limit silently never trips.
grant select, insert, delete on public.song_sites_throttle to service_role;

-- The only query this table serves: "how many from this hash since T". Rows
-- older than the window are swept by the function, so it stays small.
create index if not exists song_sites_throttle_lookup
  on public.song_sites_throttle (ip_hash, created_at desc);
