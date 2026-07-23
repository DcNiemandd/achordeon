# Supabase (local) — Audience & lobby

The Audience feature (Epic 9) follows [ADR-0003](../docs/adr/0003-audience-over-realtime-presence.md):
the **live lobby runs entirely over Realtime Presence — no database**. The only
thing the database backs is the append-only `lobby_events` analytics table.

## Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/local-development) (`supabase --version`)
- Docker running (the CLI spins the stack up in containers)

## Run it

From the repo root:

```bash
supabase start          # boots Postgres + Realtime + Auth + Studio in Docker
```

The first run applies the migration in `supabase/migrations/` (the
`lobby_events` table + RLS). On later runs, apply new migrations with:

```bash
supabase db reset       # rebuild from migrations (drops local data)
```

`supabase start` prints an **API URL** and **anon key** (or `supabase status`).
Point the app at them via an env file — one flow, same as production:

```bash
cp .env.local.example .env.local     # defaults already target the local stack
pnpm nx serve app                    # gen-supabase reads .env.local at build
```

Open Studio at `http://127.0.0.1:54323`. If `supabase status` shows a **different
anon key** than the example, paste it into `.env.local` — Kong rejects any other
key with **403**.

## Try the lobby

1. On **Stage**, perform a songbook → **Create an audience** → **Create lobby**.
   A PIN and QR appear.
2. Open the app in another tab/device, go to **Audience**, type the PIN (or scan
   the QR / open `/audience/<PIN>`). The performer's current song appears and
   follows prev/next live. The host dialog shows the listener count.

Presence needs no auth, so the follow-along works immediately. The
`lobby_events` inserts are **best-effort** and RLS is insert-by-owner, so until
Auth lands (Epic 10) they are silently denied — the live path is unaffected.

## How the keys are wired (dev + prod, no manual edits)

`apps/app/src/app/supabase.config.ts` is **generated, never committed**
(`apps/app/tools/gen-supabase.mjs`, gitignored — same pattern as `index.html`).
It runs before `build`/`serve`/`test` and on `pnpm install`, reading the same two
variables from `process.env` first, then `.env.local`:

- **Dev** — `.env.local` (from the example) → local stack. Just works.
- **Prod (CI)** — `.github/workflows/deploy.yml` passes `SUPABASE_URL` +
  `SUPABASE_ANON_KEY` from **repo variables** into the build.

So you never edit a file before a PR — the key comes from the environment.

### Deploying to a hosted project

1. Push the schema:

   ```bash
   supabase link --project-ref <ref>
   supabase db push
   ```

2. In GitHub → **Settings ▸ Secrets and variables ▸ Actions ▸ Variables**, add
   repo **variables** (not secrets — the anon key is public by design, RLS is the
   guard, ADR-0003):
   - `SUPABASE_URL` = `https://<ref>.supabase.co`
   - `SUPABASE_ANON_KEY` = the project's anon key (dashboard ▸ Settings ▸ API)

That's it — every push to `main` builds with those values. Leave the variables
unset to ship **offline-only** (Audience reports itself unavailable rather than
pointing at localhost).

To generate the file by hand (e.g. to point local dev at a hosted project):

```bash
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ANON_KEY=<key> \
  node apps/app/tools/gen-supabase.mjs
```
