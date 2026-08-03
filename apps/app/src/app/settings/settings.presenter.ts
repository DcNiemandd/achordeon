// Settings presenter — Epic 13
// Spec: PRD-UI-SHELL.md §3 (the seam)

import { Injectable, computed, effect, inject, signal } from '@angular/core';
import {
  AuthService,
  BackupService,
  DriveAuthRequiredError,
  DriveConflictError,
  FeedbackRejectedError,
  FeedbackService,
  FeedbackThrottledError,
  SettingsStore,
  SyncService,
  type FeedbackReport,
  type RestoreMode,
  type ThemeChoice,
} from '@achordeon/shared/data-access';
import {
  Localization,
  Stats,
  TierGuard,
  UiStore,
  WarnUnsynced,
  type Language,
} from '../shared/layout';

/** How a restore ended, for the page to say so. */
export type RestoreOutcome = 'done' | 'failed';

/**
 * Which act the restore dialog asked for. Re-exported so the page can name the
 * answer it is sending without importing `data-access` itself — the presenter is
 * the seam a component talks through (PRD-UI-SHELL.md §3).
 */
export type { RestoreMode };

/** How a Drive push/pull ended — the account section's status line. */
export type DriveOutcome =
  | { kind: 'uploaded' }
  | { kind: 'downloaded' }
  | { kind: 'empty' } // download found no file yet
  | { kind: 'conflict' } // Drive moved ahead; offer to overwrite
  | { kind: 'reauth' } // token lapsed; a re-connect is under way
  | { kind: 'failed' };

/** A registration that needs the confirmation link clicked before it is a session. */
export type RegisterState = 'confirm' | 'failed' | null;

/**
 * Why a report did not go through — a code, not a sentence.
 *
 * `throttled` is deliberately its own value rather than a flavour of `failed`:
 * the report was fine and the reporter is simply early, which is a different
 * thing to say and the only one of the three that is not an apology.
 */
export type FeedbackFailure = 'throttled' | 'rejected' | 'failed';

/** Outcome of a password-reset request. */
export type ResetState = 'sent' | 'failed' | null;

/** A Drive action interrupted by a Google re-auth redirect, stashed across the
 * reload so it can finish on return (Flow A) — the re-auth costs one click. */
/**
 * The Drive action to finish after a re-connect redirect. The two downloads are
 * separate values because the choice the user made in the dialog has to survive
 * a full page load — resuming as the wrong one would either lose their library
 * or silently not do what they asked.
 */
type PendingDrive =
  | 'upload'
  | 'upload-force'
  | 'download-merge'
  | 'download-replace';
const PENDING_DRIVE_KEY = 'achordeon:pendingDrive';

/**
 * The only thing in this feature that knows the business layer exists.
 *
 * Signals in, commands out. When the designed UI lands, the components around it
 * are deleted and this file keeps working — it never knew what they looked like.
 */
@Injectable()
export class SettingsPresenter {
  private readonly store = inject(SettingsStore);
  /**
   * The shell's own preferences (PRD-UI-SHELL.md §7) — device-local and never
   * synced, unlike everything else on this page. The Settings page is where a
   * user looks for them regardless of which store owns them; that is exactly
   * the seam the presenter exists to hide.
   */
  private readonly ui = inject(UiStore);
  /** Owns the locale sub-paths — switching language is a navigation, not a
   * setting the running bundle can honour (PRD-INFRASTRUCTURE.md §11). */
  private readonly localization = inject(Localization);
  private readonly tier = inject(TierGuard);
  private readonly backups = inject(BackupService);
  private readonly auth = inject(AuthService);
  private readonly sync = inject(SyncService);
  /** Files the About block's bug report. The dialog gathers it; only this knows
   * that "send" means an edge function and, beyond it, a GitHub issue. */
  private readonly feedback = inject(FeedbackService);
  /**
   * Every way this page leaves the running app goes through here — the two
   * reloads below and the two Google redirects. All four are things the user
   * asked for, so none of them may raise the "you have unsynced changes" prompt
   * (see `WarnUnsynced.expectUnload`).
   */
  private readonly unload = inject(WarnUnsynced);

