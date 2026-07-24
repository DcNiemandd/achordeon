// Settings page — Epic 13 (frame + the Global settings-panel mount)
// Spec: PRD-UI-SHELL.md §4
//
// Epic 13 lands the FRAME and the panel's first home. Profile, sync and language
// are Epic 12 — it mounts THIS panel, it does not build another.

import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { Button, Dialog, Icon, Premium } from '../primitives';
import { ActionBar, BackNavigation } from '../shared/layout';
import { SettingsPanel } from '../shared/settings-panel';
import { SettingsPresenter } from './settings.presenter';

@Component({
  selector: 'app-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SettingsPresenter],
  host: { '(document:keydown.escape)': 'onEscape($event)' },
  imports: [ActionBar, SettingsPanel, Button, Dialog, Icon, Premium],
  template: `
    <app-action-bar [title]="title" />

    <!-- The scroll lives on the full-width body, so the scrollbar sits at the
         right edge of the page; the content inside it is centred and capped, so
         the settings read as a column in the middle rather than a block shoved
         against the left. -->
    <div class="body">
      <div class="content">
        <!-- Account (Epic 10). Login gates cloud sync ONLY — the library below
             works signed out. Unavailable builds (no backend) say so. -->
        <section class="section">
          <h2 class="heading">{{ accountHeading }}</h2>

          @switch (presenter.authStatus()) {
            @case ('unavailable') {
              <p class="backup-help">{{ accountUnavailable }}</p>
            }
            @case ('signed-in') {
              <p class="account-line" data-testid="account-email">
                {{ signedInAs }} <strong>{{ presenter.email() }}</strong>
                @if (presenter.isPro()) {
                  <span class="pro-badge">{{ proLabel }}</span>
                }
              </p>

              <div class="backup-actions">
                @if (!presenter.hasGoogle()) {
                  <button
                    appButton
                    variant="secondary"
                    data-testid="link-google"
                    (click)="presenter.linkGoogle()"
                  >
                    {{ linkGoogleLabel }}
                  </button>
                }
                <button
                  appButton
                  variant="ghost"
                  data-testid="logout"
                  (click)="presenter.logOut()"
                >
                  {{ logoutLabel }}
                </button>
              </div>
            }
            @default {
              <button
                appButton
                variant="secondary"
                data-testid="login-google"
                (click)="presenter.logInGoogle()"
              >
                {{ googleLabel }}
              </button>

              <div class="cred">
                <input
                  #emailInput
                  class="text-input"
                  type="email"
                  autocomplete="email"
                  [placeholder]="emailPlaceholder"
                  [attr.aria-label]="emailPlaceholder"
                  data-testid="email"
                />
                <input
                  #pwInput
                  class="text-input"
                  type="password"
                  autocomplete="current-password"
                  [placeholder]="passwordPlaceholder"
                  [attr.aria-label]="passwordPlaceholder"
                  data-testid="password"
                />
                <div class="backup-actions">
                  <button
                    appButton
                    variant="secondary"
                    data-testid="login"
                    (click)="presenter.logIn(emailInput.value, pwInput.value)"
                  >
                    {{ loginLabel }}
                  </button>
                  <button
                    appButton
                    variant="ghost"
                    data-testid="register"
                    (click)="
                      presenter.register(emailInput.value, pwInput.value)
                    "
                  >
                    {{ registerLabel }}
                  </button>
                </div>
              </div>

              @if (presenter.authError()) {
                <p class="warn" data-testid="auth-error">{{ authErrorText }}</p>
              }
            }
          }
        </section>

        <!-- Sync (Epic 10). Automatic Supabase sync is enabled by the paid tier;
             manual Drive backup is for everyone signed into Google. -->
        @if (presenter.authStatus() !== 'unavailable') {
          <section class="section">
            <h2 class="heading">{{ syncHeading }}</h2>

            <!-- Decoration over a WORKING control, never a disabled one: tierGuard
               is highlight-and-tooltip during testing, not a hard block. -->
            <app-premium [label]="autoSyncLabel">
              <label class="check-row">
                <input
                  type="checkbox"
                  class="check"
                  [checked]="presenter.autoSync()"
                  data-testid="auto-sync"
                  (change)="onAutoSync($event)"
                />
                <span>
                  <span class="check-label">{{ autoSyncLabel }}</span>
                  <span class="check-help">{{ autoSyncHelp }}</span>
                </span>
              </label>
            </app-premium>

            @if (presenter.hasUnsynced()) {
              <p class="unsynced" data-testid="unsynced">{{ unsyncedText }}</p>
            }

            @if (presenter.authStatus() === 'signed-in') {
              <p class="backup-help">{{ driveHelp }}</p>
              <div class="backup-actions">
                <button
                  appButton
                  variant="secondary"
                  data-testid="drive-upload"
                  (click)="presenter.driveUpload()"
                >
                  <app-icon name="download" />
                  {{ driveUploadLabel }}
                </button>
                <button
                  appButton
                  variant="secondary"
                  data-testid="drive-download"
                  (click)="presenter.driveDownload()"
                >
                  <app-icon name="import" />
                  {{ driveDownloadLabel }}
                </button>
              </div>
              @if (driveMessage(); as message) {
                <p class="backup-help" data-testid="drive-status">
                  {{ message }}
                  @if (presenter.driveOutcome()?.kind === 'conflict') {
                    <button
                      appButton
                      variant="ghost"
                      data-testid="drive-force"
                      (click)="presenter.driveUpload(true)"
                    >
                      {{ driveForceLabel }}
                    </button>
                  }
                </p>
              }
            }
          </section>
        }

        <!-- Whole-database backup (#11 — the UI Epic 4 left unbuilt). Distinct
           from Export: this is the entire library, verbatim, and Restore
           REPLACES everything. So Restore confirms first. -->
        <section class="section">
          <h2 class="heading">{{ backupHeading }}</h2>
          <p class="backup-help">{{ backupHelp }}</p>
          <div class="backup-actions">
            <button
              appButton
              variant="secondary"
              [disabled]="presenter.isBusy()"
              data-testid="backup"
              (click)="presenter.backup()"
            >
              <app-icon name="download" />
              {{ backupButton }}
            </button>
            <button
              appButton
              variant="secondary"
              [disabled]="presenter.isBusy()"
              data-testid="restore"
              (click)="restoreInput.click()"
            >
              <app-icon name="import" />
              {{ restoreButton }}
            </button>
            <input
              #restoreInput
              class="file"
              type="file"
              accept="application/json,.json"
              tabindex="-1"
              aria-hidden="true"
              data-testid="restore-input"
              (change)="onRestoreFilePicked($event)"
            />
          </div>
        </section>

        <section class="section">
          <h2 class="heading">{{ appHeading }}</h2>
          <div class="choices" role="group" [attr.aria-label]="themeHeading">
            @for (option of themes; track option.value) {
              <button
                appButton
                variant="ghost"
                [class.is-active]="presenter.theme() === option.value"
                [attr.aria-pressed]="presenter.theme() === option.value"
                [attr.data-testid]="'theme-' + option.value"
                (click)="presenter.setTheme(option.value)"
              >
                {{ option.label }}
              </button>
            }
          </div>
        </section>

        <section class="section">
          <h2 class="heading">{{ panelsHeading }}</h2>
          <!-- A checkbox, not a segmented pair: it is one fact that is either
             true or false, and "Linked / Not linked" would be two words for
             the same switch. -->
          <label class="check-row">
            <input
              type="checkbox"
              class="check"
              [checked]="presenter.isSplitShared()"
              data-testid="split-shared"
              (change)="onSplitShared($event)"
            />
            <span>
              <span class="check-label">{{ splitSharedLabel }}</span>
              <span class="check-help">{{ splitSharedHelp }}</span>
            </span>
          </label>
        </section>

        <section class="section">
          <h2 class="heading">{{ renderHeading }}</h2>
          <!-- Global scope: the base of the cascade. The SAME component is mounted
             by songbooks (songbook scope) and the song editor (song scope). -->
          <app-settings-panel
            scope="global"
            [values]="presenter.globalValues()"
            (changed)="presenter.patchGlobal($event)"
          />
        </section>

        <!-- Stubs for what is coming, shown so the shape of the app is honest but
           marked and disabled so nothing pretends to work (#1). They are UI-only
           placeholders — not wired to the settings cascade — because turning them
           into live settings means changing what existing chord symbols mean and
           embedding uploaded font bytes, both their own pieces of work. -->
        <section class="section">
          <h2 class="heading">{{ comingHeading }}</h2>
          <div class="stubs">
            <div class="stub">
              <span>
                <span class="stub-label">{{ notationLabel }}</span>
                <span class="stub-help">{{ notationHelp }}</span>
              </span>
              <div
                class="choices"
                role="group"
                [attr.aria-label]="notationLabel"
              >
                @for (option of notations; track option.value) {
                  <button
                    appButton
                    variant="ghost"
                    disabled
                    [class.is-active]="option.value === 'english'"
                    [attr.data-testid]="'notation-' + option.value"
                  >
                    {{ option.label }}
                  </button>
                }
              </div>
            </div>

            <div class="stub">
              <span>
                <span class="stub-label">{{ fontLibraryLabel }}</span>
                <span class="stub-help">{{ fontLibraryHelp }}</span>
              </span>
              <button
                appButton
                variant="secondary"
                disabled
                data-testid="font-library"
              >
                {{ fontLibraryButton }}
              </button>
            </div>

            <p class="coming-note">{{ comingNote }}</p>
          </div>
        </section>
      </div>
    </div>

    @if (presenter.registerState() === 'confirm') {
      <app-dialog
        [title]="confirmEmailTitle"
        data-testid="confirm-dialog"
        (closed)="presenter.dismissRegister()"
      >
        <p>{{ confirmEmailText }}</p>
        <button
          dialog-actions
          appButton
          type="button"
          variant="primary"
          data-testid="confirm-close"
          (click)="presenter.dismissRegister()"
        >
          {{ okLabel }}
        </button>
      </app-dialog>
    }

    @if (pendingRestore(); as file) {
      <app-dialog
        [title]="restoreConfirmTitle"
        data-testid="restore-dialog"
        (closed)="cancelRestore()"
      >
        <p class="warn">{{ restoreConfirmText }}</p>
        <button
          dialog-actions
          appButton
          type="button"
          variant="secondary"
          data-testid="restore-cancel"
          (click)="cancelRestore()"
        >
          {{ cancelLabel }}
        </button>
        <button
          dialog-actions
          appButton
          type="button"
          variant="primary"
          data-testid="restore-confirm"
          (click)="confirmRestore(file)"
        >
          {{ restoreConfirmButton }}
        </button>
      </app-dialog>
    }

    @if (presenter.restoreOutcome() === 'failed') {
      <app-dialog
        [title]="restoreFailedTitle"
        data-testid="restore-error-dialog"
        (closed)="presenter.dismissRestore()"
      >
        <p class="warn">{{ restoreFailedText }}</p>
        <button
          dialog-actions
          appButton
          type="button"
          variant="primary"
          data-testid="restore-error-close"
          (click)="presenter.dismissRestore()"
        >
          {{ okLabel }}
        </button>
      </app-dialog>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      block-size: 100%;
    }

    /* Full width, so its scrollbar is at the page's right edge. */
    .body {
      flex: 1;
      min-block-size: 0;
      overflow: auto;
    }

    /* The readable column: centred and capped, so the settings sit in the
       middle of the page rather than hard against the left. */
    .content {
      display: flex;
      flex-direction: column;
      gap: var(--space-6);
      padding: var(--space-4);
      max-inline-size: 640px;
      margin-inline: auto;
    }

    .heading {
      margin: 0 0 var(--space-2);
      font-size: var(--text-sm);
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .choices {
      display: flex;
      gap: var(--space-1);
    }

    .check-row {
      display: flex;
      align-items: flex-start;
      gap: var(--space-2);
      cursor: pointer;
    }

    .check {
      accent-color: var(--brand);
      inline-size: 16px;
      block-size: 16px;
      margin-block-start: 2px;
      flex: none;
    }

    .check-label,
    .check-help {
      display: block;
    }

    .check-label {
      font-size: var(--text-sm);
      color: var(--text);
    }

    .check-help {
      font-size: var(--text-xs);
      color: var(--text-faint);
    }

    .stubs {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      opacity: 0.65;
    }

    .stub {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
    }

    .stub-label,
    .stub-help {
      display: block;
    }

    .stub-label {
      font-size: var(--text-sm);
      color: var(--text);
    }

    .stub-help {
      font-size: var(--text-xs);
      color: var(--text-faint);
    }

    .coming-note {
      margin: 0;
      font-size: var(--text-xs);
      color: var(--text-faint);
      font-style: italic;
    }

    .backup-help {
      margin: 0 0 var(--space-2);
      font-size: var(--text-sm);
      color: var(--text-muted);
    }

    .backup-actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    .warn {
      margin: 0 0 var(--space-2);
    }

    .account-line {
      margin: 0 0 var(--space-3);
      font-size: var(--text-sm);
      color: var(--text);
    }

    .pro-badge {
      margin-inline-start: var(--space-2);
      padding: 2px var(--space-2);
      border-radius: var(--space-1);
      background: var(--premium-glow, var(--brand));
      color: var(--text-on-brand, #fff);
      font-size: var(--text-xs);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .cred {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin-block-start: var(--space-3);
      max-inline-size: 320px;
    }

    .text-input {
      padding: var(--space-2);
      border: 1px solid var(--border);
      border-radius: var(--space-1);
      background: var(--surface);
      color: var(--text);
      font: inherit;
    }

    .unsynced {
      margin: var(--space-2) 0 0;
      font-size: var(--text-sm);
      color: var(--text-muted);
    }

    /* The real control behind Restore. Not display:none, which makes it
       unfocusable and, in some engines, unclickable from script. */
    .file {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      opacity: 0;
      pointer-events: none;
    }
  `,
})
export class SettingsPage {
  protected readonly presenter = inject(SettingsPresenter);
  private readonly backNavigation = inject(BackNavigation);

