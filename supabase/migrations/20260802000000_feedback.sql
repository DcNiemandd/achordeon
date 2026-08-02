-- Feedback — the in-app "report a problem" dialog.
--
-- Both tables are written ONLY by the `feedback` edge function, which runs with
-- the service_role key. RLS is enabled with NO policies at all: that denies every
-- anon and authenticated request outright, while service_role bypasses RLS
-- entirely. So the public anon key — which every browser holds — cannot read or
-- write either table, and the function is the single door. That matters, because
-- the door is where the size caps and the rate limit live; a table anon could
-- insert into directly would have neither.

-- A report that could not be filed as a GitHub issue. The happy path leaves no
-- row here at all: the issue IS the record. This is the fallback, so a GitHub
-- outage (or a lapsed token) loses nobody's bug report.
create table if not exists public.feedback_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- 'bug' | 'idea' | 'other' — the function validates; the check is the backstop.
  kind text not null check (kind in ('bug', 'idea', 'other')),
  message text not null check (char_length(message) between 1 and 4000),
  -- Optional, and only if the reporter typed it: how to write back.
  contact text check (contact is null or char_length(contact) <= 200),
  -- The signed-in reporter, when there was one. No FK: a report must outlive the
  -- account that filed it (accounts are purged, 20260730000000), and it is a note
  -- to the maintainer rather than a relation anything joins on.
  user_id uuid,
  -- What the "send app data" checkbox attached, exactly as the client sent it.
  -- Null when the box was unticked — the absence is the consent record.
  payload jsonb,
  -- Why GitHub refused, so the failure is diagnosable from the row alone.
  github_error text
);

alter table public.feedback_reports enable row level security;

-- The rate limiter's ledger: one row per accepted submission, holding a salted
-- hash of the caller's IP and nothing else. Not the raw address — the function
-- needs to recognise a repeat sender within the hour, which a hash does, and
-- storing the address itself would be collecting something the app has never
-- collected anywhere else (docs/privacy.mdx).
create table if not exists public.feedback_throttle (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  created_at timestamptz not null default now()
);

alter table public.feedback_throttle enable row level security;

-- The only query this table serves: "how many from this hash since T". Rows older
-- than the window are swept by the function on each call, so it stays small.
create index if not exists feedback_throttle_lookup
  on public.feedback_throttle (ip_hash, created_at desc);
