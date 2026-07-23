// Supabase coordinates — Epic 9
//
// URL + publishable anon key for the Audience/lobby backend. Both values are
// **public** by design: the anon key is a JWT the browser is meant to hold, and
// Row-Level Security — not secrecy — is what guards the data (ADR-0003). So they
// live in source rather than in a secret store.
//
// The defaults below are the **local Supabase stack** (`supabase start`), whose
// URL and anon key are the same fixed demo values on every machine. To point at
// a deployed project, replace them with that project's URL + anon key from the
// Supabase dashboard (Settings ▸ API).
//
// Set `url` to '' to build with **no backend** — the app boots offline-only and
// the Audience feature reports itself unavailable rather than erroring.

import type { SupabaseConfig } from '@achordeon/shared/data-access';

/** Local `supabase start` defaults (identical across machines). */
export const SUPABASE: SupabaseConfig | null = {
  url: 'http://127.0.0.1:54321',
  anonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlLWRlbW8iLCJpYXQiOjE2NDE3NjkyMDAsImV4cCI6MTc5OTUzNTYwMH0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE',
};