  /**
   * Escape goes back to whatever you were doing.
   *
   * Settings is a destination, not a peer (§4) — you come here to change one
   * thing and then return, so the way out should not be "find the rail and pick
   * a module again". The same gesture the editor uses to step back to its list.
   *
   * **Browser history, with a floor under it** — see `BackNavigation`. History is
   * what returns you to the *song you were editing* rather than merely to the
   * module it lives in; the floor is for when there is no history to step into,
   * which is every bookmark, shared link and reload.
   *
   * Left alone while a text field has the caret, because there Escape means
   * "undo this edit". Read from the event's target rather than
   * `document.activeElement` for the same reason the editor does: a field that
   * blurs itself first would otherwise look like a bare press.
   */
  protected onEscape(event: Event): void {
    const target = event.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    ) {
      return;
    }
    event.preventDefault();
    this.backNavigation.back();
  }

  protected readonly title = $localize`:@@settings.title:Settings`;
  protected readonly appHeading = $localize`:@@settings.app:Application`;
  protected readonly themeHeading = $localize`:@@settings.theme:Theme`;
  protected readonly renderHeading = $localize`:@@settings.rendering:Rendering`;
  protected readonly panelsHeading = $localize`:@@settings.panels:Panels`;
  protected readonly splitSharedLabel = $localize`:@@settings.splitShared:One panel size everywhere`;
  protected readonly splitSharedHelp = $localize`:@@settings.splitShared.help:Off: each module remembers how you sized its panels.`;

  protected onSplitShared(event: Event): void {
    this.presenter.setSplitShared((event.target as HTMLInputElement).checked);
  }
  protected readonly syncHeading = $localize`:@@settings.sync:Sync`;
  protected readonly autoSyncLabel = $localize`:@@settings.autoSync:Automatic sync`;
  protected readonly autoSyncHelp = $localize`:@@settings.autoSync.help:Keep this library backed up to the cloud and pulled to your other devices.`;

  protected onAutoSync(event: Event): void {
    void this.presenter.setAutoSync((event.target as HTMLInputElement).checked);
  }

  // --- Account & sync (Epic 10) ---------------------------------------------
  protected readonly accountHeading = $localize`:@@settings.account:Account`;
  protected readonly accountUnavailable = $localize`:@@settings.account.unavailable:Sign-in and cloud sync are unavailable in this build. Your library works and is saved on this device.`;
  protected readonly signedInAs = $localize`:@@settings.account.signedInAs:Signed in as`;
  protected readonly proLabel = $localize`:@@settings.account.pro:Premium`;
  protected readonly googleLabel = $localize`:@@settings.account.google:Continue with Google`;
  protected readonly emailPlaceholder = $localize`:@@settings.account.email:Email`;
  protected readonly passwordPlaceholder = $localize`:@@settings.account.password:Password`;
  protected readonly loginLabel = $localize`:@@settings.account.login:Log in`;
  protected readonly registerLabel = $localize`:@@settings.account.register:Register`;
  protected readonly logoutLabel = $localize`:@@settings.account.logout:Log out`;
  protected readonly linkGoogleLabel = $localize`:@@settings.account.linkGoogle:Add Google & connect Drive`;
  protected readonly authErrorText = $localize`:@@settings.account.error:That did not work. Check your email and password and try again.`;
  protected readonly confirmEmailTitle = $localize`:@@settings.account.confirmTitle:Check your inbox`;
  protected readonly confirmEmailText = $localize`:@@settings.account.confirmText:We sent a confirmation link to your email. Click it to finish — you are not signed in until you do.`;

  protected readonly unsyncedText = $localize`:@@settings.sync.unsynced:Some changes have not reached the cloud yet.`;
  protected readonly driveHelp = $localize`:@@settings.drive.help:Manual Google Drive backup — one file you can see. Upload replaces the Drive copy; download merges it in.`;
  protected readonly driveUploadLabel = $localize`:@@settings.drive.upload:Upload to Drive`;
  protected readonly driveDownloadLabel = $localize`:@@settings.drive.download:Download from Drive`;
  protected readonly driveForceLabel = $localize`:@@settings.drive.force:Overwrite anyway`;

  private readonly driveUploaded = $localize`:@@settings.drive.uploaded:Uploaded to Drive.`;
  private readonly driveDownloaded = $localize`:@@settings.drive.downloaded:Downloaded from Drive.`;
  private readonly driveEmpty = $localize`:@@settings.drive.empty:No Drive backup found yet.`;
  private readonly driveConflict = $localize`:@@settings.drive.conflict:The Drive backup changed since you last synced.`;
  private readonly driveReauth = $localize`:@@settings.drive.reauth:Reconnecting to Google…`;
  private readonly driveFailed = $localize`:@@settings.drive.failed:That did not work. Try again.`;

  /** The status line under the Drive buttons for the last push/pull. */
  protected driveMessage(): string | null {
    const outcome = this.presenter.driveOutcome();
    switch (outcome?.kind) {
      case 'uploaded':
        return this.driveUploaded;
      case 'downloaded':
        return this.driveDownloaded;
      case 'empty':
        return this.driveEmpty;
      case 'conflict':
        return this.driveConflict;
      case 'reauth':
        return this.driveReauth;
      case 'failed':
        return this.driveFailed;
      default:
        return null;
    }
  }

  protected readonly themes = [
    { value: 'system' as const, label: $localize`:@@theme.system:System` },
    { value: 'light' as const, label: $localize`:@@theme.light:Light` },
    { value: 'dark' as const, label: $localize`:@@theme.dark:Dark` },
  ];

  // --- Stub settings (#1) — placeholders, disabled, not wired ---------------
  protected readonly comingHeading = $localize`:@@settings.coming:Coming soon`;
  protected readonly comingNote = $localize`:@@settings.coming.note:These are not available yet.`;
  protected readonly notationLabel = $localize`:@@settings.notation:Chord notation`;
  protected readonly notationHelp = $localize`:@@settings.notation.help:English (C, D, B) or German (with H for B natural, B for B♭).`;
  protected readonly notations = [
    { value: 'english', label: $localize`:@@notation.english:English` },
    { value: 'german', label: $localize`:@@notation.german:German` },
  ];
  protected readonly fontLibraryLabel = $localize`:@@settings.fontLibrary:Font library`;
  protected readonly fontLibraryHelp = $localize`:@@settings.fontLibrary.help:Add your own fonts to use in titles and lyrics.`;
  protected readonly fontLibraryButton = $localize`:@@settings.fontLibrary.button:Manage fonts`;

  // --- Backup / restore (#11) -----------------------------------------------
  private readonly _pendingRestore = signal<File | null>(null);
  /** A restore file picked and awaiting the confirm — a restore replaces
   * everything, so it never fires straight off the file picker. */
  protected readonly pendingRestore = this._pendingRestore.asReadonly();

  protected readonly backupHeading = $localize`:@@settings.backup:Backup`;
  protected readonly backupHelp = $localize`:@@settings.backup.help:Save your whole library to a file, or restore it from one. This is the entire database — different from exporting a few songs.`;
  protected readonly backupButton = $localize`:@@settings.backup.save:Back up to a file`;
  protected readonly restoreButton = $localize`:@@settings.backup.restore:Restore from a file`;
  protected readonly restoreConfirmTitle = $localize`:@@settings.restore.title:Restore this backup?`;
  protected readonly restoreConfirmText = $localize`:@@settings.restore.text:This replaces your entire current library with the backup. Anything not in the file is lost.`;
  protected readonly restoreConfirmButton = $localize`:@@settings.restore.confirm:Restore`;
  protected readonly cancelLabel = $localize`:@@settings.restore.cancel:Cancel`;
  protected readonly restoreFailedTitle = $localize`:@@settings.restore.failedTitle:That backup could not be restored`;
  protected readonly restoreFailedText = $localize`:@@settings.restore.failedText:It is not an Achordeon backup file, or it is damaged. Your library is unchanged.`;
  protected readonly okLabel = $localize`:@@settings.ok:OK`;

  /** A picked restore file, held for the confirm. The input is cleared so the
   * same file can be picked again after a cancel. */
  protected onRestoreFilePicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) this._pendingRestore.set(file);
  }

  protected cancelRestore(): void {
    this._pendingRestore.set(null);
  }

  protected confirmRestore(file: File): void {
    this._pendingRestore.set(null);
    void this.presenter.restore(file);
  }
}
