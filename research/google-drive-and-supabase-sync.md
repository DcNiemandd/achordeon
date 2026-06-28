# Cloud Sync Research: manual Google Drive backup (all users) & automatic Supabase DB sync (paid tier)

> Research notes for Achordeon. Angular 21 SPA, Nx monorepo, GitHub Pages. No data
> layer, auth, or Supabase exist yet — this is greenfield design.

## TL;DR

- Local source of truth: **IndexedDB** (`user`, `songs`, `songbooks`). Everything else
  is a push/pull target.
- **Manual Google Drive backup (`drive.file`), available to _everyone_:** the whole DB
  serialized to one visible JSON file in the _user's_ Drive. Costs you nothing. Two manual
  buttons. This is the **only** sync the free tier gets, and it stays **unchanged** for
  paid users — same two buttons, same behavior.
- **Paid tier adds automatic Supabase sync on top:** real relational tables + RLS +
  **Realtime**, syncing **automatically** in the background. This is the only path that
  gives genuine live multi-device sync, and the natural thing to charge for because it
  actually costs you to run. Drive is **not** auto-synced for anyone — paid users get
  automatic _Supabase_ sync plus the same _manual_ Drive backup as free users.
- One abstraction (`SyncBackend`) covers both; they speak the same in-memory snapshot, so
  a paid user can run **both at once** (auto Supabase as the live tier + manual Drive as a
  user-owned backup) with no data migration.
- Token reality: Supabase keeps the user logged into _your app_ automatically, but the
  **Google Drive token is short-lived (~1h) and not refreshed by Supabase**. Two flows
  handle expiry: re-consent redirect (zero infra) or an Edge Function token-broker
  (silent, recommended once you have any server).

---

## 1. Architecture overview

```
            ┌─────────────────────────── Browser (Angular SPA) ───────────────────────────┐
            │                                                                              │
            │   UI / two buttons ──▶  SyncService ──▶  SyncBackend (interface)             │
            │                              │                                               │
            │                       IndexedDB  ◀── single source of truth                  │
            │                     (user, songs, songbooks)                                 │
            └──────────────┬───────────────────────────────────┬───────────────────────────┘
                           │ snapshot ⇄ JSON file              │ snapshot ⇄ rows / Realtime
                  MANUAL (two buttons)                  AUTOMATIC (background)
                           ▼                                    ▼
                 Google Drive (drive.file)            Supabase Postgres (+ RLS + Realtime)
                 "achordeon-backup.json"              songs / songbooks / songbook_songs
                 ALL USERS — user's storage           PAID ONLY — your storage, live sync
```

**Design rule:** IndexedDB is always the client's source of truth. Backends are dumb
push/pull targets. This keeps the app offline-first and makes backend-switching safe.

---

## 2. Local store & the snapshot envelope

IndexedDB tables: `user` (provisional, future-proofs accounts/plan), `songs`,
`songbooks`. Recommend giving every record a **stable client-generated UUID `id`** now
(in addition to the human `name`). It costs nothing today and makes _both_ sync paths
robust — without a stable id, matching records across devices falls back to `name`,
which collides and forces painful merges.

Both backends translate to/from one in-memory **snapshot**:

```jsonc
{
  "schemaVersion": 1,
  "deviceId": "uuid-per-browser", // who wrote this
  "updatedAt": "2026-06-26T10:00:00Z", // logical clock for last-write-wins
  "data": {
    "user": [
      /* provisional; local/anon for now */
    ],
    "songs": [{ "id": "uuid", "name": "...", "title": "...", "content": "...", "settings": {}, "isFavorite": false, "createdDate": "...", "lastModifiedDate": "...", "deletedAt": null }],
    "songbooks": [{ "id": "uuid", "name": "...", "songIds": ["uuid", "..."], "createdDate": "...", "lastModifiedDate": "...", "deletedAt": null }],
  },
}
```

Note the `deletedAt` **tombstones** — needed so deletions propagate during sync instead
of deleted records silently reappearing from the other side.

> Tip: **Dexie** (thin IndexedDB wrapper) + `dexie-export-import` produces this kind of
> blob for free and gives typed tables. Worth using over raw IndexedDB.

---

## 3. The switchable backend abstraction (answers "how to switch")

One port the whole app talks to:

```ts
type Snapshot = { schemaVersion: number; deviceId: string; updatedAt: string; data: {...} };
type Unsubscribe = () => void;

interface SyncBackend {
  readonly id: 'drive' | 'supabase';
  push(snapshot: Snapshot): Promise<void>;      // local → remote
  pull(): Promise<Snapshot>;                     // remote → local
  subscribe?(onChange: (s: Snapshot) => void): Unsubscribe; // realtime; optional
}
```

- `DriveSyncBackend` — serializes the snapshot to one JSON file, up/downloads it. No
  `subscribe` (Drive has no good browser change-push; polling `modifiedTime` is the only
  option and is wasteful).
- `SupabaseSyncBackend` — maps the snapshot to **row upserts** and back; implements
  `subscribe` via Supabase **Realtime**.

**The two backends are not mutually exclusive — they layer:**

- **`DriveSyncBackend` is always wired to the two manual buttons, for every user** (free
  and paid alike). It never runs automatically.
- **`SupabaseSyncBackend` is added for paid users only** (gated by `profiles.plan`) and is
  driven **automatically** — `push` on local change + `subscribe` via Realtime for inbound
  deltas. Paid users still keep the manual Drive buttons unchanged.

So the per-user toggle isn't "which backend" but "is automatic Supabase sync enabled"
(a `profiles.plan === 'pro'` check). Drive is constant; Supabase is the additive paid
layer. Both buttons and the rest of the app are backend-agnostic — you wire one or two
implementations behind the interface, nothing else changes.

**Migrating/seeding between backends is trivial** because both speak `Snapshot`:
Drive → Supabase = `pull()` from Drive into IndexedDB, then `push()` to Supabase. No data
conversion — which is exactly how a free user's manual Drive backup becomes the starting
point for their automatic Supabase sync when they upgrade.

---

## 4. Google Drive backend (free tier)

### Scope: use `drive.file`. Here's exactly why `drive.appdata` is worse.

|                                       | `drive.file` ✅                              | `drive.appdata`                                                              |
| ------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------- |
| Google sensitivity tier               | **Non-sensitive**                            | **Sensitive**                                                                |
| App verification before public launch | **None**                                     | **Required** (else "unverified app" warning + 100-user cap while in testing) |
| Visible to user in Drive              | Yes — they can see/download/back up the file | **No** — hidden app folder                                                   |
| Works with your export/import feature | Yes — same visible, shareable JSON           | No — app-private, not shareable                                              |
| Survives the user revoking the app    | Yes — it's a normal file they own            | **No** — appdata is deleted, unrecoverable                                   |
| Tied to OAuth app identity            | No                                           | Yes — certain client/project changes can orphan it                           |

**What is genuinely worse about `drive.appdata`:**

1. **Verification tax.** It's a _sensitive_ scope, so before a public launch Google
   requires app verification; until then users hit the scary "Google hasn't verified
   this app" screen and you're capped at 100 test users. `drive.file` skips all of that.
2. **Opacity.** The user can't see, export, or recover the data themselves — worse for
   trust, support, and manual backup.
3. **No interop** with Achordeon's documented export/import (visible, hand-it-to-another-
   machine JSON).
4. **Data loss on revoke.** Revoking the app deletes the appdata; a visible `drive.file`
   just stays in their Drive.

`drive.appdata`'s only upside is "hidden so the user can't accidentally edit/delete it."
For Achordeon, **visibility is a feature** (it _is_ the export/import file) and dodging
verification matters — so `drive.file` is correct. Never request full `drive` (restricted
scope → expensive annual CASA security assessment).

### Drive REST surface (browser-callable with the bearer token)

- Find file: `GET /drive/v3/files?q=name='achordeon-backup.json'&fields=files(id,name,modifiedTime)`
- Create (first push): `POST /upload/drive/v3/files?uploadType=multipart`
- Update (later pushes): `PATCH /upload/drive/v3/files/{id}?uploadType=media`
- Download (pull): `GET /drive/v3/files/{id}?alt=media`

### Button behavior + conflict handling

- **Sync to Drive (push):** serialize IndexedDB → if a backup exists, compare its
  `modifiedTime` / envelope `updatedAt` to your locally stored `lastSyncedUpdatedAt`; if
  Drive moved ahead (another device wrote it), **warn before overwriting**; else upload.
- **Load latest (pull):** download → apply via the documented import rules
  (`export-import.mdx`): songbooks created new, songs offer replace/ignore/create-new.
  For a plain "restore latest", full-replace is fine.