  /**
   * The extra usage statistics (docs/privacy.mdx). Device-local like the shell's
   * own preferences, and deliberately NOT in SettingsStore: syncing a consent to
   * the cloud would carry a decision made on one device onto another, where it
   * was never given.
   */
  private readonly stats = inject(Stats);

  readonly theme = this.store.theme;
  readonly language = this.store.language;
  readonly isSplitShared = this.ui.isSplitShared;
  /** Whether the dark theme also puts songs on a dark page — the one stored
   * answer about dark paper on this device. */
  readonly isSongDarkFollowingTheme = this.ui.isSongDarkFollowingTheme;
  readonly isStatsAllowed = this.stats.isAllowed;
  /** The browser refused for the reader; the row says so and stands down. */
  readonly isStatsRefusedByBrowser = this.stats.isRefusedByBrowser;

  // --- Account & sync (Epic 10) --------------------------------------------
  readonly authStatus = this.auth.status;
  readonly email = this.auth.email;
  readonly isPro = this.auth.isPro;
  readonly isSignedIn = this.auth.isSignedIn;
  readonly hasGoogle = this.auth.hasGoogle;
  readonly hasPassword = this.auth.hasPassword;
  readonly autoSync = this.sync.autoSync;
  readonly hasUnsynced = this.sync.hasUnsynced;
  readonly syncStatus = this.sync.status;
  /** Automatic sync needs the paid tier; the toggle is decoration over it while
   * signed out or free (tierGuard is highlight-not-block during testing). */
  readonly canAutoSync = computed(() => this.auth.isSignedIn() && this.isPro());
  /** Whether the auto-sync toggle wears the Premium marker — the gate decides, so
   * a Premium user is not sold what they already have. */
  readonly marksAutoSyncPremium = computed(() =>
    this.tier.isMarked('auto-sync'),
  );
  /** Whether that marker says "available for testing" — false for auto-sync,
   * which is held behind the tier, so it reads a plain "Premium". */
  readonly autoSyncTesting = computed(() => this.tier.isTesting('auto-sync'));

  private readonly _drive = signal<DriveOutcome | null>(null);
  private readonly _driveBusy = signal(false);
  private readonly _register = signal<RegisterState>(null);
  private readonly _reset = signal<ResetState>(null);
  private readonly _authError = signal<string | null>(null);
  private readonly _deleting = signal(false);
  readonly driveOutcome = this._drive.asReadonly();
  /** An account deletion is in flight — the confirm button stands down. */
  readonly deleting = this._deleting.asReadonly();
  /** A Drive upload/download is in flight — the buttons stand down while it runs. */
  readonly driveBusy = this._driveBusy.asReadonly();
  /** Set to `confirm` when a registration (or added password) needs the email
   * link clicked; `failed` on error — drives the confirmation dialog. */
  readonly registerState = this._register.asReadonly();
  /** Whether a password-reset email was sent (or failed). */
  readonly resetState = this._reset.asReadonly();
  /** The last auth failure message for the open dialog, or `null`. */
  readonly authError = this._authError.asReadonly();

  /** One-shot latch so an auto-resume runs at most once per page load. */
  private resumed = false;

  constructor() {
    // Flow A double-click fix: a Drive action that hit a missing token stashed
    // itself and redirected to Google. The redirect lands back on Settings with
    // a fresh `provider_token`; the moment it appears, finish what the user
    // originally clicked instead of making them click again.
    effect(() => {
      const token = this.auth.providerToken();
      if (this.resumed || token === null) return;
      const pending = this.readPending();
      if (pending === null) return;
      this.resumed = true;
      this.clearPending();
      if (pending === 'download-merge') void this.driveDownload('merge', true);
      else if (pending === 'download-replace')
        void this.driveDownload('replace', true);
      else void this.driveUpload(pending === 'upload-force', true);
    });
  }

  logInGoogle(): Promise<void> {
    this._authError.set(null);
    this.unload.expectUnload(); // OAuth navigates away — the user's own doing
    return this.auth
      .signInWithGoogle()
      .catch((e) => this._authError.set(this.message(e)));
  }

