// AuthService — Epic 10 ▸ Supabase Auth, tier, provider linking
// Spec: PRD-INFRASTRUCTURE.md §5, ADR-0009 (add-method-only linking; Drive on Google).
//
// The account seam. Everything above it sees signals — is someone signed in, at
// what tier, by which methods — and calls plain async commands; the fact that
// Supabase Auth is behind it never leaks upward (ADR-0008). Login gates cloud
// sync ONLY; it never gates local use (§7), so this service is entirely optional
// to the running app — unconfigured or signed-out, the library still works.

import { Injectable, computed, inject, signal } from '@angular/core';
import type {
  AuthError,
  Session,
  User,
  UserIdentity,
} from '@supabase/supabase-js';
import { SupabaseService } from '../lobby/supabase-client';

/** The paid-tier flag, mirrored from `profiles.plan` (server-owned). */
export type Plan = 'free' | 'pro';

/**
 * Where the account layer is in its lifecycle. `unknown` until the first session
 * read resolves (so the UI can hold rather than flash "signed out"); `unavailable`
 * when the build has no backend (offline-only) — the account UI reports itself
 * off rather than erroring, mirroring the lobby's degrade path.
 */
export type AuthStatus = 'unknown' | 'unavailable' | 'signed-out' | 'signed-in';

/** A sign-up that succeeded but is not yet a session — the inbox owner must
 * click the confirmation link first (ADR-0009). */
export interface SignUpResult {
  needsConfirmation: boolean;
}