- **Conflict model v1:** whole-file **last-write-wins with a guard**. Enough because the
  dataset is small and edits are mostly single-user. True multi-device merge is deferred
  to the Supabase path.

---

## 5. Supabase backend (paid tier) — use the DB, not blobs

A relational schema (not a JSON blob in Storage) is what unlocks Realtime, partial sync,
sharing, and integrity.

```sql
-- App profile carrying the plan flag (auth.users is managed by Supabase)
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  plan text not null default 'free',          -- 'free' | 'pro'
  updated_at timestamptz not null default now()
);

create table songs (
  id uuid primary key,                          -- SAME id as the local record
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  title text,
  content text,
  settings jsonb,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,                       -- tombstone
  unique (user_id, name)
);

create table songbooks (
  id uuid primary key,
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, name)
);

-- ordered membership (a songbook is an ordered list of songs)
create table songbook_songs (
  songbook_id uuid not null references songbooks on delete cascade,
  song_id     uuid not null references songs     on delete cascade,
  position    int  not null,
  primary key (songbook_id, song_id)
);

-- RLS: each user sees only their own rows
alter table profiles  enable row level security;
alter table songs     enable row level security;
alter table songbooks enable row level security;
alter table songbook_songs enable row level security;

create policy "own songs"     on songs     for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own songbooks" on songbooks for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- songbook_songs: authorize via the parent songbook's user_id (join check)
```

### Why relational beats a blob here

- **Realtime.** Subscribe to `postgres_changes` on `songs`/`songbooks` filtered to
  `user_id` → live multi-device sync, the thing Drive can't do. (Supabase + Angular
  Realtime is a documented, supported combo.)
- **Per-row upserts** = small writes, row-level conflict resolution, incremental pull.
- **Integrity & queries**: foreign keys, server-side filter/sort, future sharing of a
  single song/songbook.

### Sync mechanics (DB path)

- **Push:** upsert rows where local `lastModifiedDate > lastSyncedAt`, keyed by `id`;
  propagate deletes by setting `deleted_at` (tombstone).
- **Pull (incremental):** `select ... where updated_at > lastPulledAt`; apply to
  IndexedDB, honoring tombstones; ordered membership via `songbook_songs.position`.
- **Realtime:** `subscribe()` applies row deltas to IndexedDB as they arrive.
- **Conflict:** per-row `updated_at` last-write-wins (optionally + `deviceId`).

### Monetization hook

`profiles.plan` gates the **automatic Supabase backend** via RLS / app logic. The split
is _additive_, not either/or:

- **Free** = manual Drive backup only (their storage, your cost ≈ 0).
- **Pro** = automatic Supabase sync (realtime, multi-device, sharing — you host it, they
  subscribe) **plus** the same manual Drive backup free users get.

Same `Snapshot` on both sides → upgrading is frictionless: the existing manual Drive
backup can seed the first Supabase push, and downgrading just stops the automatic Supabase
layer while the Drive buttons keep working.

---

## 6. Token lifetime & auto-login flow (the critical UX detail)

### What persists automatically, and what doesn't

`supabase-js` defaults to `persistSession: true` + `autoRefreshToken: true`. The
**Supabase** session is saved in `localStorage`; on every page load `getSession()`
restores it and the client silently refreshes _its own_ access token using the
long-lived Supabase refresh token.

➡️ **The user stays logged into Achordeon automatically across reloads.** ✅
(Default storage is `localStorage`, not cookies — same effect for a SPA; cross-device
still needs a fresh login.)

**But the Google `provider_token` is different.** Per Supabase docs: _"Supabase Auth does
not manage refreshing the provider token... provider tokens are intentionally not stored
in your project's database."_ So:

- The Google access token (`provider_token`, ~1h life) is present **only in the tab right
  after the OAuth redirect**.
- After the first Supabase token refresh (or any reload), `provider_token` /
  `provider_refresh_token` are **gone** from the session.

➡️ **You cannot rely on `session.provider_token` being there when the user clicks Sync**
later in the session or after a reload. This is _the_ problem to design around.

### "User works longer than the Drive token is valid" — the two real flows

**Flow A — Browser-only, re-consent redirect (zero infra).**
When Sync is clicked and `provider_token` is missing/expired, call `signInWithOAuth`
again with the Drive scope. Because the user already has a live Google session cookie and
previously granted consent, Google round-trips back **quickly and usually without showing
the consent screen** (at most a brief account flash), handing back a fresh
`provider_token`. Then run the sync.