  /** @returns true on a session; false leaves `authError` set for the dialog. */
  async logIn(email: string, password: string): Promise<boolean> {
    this._authError.set(null);
    try {
      await this.auth.signInWithPassword(email, password);
      return true;
    } catch (e) {
      this._authError.set(this.message(e));
      return false;
    }
  }

  /**
   * Register a new email/password account. On success the caller closes the form
   * and the confirmation dialog opens (email confirmation is required, ADR-0009).
   * @returns true if the sign-up was accepted.
   */
  async register(email: string, password: string): Promise<boolean> {
    this._authError.set(null);
    this._register.set(null);
    try {
      await this.auth.signUpWithPassword(email, password);
      this._register.set('confirm');
      return true;
    } catch (e) {
      this._authError.set(this.message(e));
      return false;
    }
  }

  /** Send a password-reset link. `resetState` becomes `sent` on success (the
   * page swaps the forgot form for a confirmation) or `failed` on error.
   * @returns true if the email was sent. */
  async resetPassword(email: string): Promise<boolean> {
    this._authError.set(null);
    try {
      await this.auth.resetPassword(email);
      this._reset.set('sent');
      return true;
    } catch (e) {
      this._reset.set('failed');
      this._authError.set(this.message(e));
      return false;
    }
  }

  /** Add Google as a login method to the current account (ADR-0009: attach, never
   * merge). Deliberately does NOT request `drive.file` — signing in and granting
   * Drive are split, so a login stays a login. Drive scope is asked lazily on the
   * first Drive action (Flow A, `reconnectDrive`). */
  linkGoogle(): Promise<void> {
    this._authError.set(null);
    this.unload.expectUnload();
    return this.auth
      .linkGoogle(false)
      .catch((e) => this._authError.set(this.message(e)));
  }

  /** Attach an email/password method to the signed-in account. @returns true if
   * accepted; the new email must then be confirmed. */
  async addPassword(email: string, password: string): Promise<boolean> {
    this._authError.set(null);
    try {
      await this.auth.addPassword(email, password);
      this._register.set('confirm');
      return true;
    } catch (e) {
      this._authError.set(this.message(e));
      return false;
    }
  }

  logOut(): Promise<void> {
    return this.auth.signOut();
  }

  /**
   * Delete this account: wipe the local library and soft-delete the cloud profile,
   * then reload to a clean, signed-out app. The cloud library rows are retained —
   * signing back in reactivates the profile and syncs them back. On failure the
   * error surfaces in `authError` and nothing local is touched.
   */
  async deleteAccount(): Promise<void> {
    this._deleting.set(true);
    this._authError.set(null);
    try {
      await this.auth.deleteAccount();
      await this.backups.clearLocal();
      this.unload.reload();
    } catch (e) {
      this._authError.set(this.message(e));
      this._deleting.set(false);
    }
  }

  clearAuthError(): void {
    this._authError.set(null);
  }

  // --- Feedback (the About block's report dialog) ---------------------------

  /**
   * Whether reports can be filed at all.
   *
   * False in an offline-only build, where there is no backend to post to and the
   * About block falls back to the plain GitHub link it has always had. Read once:
   * a build either shipped with Supabase coordinates or it did not.
   */
  readonly canReport = this.feedback.isConfigured;

  private readonly _feedbackBusy = signal(false);
  private readonly _feedbackFailure = signal<FeedbackFailure | null>(null);
  private readonly _feedbackSent = signal(false);
  /** A report is in flight — the send button stands down. */
  readonly feedbackBusy = this._feedbackBusy.asReadonly();
  /** Why the last attempt did not go through, or null. */
  readonly feedbackFailure = this._feedbackFailure.asReadonly();
  /** The last report arrived — the page swaps the form for a thank-you. */
  readonly feedbackSent = this._feedbackSent.asReadonly();

