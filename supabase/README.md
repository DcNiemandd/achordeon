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

`supabase start` prints an **API URL** and **anon key**. With the local stack
these are the fixed defaults already baked into
`apps/app/src/app/supabase.config.ts`:

- API URL: `http://127.0.0.1:54321`
- anon key: the standard local demo JWT

So the app talks to your local stack out of the box — just `supabase start`,
then run the app (`pnpm nx serve app`). Open Studio at `http://127.0.0.1:54323`.

## Try the lobby

1. On **Stage**, perform a songbook → **Create an audience** → **Create lobby**.
   A PIN and QR appear.
2. Open the app in another tab/device, go to **Audience**, type the PIN (or scan
   the QR / open `/audience/<PIN>`). The performer's current song appears and
   follows prev/next live. The host dialog shows the listener count.

Presence needs no auth, so the follow-along works immediately. The
`lobby_events` inserts are **best-effort** and RLS is insert-by-owner, so until
Auth lands (Epic 10) they are silently denied — the live path is unaffected.

## Deploying to a hosted project

Replace the values in `apps/app/src/app/supabase.config.ts` with your project's
URL + anon key (dashboard ▸ Settings ▸ API), and push the migration:

```bash
supabase link --project-ref <ref>
supabase db push
```

Set `url` to `''` to build the app with **no backend** (offline-only): the
Audience UI then reports itself unavailable instead of erroring.
