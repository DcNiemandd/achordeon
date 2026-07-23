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
        // No session persistence: the Audience path is anonymous, and hosting
        // rides whatever auth Epic 10 later adds. Realtime needs no stored token.
        auth: { persistSession: false, autoRefreshToken: false },
      });
    })();
    return this.clientPromise;
  }
}
