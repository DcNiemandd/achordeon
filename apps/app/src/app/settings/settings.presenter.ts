// Settings presenter — Epic 13
// Spec: PRD-UI-SHELL.md §3 (the seam)

import { Injectable, computed, inject, signal } from '@angular/core';
import {
  AuthService,
  BackupService,
  DriveAuthRequiredError,
  DriveConflictError,
  SettingsStore,
  SyncService,
  type ThemeChoice,
} from '@achordeon/shared/data-access';
import { UiStore } from '../shared/layout';

/** How a restore ended, for the page to say so. */
export type RestoreOutcome = 'done' | 'failed';

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
  private readonly backups = inject(BackupService);
  private readonly auth = inject(AuthService);
  private readonly sync = inject(SyncService);

  readonly theme = this.store.theme;
  readonly language = this.store.language;
  readonly isSplitShared = this.ui.isSplitShared;

  // --- Account & sync (Epic 10) --------------------------------------------
  readonly authStatus = this.auth.status;
  readonly email = this.auth.email;
  readonly isPro = this.auth.isPro;
  readonly hasGoogle = this.auth.hasGoogle;
  readonly hasPassword = this.auth.hasPassword;
  readonly autoSync = this.sync.autoSync;
  readonly hasUnsynced = this.sync.hasUnsynced;
  readonly syncStatus = this.sync.status;
  /** Automatic sync needs the paid tier; the toggle is decoration over it while
   * signed out or free (tierGuard is highlight-not-block during testing). */
  readonly canAutoSync = computed(() => this.auth.isSignedIn() && this.isPro());

  private readonly _drive = signal<DriveOutcome | null>(null);
  private readonly _register = signal<RegisterState>(null);
  private readonly _authError = signal(false);
  readonly driveOutcome = this._drive.asReadonly();
  readonly registerState = this._register.asReadonly();
  readonly authError = this._authError.asReadonly();

  async logInGoogle(): Promise<void> {
    this._authError.set(false);
    try {
      await this.auth.signInWithGoogle();
    } catch {
      this._authError.set(true);
    }
  }

  async logIn(email: string, password: string): Promise<void> {
    this._authError.set(false);
    try {
      await this.auth.signInWithPassword(email, password);
    } catch {
      this._authError.set(true);
    }
  }

  async register(email: string, password: string): Promise<void> {
    this._register.set(null);
    try {
      const { needsConfirmation } = await this.auth.signUpWithPassword(
        email,
        password,
      );
      this._register.set(needsConfirmation ? 'confirm' : null);
    } catch {
      this._register.set('failed');
    }
  }

  /** Add a login method to the current account (ADR-0009: attach, never merge).
   * Google links Drive at the same time — Drive rides that identity. */
  linkGoogle(): Promise<void> {
    return this.auth.linkGoogle(true).catch(() => this._authError.set(true));
  }

  async addPassword(email: string, password: string): Promise<void> {
    this._authError.set(false);
    try {
      await this.auth.addPassword(email, password);
      this._register.set('confirm'); // the new email must be confirmed
    } catch {
      this._authError.set(true);
    }
  }

  logOut(): Promise<void> {
    return this.auth.signOut();
  }

  setAutoSync(on: boolean): Promise<void> {
    return this.sync.setAutoSync(on);
  }

  /** "Upload to Drive". A lapsed token routes to a re-connect (Flow A); a Drive
   * copy that moved ahead surfaces as a conflict the user can force past. */
  async driveUpload(force = false): Promise<void> {
    this._drive.set(null);
    try {
      await this.sync.driveUpload({ force });
      this._drive.set({ kind: 'uploaded' });
    } catch (e) {
      this._drive.set(this.classifyDrive(e));
      if (e instanceof DriveAuthRequiredError) await this.reconnectDrive();
    }
  }

  async driveDownload(): Promise<void> {
    this._drive.set(null);
    try {
      const found = await this.sync.driveDownload();
      this._drive.set({ kind: found ? 'downloaded' : 'empty' });
    } catch (e) {
      this._drive.set(this.classifyDrive(e));
      if (e instanceof DriveAuthRequiredError) await this.reconnectDrive();
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

  /** Re-run Google OAuth with the Drive scope — the token is gone after any
   * reload (§6), so a redirect mints a fresh one and returns here. */
  private reconnectDrive(): Promise<void> {
    return this.auth
      .signInWithGoogle(true)
      .catch(() => this._authError.set(true));
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

  setSplitShared(isShared: boolean): void {
    // No current scope: the settings page has no splitter of its own to adopt a
    // ratio from, so linking falls back to the shared value already stored.
    this.ui.setSplitShared(isShared);
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
   * Replace the whole library from a backup file, then reload.
   *
   * A full restore throws away what is here now, so the page confirms first —
   * this only runs once the user has said yes. The reload is deliberate: the
   * stores hold a window of the *old* data, and booting fresh against the
   * restored tables is cleaner than re-querying every one of them.
   */
  async restore(file: File): Promise<void> {
    this._isBusy.set(true);
    this._restore.set(null);
    try {
      await this.backups.restore(file);
      this._restore.set('done');
      location.reload();
    } catch {
      this._restore.set('failed');
    } finally {
      this._isBusy.set(false);
    }
  }

  dismissRestore(): void {
    this._restore.set(null);
  }

  patchGlobal(patch: Record<string, unknown>): void {
    // A sparse patch from the panel. At Global scope every setting is defined,
    // so an `undefined` (reset) has nothing to fall back to and is dropped.
    const defined = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    );
    if (Object.keys(defined).length > 0) {
      this.store.setGlobal(defined);
    }
  }
}