  /**
   * File one report.
   *
   * @returns true when it arrived, which is the page's cue to close the form. A
   * false leaves `feedbackFailure` set and the dialog open **with the text still
   * in it** — a rate limit or a dropped connection must never cost someone the
   * paragraph they just wrote.
   */
  async sendFeedback(report: FeedbackReport): Promise<boolean> {
    this._feedbackBusy.set(true);
    this._feedbackFailure.set(null);
    try {
      await this.feedback.send(report);
      this._feedbackSent.set(true);
      return true;
    } catch (e) {
      this._feedbackFailure.set(this.classifyFeedback(e));
      return false;
    } finally {
      this._feedbackBusy.set(false);
    }
  }

  private classifyFeedback(e: unknown): FeedbackFailure {
    if (e instanceof FeedbackThrottledError) return 'throttled';
    if (e instanceof FeedbackRejectedError) return 'rejected';
    return 'failed';
  }

  /** Close the thank-you, and forget the last attempt so the next dialog opens
   * clean rather than showing an error the reporter has already read. */
  dismissFeedback(): void {
    this._feedbackSent.set(false);
    this._feedbackFailure.set(null);
  }

  dismissReset(): void {
    this._reset.set(null);
  }

  /** The backend's own message, or `''` so the page shows its generic copy — the
   * presenter holds no user-facing strings ($localize stays in the component). */
  private message(e: unknown): string {
    return e instanceof Error && e.message ? e.message : '';
  }

  setAutoSync(on: boolean): Promise<void> {
    return this.sync.setAutoSync(on);
  }

  /** "Upload to Drive". A lapsed token routes to a re-connect (Flow A); a Drive
   * copy that moved ahead surfaces as a conflict the user can force past. */
  async driveUpload(force = false, resuming = false): Promise<void> {
    this._drive.set(null);
    this._driveBusy.set(true);
    try {
      await this.sync.driveUpload({ force });
      this._drive.set({ kind: 'uploaded' });
    } catch (e) {
      this._drive.set(this.classifyDrive(e));
      await this.onDriveAuth(e, resuming, force ? 'upload-force' : 'upload');
    } finally {
      this._driveBusy.set(false);
    }
  }

  /**
   * "Download from Drive", as the dialog answered it — the Drive copy is a
   * backup, so it adds to the library or replaces it, exactly like a backup file.
   *
   * The mode rides into `onDriveAuth` so a lapsed token that sends the user
   * through Google comes back and finishes the act they actually chose.
   */
  async driveDownload(mode: RestoreMode, resuming = false): Promise<void> {
    this._drive.set(null);
    this._driveBusy.set(true);
    try {
      const found = await this.sync.driveDownload(mode);
      this._drive.set({ kind: found ? 'downloaded' : 'empty' });
    } catch (e) {
      this._drive.set(this.classifyDrive(e));
      await this.onDriveAuth(e, resuming, `download-${mode}`);
    } finally {
      this._driveBusy.set(false);
    }
  }

  dismissDrive(): void {
    this._drive.set(null);
  }

  dismissRegister(): void {
    this._register.set(null);
  }

  private classifyDrive(e: unknown): DriveOutcome {
    if (e instanceof DriveConflictError) return { kind: 'conflict' };
    if (e instanceof DriveAuthRequiredError) return { kind: 'reauth' };
    return { kind: 'failed' };
  }

  /**
   * A Drive call reported a missing token. Unless we are already the resumed run
   * (guard against a redirect loop if the grant never yields a token), stash what
   * the user was doing and redirect to Google for the Drive scope — the `effect`
   * in the constructor finishes it on return.
   */
  private async onDriveAuth(
    e: unknown,
    resuming: boolean,
    action: PendingDrive,
  ): Promise<void> {
    if (!(e instanceof DriveAuthRequiredError) || resuming) return;
    this.writePending(action);
    await this.reconnectDrive();
  }

  /** Re-run Google OAuth with the Drive scope — the token is gone after any
   * reload (§6), so a redirect mints a fresh one and returns here. This is the
   * only path that asks for `drive.file`: sign-in and Drive are split, so the
   * scope is requested lazily, before the first backup. */
  private reconnectDrive(): Promise<void> {
    this.unload.expectUnload();
    return this.auth
      .signInWithGoogle(true)
      .catch((e) => this._authError.set(this.message(e)));
  }