- Cost: it's a **full-page redirect** — persist the "user wanted to sync" intent in
  `localStorage` and resume after the redirect. No data loss (IndexedDB already holds
  everything) — just a visual flash.
- Verdict: acceptable for **manual buttons**, and needs **no server**. Good v1.

**Flow B — Edge Function token-broker (silent, recommended once you have any server).**

1. At first login use `queryParams: { access_type: 'offline', prompt: 'consent' }` to get
   a **`provider_refresh_token`**; immediately send it to a Supabase **Edge Function**
   that stores it encrypted (Vault or a `google_credentials` table with RLS).
2. When the browser needs a Drive token, it calls the Edge Function (authed with the
   Supabase JWT). The function POSTs to `https://oauth2.googleapis.com/token` with
   `grant_type=refresh_token`, `client_id`, **`client_secret` (server-side only)**, and
   the stored refresh token → returns a fresh `access_token`. The function hands just the
   access token back to the browser.
3. Browser calls Drive with it. **Silent, no redirect, works indefinitely** until the
   user revokes access.

- Why a server at all: the refresh requires Google's `client_secret`, which **must never**
  ship in a browser SPA. Hence the Edge Function.
- Caveat: while your Google OAuth app is in **"Testing"** publishing status, refresh
  tokens expire after **7 days**; once **"Published"** they're long-lived. Revocation by
  the user also invalidates them (handle `401/403` → re-consent via Flow A).
- Bonus: this Edge Function is **the same server piece** you need for the Supabase paid
  tier, so building it does double duty.

**Recommendation:** ship v1 with **Flow A** (no infra). Move to **Flow B** the moment you
add any backend — it removes the redirect flash and is mandatory for any background/auto
sync.

### Token flow at a glance

```
App load ──▶ Supabase session restored from localStorage ──▶ user logged into Achordeon ✅ (auto)
                                                              │
User clicks "Sync to Drive"                                   │ provider_token? (often expired/absent)
   │                                                          ▼
   ├─ present & valid ───────────────────────────────▶ call Drive REST, done
   │
   ├─ Flow A (no server): signInWithOAuth(drive scope) ─▶ quick redirect (no consent UI) ─▶ fresh token ─▶ Drive
   │
   └─ Flow B (Edge Fn):  POST refresh_token + client_secret (server) ─▶ fresh token ─▶ Drive  (silent)
```

---

## 7. Honest take on "realtime"

- **Drive can't do good browser realtime** — its `changes.watch` needs a public webhook
  (server) and still isn't low-latency. Polling `modifiedTime` is the only browser-only
  option and is wasteful.
- **Realtime + automatic sync = the Supabase path**, via `postgres_changes`. This is the
  tier split: Drive stays a **manual** backup for everyone; Supabase is the **automatic**,
  live experience you charge for. Drive is never put on a timer/auto-push — automation
  lives entirely on the Supabase side.
- v1: manual Drive buttons for all. Paid layer: automatic Supabase sync — `push` on local
  change (debounced) + Realtime `subscribe` for inbound deltas (last-write-wins per row).

---

## 8. Open questions to settle before building

1. **Dexie vs raw IndexedDB** (recommend Dexie + `dexie-export-import`).
2. Add the **stable UUID `id`** to local records from day one (enables clean matching on
   both sync paths).
3. **Google Cloud Console + Supabase provider** config: OAuth consent screen, `drive.file`
   scope must be requested by Supabase or the `provider_token` won't carry it; publishing
   status (Testing vs Published) affects refresh-token lifetime.
4. **Re-auth UX** for Flow A: silent redirect vs an explicit "Reconnect Google Drive"
   button.
5. **Where the `plan` flag lives** (`profiles.plan`) and how RLS enforces the paid tier.

---

## Sources (verified via Context7)

- Supabase `/supabase/supabase`: provider tokens not refreshed/stored; `access_type=offline`
  - `prompt=consent` for `provider_refresh_token`; session persistence & auto-refresh;
    RLS policy patterns; refresh-token endpoint usage; Supabase + Angular Realtime example.
- Google Workspace Drive `/websites/developers_google_workspace_drive`: scope tiers,
  `files` create/list/upload, `appDataFolder` vs visible files.