/** The Google Drive `drive.file` scope. Requested alongside sign-in when the user
 * connects Drive, so the OAuth grant carries the storage permission (ADR-0009). */
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService);

  private readonly _status = signal<AuthStatus>('unknown');
  private readonly _session = signal<Session | null>(null);
  private readonly _plan = signal<Plan>('free');

  /** Lifecycle state — the UI gates on this, not on `session()` being null. */
  readonly status = this._status.asReadonly();
  /** The current Supabase session, or `null`. Carries `provider_token` (Drive). */
  readonly session = this._session.asReadonly();
  /** The account's tier, mirrored from `profiles.plan`. Drives sync availability. */
  readonly plan = this._plan.asReadonly();

  readonly user = computed<User | null>(() => this._session()?.user ?? null);
  readonly isSignedIn = computed(() => this._status() === 'signed-in');
  readonly isPro = computed(() => this._plan() === 'pro');
  readonly email = computed(() => this.user()?.email ?? null);

  /**
   * The sign-in methods attached to this account (ADR-0009: one account, several
   * identities). `['google']`, `['email']`, or both — the Settings "add a method"
   * flow reads this to know which link buttons to offer.
   */
  readonly providers = computed<string[]>(() =>
    (this.user()?.identities ?? []).map((i: UserIdentity) => i.provider),
  );
  readonly hasGoogle = computed(() => this.providers().includes('google'));
  readonly hasPassword = computed(() => this.providers().includes('email'));

  private started = false;

  /**
   * Read the persisted session and start listening for auth changes. Called once
   * at boot (an app initializer). Idempotent, and a no-op without a backend.
   */
  async init(): Promise<void> {
    if (this.started) return;
    this.started = true;

    const client = await this.supabase.client();
    if (client === null) {
      this._status.set('unavailable');
      return;
    }

    const { data } = await client.auth.getSession();
    await this.adopt(data.session);

    // The one subscription in the app — an auth SDK event, not app state, so it
    // does not break the no-RxJS rule the stores keep (it never becomes an
    // Observable the UI binds to; it only pushes into signals).
    client.auth.onAuthStateChange((_event, session) => {
      void this.adopt(session);
    });
  }

  /** Google OAuth sign-in. Pass `withDrive` to also request `drive.file`, so the
   * one grant carries Drive (ADR-0009 — Drive rides the Google identity). */
  async signInWithGoogle(withDrive = false): Promise<void> {
    const client = await this.required();
    await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: withDrive ? DRIVE_FILE_SCOPE : undefined,
        redirectTo: this.redirectTo(),
      },
    });
  }

  /** Email/password sign-in for an already-confirmed identity. */
  async signInWithPassword(email: string, password: string): Promise<void> {
    const client = await this.required();
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  /**
   * Register a new email/password account. It is NOT a session yet — email
   * confirmation is required (ADR-0009), so the caller tells the user to check
   * their inbox. `needsConfirmation` is false only if confirmations are disabled.
   */
  async signUpWithPassword(
    email: string,
    password: string,
  ): Promise<SignUpResult> {
    const client = await this.required();
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: this.redirectTo() },
    });
    if (error) throw error;
    return { needsConfirmation: data.session === null };
  }

  /**
   * Add Google to the account you are signed into (ADR-0009: attach, never
   * merge). `linkIdentity` is OAuth-only — this is the Google half; the password
   * half is `addPassword`. Also the path "Connect Drive" drives for a non-Google
   * account, so it forwards the Drive scope.
   */
  async linkGoogle(withDrive = false): Promise<void> {
    const client = await this.required();
    const { error } = await client.auth.linkIdentity({
      provider: 'google',
      options: {
        scopes: withDrive ? DRIVE_FILE_SCOPE : undefined,
        redirectTo: this.redirectTo(),
      },
    });
    if (error) throw error;
  }

  /**
   * Add an email/password method to the current account. `updateUser` (not
   * `linkIdentity`, which is OAuth-only) is how a password credential attaches;
   * the new email must be confirmed before it grants a session (ADR-0009).
   */
  async addPassword(email: string, password: string): Promise<void> {
    const client = await this.required();
    const { error } = await client.auth.updateUser({ email, password });
    if (error) throw error;
  }

  /** Send a password-reset email. The link returns to the app, where the user
   * sets a new password (Supabase drives the recovery session). */
  async resetPassword(email: string): Promise<void> {
    const client = await this.required();
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: this.redirectTo(),
    });
    if (error) throw error;
  }

  async signOut(): Promise<void> {
    const client = await this.supabase.client();
    await client?.auth.signOut();
  }

  /**
   * Soft-delete the signed-in account and sign out.
   *
   * Only the `profiles` row is flagged (`deleted_at`) — the library rows
   * (songs, songbooks) are LEFT in Supabase, retained. The `auth.users` login is
   * deliberately NOT removed: the client cannot, and keeping it is what makes the
   * delete recoverable. Signing in again with the same identity lands on the same
   * `auth.users.id` → the same profile row, and `adopt` clears the flag on the way
   * in (re-login IS the undelete), so the retained library syncs back down.
   *
   * The caller wipes this device's local copy separately — this is the cloud half.
   */
  async deleteAccount(): Promise<void> {
    const client = await this.required();
    const uid = this.user()?.id;
    if (uid) {
      const now = Date.now();
      const { error } = await client
        .from('profiles')
        .update({ deleted_at: now, updated_at: now })
        .eq('id', uid);
      if (error) throw error;
    }
    await client.auth.signOut();
  }

  /**
   * The Google OAuth `provider_token`, or `null`. Lives on the session right
   * after an OAuth redirect and is gone after any reload (§6) — Drive sync reads
   * it and, when absent, re-runs the OAuth flow (Flow A) to mint a fresh one.
   */
  providerToken(): string | null {
    return this._session()?.provider_token ?? null;
  }

  // --- internals ------------------------------------------------------------

  /** Take on a session (or its loss), refresh the mirrored tier, and clear any
   * soft-delete flag left by a prior `deleteAccount` (re-login is the undelete). */
  private async adopt(session: Session | null): Promise<void> {
    this._session.set(session);
    this._status.set(session ? 'signed-in' : 'signed-out');
    await this.refreshPlan();
    await this.reactivateProfile();
  }

  /**
   * Clear a `deleted_at` left on this account's profile by a prior soft-delete, so
   * signing back in reactivates it. Scoped to rows that ARE flagged (`.not(... is
   * null)`), so a normal sign-in does not bump `updated_at` and churn the sync.
   * Best-effort: a failure here must never be the thing that blocks a sign-in.
   */
  private async reactivateProfile(): Promise<void> {
    const uid = this.user()?.id;
    if (uid === undefined) return;
    const client = await this.supabase.client();
    if (client === null) return;
    await client
      .from('profiles')
      .update({ deleted_at: null, updated_at: Date.now() })
      .eq('id', uid)
      .not('deleted_at', 'is', null);
  }

  /** Mirror `profiles.plan` into the local signal. Defaults to `free` on any
   * failure — a tier read must never be the thing that breaks the app. */
  private async refreshPlan(): Promise<void> {
    const user = this.user();
    if (user === null) {
      this._plan.set('free');
      return;
    }
    const client = await this.supabase.client();
    if (client === null) return;
    const { data } = await client
      .from('profiles')
      .select('plan')
      .eq('id', user.id)
      .maybeSingle();
    this._plan.set(data?.plan === 'pro' ? 'pro' : 'free');
  }

  private async required() {
    const client = await this.supabase.client();
    if (client === null) {
      throw new Error('Auth is unavailable: no Supabase backend configured.');
    }
    return client;
  }

  /**
   * Where OAuth / confirmation links return to — the exact page that triggered
   * the flow, not the app root. Every auth command here is invoked from Settings,
   * so returning to `origin + pathname` (query/hash dropped, so the token fragment
   * Supabase consumes never accumulates) lands the user back on Settings, mid-task.
   */
  private redirectTo(): string | undefined {
    return typeof location === 'undefined'
      ? undefined
      : location.origin + location.pathname;
  }
}

/** Narrowing helper for callers that want to message a Supabase auth failure. */
export function isAuthError(e: unknown): e is AuthError {
  return e instanceof Error && 'status' in e;
}
