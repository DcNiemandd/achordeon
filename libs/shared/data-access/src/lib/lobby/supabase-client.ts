// Supabase client seam — Epic 9 ▸ Audience transport
// Spec: ADR-0003 (Realtime Presence), ADR-0008 (third-party behind one adapter)
//
// `@supabase/supabase-js` is quarantined to this `lobby/` folder. The client is
// created **lazily, on the first lobby action**, via `import()`: the SDK is
// ~120 KB and the Audience path is a network feature nobody on the app shell
// pays for until they host or join (the same on-gesture split Epic 7 uses for
// jsPDF/fflate). Statically importing it would drag it into the initial bundle
// and dent the 1 MB budget for a feature most sessions never touch.

import { InjectionToken, Injectable, inject } from '@angular/core';
import type { SupabaseClient } from '@supabase/supabase-js';

/** URL + publishable anon key. Both are public by design (RLS is the guard). */
export interface SupabaseConfig {
  readonly url: string;
  readonly anonKey: string;
}

/**
 * The deployment's Supabase coordinates, or `null` when the app is built without
 * a backend (offline-only). Provided in `app.config.ts`; `null` by default so a
 * config-less build still boots — the lobby services degrade to "not configured"
 * rather than throwing.
 */
export const SUPABASE_CONFIG = new InjectionToken<SupabaseConfig | null>(
  'SUPABASE_CONFIG',
  { factory: () => null },
);

/**
 * Owns the one `SupabaseClient` for the app, created on demand and cached.
 *
 * Root-scoped so the host channel and any viewer share a single realtime socket.
 * `client()` returns `null` when there is no config — callers surface that as an
 * "audience unavailable" state instead of crashing.
 */
@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private readonly config = inject(SUPABASE_CONFIG);
  private clientPromise: Promise<SupabaseClient | null> | null = null;

  /** True when a backend is configured — the lobby UI reads this to gate hosting. */
  get isConfigured(): boolean {
    return this.config !== null;
  }

  /**
   * The shared client, or `null` if unconfigured. Memoised: the dynamic import
   * and the socket setup happen once, and every subsequent call resolves to the
   * same instance.
   */
  async client(): Promise<SupabaseClient | null> {
    const config = this.config;
    if (config === null) return null;
    this.clientPromise ??= (async () => {
      const { createClient } = await import('@supabase/supabase-js');
      return createClient(config.url, config.anonKey, {
        // Session persistence is ON (Epic 10): auth keeps the user logged into
        // Achordeon across reloads (PRD-INFRASTRUCTURE.md §5) and its `auth.uid()`
        // is what the paid-tier sync RLS and the lobby-events insert-by-owner
        // policy fence on. The Audience *viewer* path is still anonymous — it
        // simply has no session to persist — so sharing this one client (one
        // socket) across auth, sync and lobby is correct.
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          // Shortest-lived sync tokens (PRD-INFRASTRUCTURE.md §7) — see below.
          storage: PROVIDER_TOKENS_STRIPPED,
        },
      });
    })();
    return this.clientPromise;
  }
}

/** The Google credentials that must never outlive the tab (§7). */
const PROVIDER_TOKEN_KEYS = ['provider_token', 'provider_refresh_token'];

/**
 * `localStorage`, minus the Google tokens.
 *
 * The Supabase session has to persist — it is what keeps the user signed in across
 * reloads and what the sync RLS fences on. But the session object it writes also
 * carries the OAuth `provider_token` and, if a grant ever asks for offline access,
 * the **long-lived Google refresh token** — and §7 is explicit that the refresh
 * token never sits in the browser, because the top real risk here is XSS reading
 * exactly this. Storing a Drive credential at rest buys nothing either: Achordeon's
 * Drive backup is two buttons a human presses, so a fresh token per session is all
 * it ever needs (§6, and Flow A already re-mints one in a single click).
 *
 * So the session is persisted with those two fields removed. The live session
 * signal still has the token for the page it was minted on, which is where the
 * upload happens; after a reload it is genuinely gone, which is what
 * `AuthService.providerToken()` has always claimed.
 *
 * Anything that is not a JSON object passes through untouched — this is a filter
 * on one shape, not a parser of everything Supabase might store.
 */
const PROVIDER_TOKENS_STRIPPED = {
  getItem: (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      localStorage.setItem(key, withoutProviderTokens(value));
    } catch {
      // Private mode or quota: the session simply does not persist. Signing in
      // still works for this tab, which is the whole of what it can promise.
    }
  },
  removeItem: (key: string): void => {
    try {
      localStorage.removeItem(key);
    } catch {
      // Nothing was stored; nothing to remove.
    }
  },
};

function withoutProviderTokens(value: string): string {
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed === null || typeof parsed !== 'object') return value;
    const record = parsed as Record<string, unknown>;
    if (!PROVIDER_TOKEN_KEYS.some((key) => key in record)) return value;
    for (const key of PROVIDER_TOKEN_KEYS) delete record[key];
    return JSON.stringify(record);
  } catch {
    return value;
  }
}
