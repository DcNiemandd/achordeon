-- Retention purge — erase accounts 90 days after they were deleted, keeping an
-- anonymized trace. Backs the "held for 90 days, then erased for good" promise in
-- apps/docs/docs/account-data.mdx (OAuth verification). Deletion sets
-- `profiles.deleted_at` (a client epoch-ms tombstone); until now nothing removed
-- the rows, so the data lived on and revived on sign-in. This closes that.

create extension if not exists pg_cron;

-- One row per purged account. No id, email, username or content — just the shape
-- of what was there, so the aggregate outlives the account it came from. Written
-- only by the definer function below; RLS on with no policy and no grant means no
-- signed-in role can read it.
create table if not exists public.deleted_account_stats (
  id               bigint generated always as identity primary key,
  songs_count      integer not null,
  songbooks_count  integer not null,
  account_age_days integer,
  plan             text not null,
  purged_at        timestamptz not null default now()
);

alter table public.deleted_account_stats enable row level security;

-- Snapshot the aged-out accounts into stats, then delete their `auth.users` row.
-- Every library FK is `auth.users ... on delete cascade`, so that one delete fans
-- out to the profile, songs, songbooks and songbook_songs — and drops the login
-- itself, which is what makes the erase unrecoverable. Stats are gathered BEFORE
-- the delete, because the cascade takes the rows they count.
--
-- The 90-day gate is `server now() − deleted_at`, trusting the client's
-- `deleted_at` clock (the only deletion time we store). A user can only backdate
-- their OWN deletion, so the worst case is erasing yourself early — harmless.
-- Counts include tombstoned rows: the whole library the account ever held.
create or replace function public.purge_deleted_accounts()
  returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  cutoff bigint := (extract(epoch from now()) * 1000)::bigint
                     - (90 * 24 * 60 * 60 * 1000);
  purged integer := 0;
begin
  insert into public.deleted_account_stats
    (songs_count, songbooks_count, account_age_days, plan)
  select
    (select count(*) from public.songs     s where s.owner = p.id),
    (select count(*) from public.songbooks b where b.owner = p.id),
    case
      when p.created_at = 0 then null
      else greatest(0, ((p.deleted_at - p.created_at) / 86400000))::integer
    end,
    p.plan
  from public.profiles p
  where p.deleted_at is not null
    and p.deleted_at <= cutoff;

  with gone as (
    delete from auth.users u
    where u.id in (
      select p.id
      from public.profiles p
      where p.deleted_at is not null
        and p.deleted_at <= cutoff
    )
    returning 1
  )
  select count(*) from gone into purged;

  return purged;
end;
$$;

-- Only the cron job (running as the function's owner) may fire it. A signed-in
-- caller must never trigger a workspace-wide purge.
revoke execute on function public.purge_deleted_accounts() from public;

-- Daily at 03:17 UTC. Scheduling by name upserts, so re-running this migration
-- updates the one job rather than stacking duplicates.
select cron.schedule(
  'purge-deleted-accounts',
  '17 3 * * *',
  $$select public.purge_deleted_accounts();$$
);