  private readPending(): PendingDrive | null {
    if (typeof sessionStorage === 'undefined') return null;
    const v = sessionStorage.getItem(PENDING_DRIVE_KEY);
    return v === 'upload' ||
      v === 'upload-force' ||
      v === 'download-merge' ||
      v === 'download-replace'
      ? v
      : null;
  }

  private writePending(action: PendingDrive): void {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(PENDING_DRIVE_KEY, action);
    }
  }

  private clearPending(): void {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(PENDING_DRIVE_KEY);
    }
  }

  private readonly _isBusy = signal(false);
  private readonly _restore = signal<RestoreOutcome | null>(null);
  /** A backup or restore is running — the buttons say so and stand down. */
  readonly isBusy = this._isBusy.asReadonly();
  /** The last restore's outcome, for the page's confirmation/error line. */
  readonly restoreOutcome = this._restore.asReadonly();

  /** Global is the base of the cascade, so it inherits from nothing (ADR-0006). */
  readonly globalValues = computed(
    () => this.store.global() as Record<string, unknown>,
  );

  setTheme(theme: ThemeChoice): void {
    this.store.setTheme(theme);
  }

  /**
   * Choose the UI language. The store is set first so the page is momentarily
   * consistent, then `Localization` navigates to that locale's build — which is
   * what actually changes the language, and is why this returns nothing useful:
   * by the time it matters, this document is on its way out (PRD §11).
   */
  setLanguage(language: Language): void {
    this.store.setLanguage(language);
    this.localization.switchTo(language);
  }

  setSplitShared(isShared: boolean): void {
    // No current scope: the settings page has no splitter of its own to adopt a
    // ratio from, so linking falls back to the shared value already stored.
    this.ui.setSplitShared(isShared);
  }

  /**
   * Link the dark page to the dark theme, or unlink it.
   *
   * There is nothing else to set: `UiStore.isSongDark` is derived from this and
   * the resolved theme, so the row IS the state and cannot drift from it.
   */
  setSongDarkFollowsTheme(follows: boolean): void {
    this.ui.setSongDarkFollowsTheme(follows);
  }

  /** Allow (or stop) the extra statistics. Takes effect on the next navigation. */
  setStatsAllowed(isAllowed: boolean): void {
    this.stats.allow(isAllowed);
  }

  /** Dump the whole library to a file (#11). */
  async backup(): Promise<void> {
    this._isBusy.set(true);
    try {
      await this.backups.backup();
    } finally {
      this._isBusy.set(false);
    }
  }

  /**
   * Put a backup file into the library the way the user asked, then reload.
   *
   * `mode` comes from the dialog, which asks rather than assumes: a file is
   * either the songs you want back beside the ones you have (`merge`) or the
   * machine put back exactly as it was (`replace`), and only the person holding
   * the file knows which. Both need saying yes to first — one overwrites, the
   * other brings in rows that can win by being newer.
   *
   * The reload is deliberate either way: the stores hold a window of the *old*
   * data, and booting fresh against the written tables is cleaner than
   * re-querying every one of them.
   */
  async restore(file: File, mode: RestoreMode): Promise<void> {
    this._isBusy.set(true);
    this._restore.set(null);
    try {
      await this.backups.restore(file, mode);
      this._restore.set('done');
      this.unload.reload();
    } catch {
      this._restore.set('failed');
    } finally {
      this._isBusy.set(false);
    }
  }

  dismissRestore(): void {
    this._restore.set(null);
  }

  /** @returns when the change has been saved — the page does not wait on it. */
  patchGlobal(patch: Record<string, unknown>): Promise<void> {
    // A sparse patch from the panel. At Global scope every setting is defined,
    // so an `undefined` (reset) has nothing to fall back to and is dropped.
    const defined = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    );
    if (Object.keys(defined).length === 0) return Promise.resolve();
    return this.store.setGlobal(defined);
  }
}
