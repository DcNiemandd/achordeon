// Settings page — Epic 13 (frame + the Global settings-panel mount)
// Spec: PRD-UI-SHELL.md §4
//
// Epic 13 lands the FRAME and the panel's first home. Profile, sync and language
// are Epic 12 — it mounts THIS panel, it does not build another.

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Button, Dialog, Icon, Premium, Tooltip } from '../primitives';
import { ActionBar, BackNavigation } from '../shared/layout';
import { SettingsPanel } from '../shared/settings-panel';
import { SettingsPresenter } from './settings.presenter';

/** Which credential dialog is open. Login and register are separate forms so
 * each has room for its own validation (a register with only one password field
 * was the bug this replaces). */
type AuthDialog = 'login' | 'register' | 'forgot' | 'addPassword' | null;

/** A pragmatic email shape check — the real proof is the confirmation email
 * (ADR-0009), so this only catches obvious typos before a round-trip. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Supabase's default minimum; mirrored here so the form can say so up front. */
const MIN_PASSWORD = 8;

@Component({
  selector: 'app-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SettingsPresenter],
  host: { '(document:keydown.escape)': 'onEscape($event)' },
  imports: [ActionBar, SettingsPanel, Button, Dialog, Icon, Premium, Tooltip],
  template: `
    <app-action-bar [title]="title" />

    <!-- The scroll lives on the full-width body, so the scrollbar sits at the
         right edge of the page; the content inside it is centred and capped, so
         the settings read as a column in the middle rather than a block shoved
         against the left. -->
    <div class="body">
      <div class="content">
        <!-- Account (Epic 10). Login gates cloud sync ONLY — the library works
             signed out (apps/docs/docs/settings.mdx §Profile). -->
        <section class="section">
          <h2 class="heading">{{ accountHeading }}</h2>

          @switch (presenter.authStatus()) {
            @case ('unavailable') {
              <p class="backup-help">{{ accountUnavailable }}</p>
            }
            @case ('signed-in') {
              <p class="account-line" data-testid="account-email">
                {{ signedInAs }} <strong>{{ presenter.email() }}</strong>
                <span
                  class="tier-badge"
                  [class.is-pro]="presenter.isPro()"
                  data-testid="tier-badge"
                  >{{ presenter.isPro() ? proLabel : freeLabel }}</span
                >
              </p>

              <p class="method-line" data-testid="account-methods">
                {{ methodsLabel }}
                <strong>{{ methodsSummary() }}</strong>
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
                @if (!presenter.hasPassword()) {
                  <button
                    appButton
                    variant="secondary"
                    data-testid="add-password"
                    (click)="openAddPassword()"
                  >
                    {{ addPasswordLabel }}
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
              <!-- One sentence in the open; the tier/privacy detail is a
                   paragraph, so it lives in the docs, not a cramped tooltip. -->
              <p class="setting-note">
                {{ accountWhy }}
                <a
                  class="doc-link"
                  [href]="docsUrl"
                  target="_blank"
                  rel="noopener"
                  data-testid="account-docs"
                  >{{ learnMore }}</a
                >
              </p>

              <div class="setting">
                <div class="head">
                  <span class="label">{{ googleHeading }}</span>
                  <button
                    appButton
                    type="button"
                    class="help"
                    [isIconOnly]="true"
                    [appTooltip]="googleHelp"
                    appTooltipTrigger="click"
                    [attr.aria-label]="aboutGoogle"
                    data-testid="help-google"
                  >
                    <app-icon name="help" />
                  </button>
                </div>
                <button
                  appButton
                  variant="secondary"
                  data-testid="login-google"
                  (click)="presenter.logInGoogle()"
                >
                  {{ googleLabel }}
                </button>
              </div>

              <div class="setting">
                <div class="head">
                  <span class="label">{{ emailHeading }}</span>
                  <button
                    appButton
                    type="button"
                    class="help"
                    [isIconOnly]="true"
                    [appTooltip]="emailHelp"
                    appTooltipTrigger="click"
                    [attr.aria-label]="aboutEmail"
                    data-testid="help-email"
                  >
                    <app-icon name="help" />
                  </button>
                </div>
                <div class="backup-actions">
                  <button
                    appButton
                    variant="secondary"
                    data-testid="open-login"
                    (click)="openLogin()"
                  >
                    {{ loginLabel }}
                  </button>
                  <button
                    appButton
                    variant="ghost"
                    data-testid="open-register"
                    (click)="openRegister()"
                  >
                    {{ registerLabel }}
                  </button>
                </div>
              </div>
            }
          }

          <!-- Sync + Backup are subsections OF the account (Epic 10): both are
               "what an account does with your library", so they live under it.
               Every method is shown at every account state; the ones whose
               prerequisite is missing are DISABLED, with a line saying what
               unlocks them (item 7) — never hidden, so the reach is legible. -->
          @if (presenter.authStatus() !== 'unavailable') {
            <div class="subsection">
              <h3 class="sub-title">{{ syncHeading }}</h3>

              <!-- Automatic cloud sync — Premium. Shown always; the control is
                   disabled until a signed-in Premium account is present. -->
              <div class="setting">
                <div class="head">
                  <span class="label">{{ autoSyncLabel }}</span>
                  <button
                    appButton
                    type="button"
                    class="help"
                    [isIconOnly]="true"
                    [appTooltip]="autoSyncHelp"
                    appTooltipTrigger="click"
                    [attr.aria-label]="aboutAutoSync"
                    data-testid="help-auto-sync"
                  >
                    <app-icon name="help" />
                  </button>
                </div>
                <app-premium [label]="autoSyncLabel">
                  <label
                    class="check-row"
                    [class.is-disabled]="!presenter.canAutoSync()"
                  >
                    <input
                      type="checkbox"
                      class="check"
                      [checked]="presenter.autoSync()"
                      [disabled]="!presenter.canAutoSync()"
                      data-testid="auto-sync"
                      (change)="onAutoSync($event)"
                    />
                    <span class="check-label">{{ autoSyncOnLabel }}</span>
                  </label>
                </app-premium>
                @if (!presenter.canAutoSync()) {
                  <p class="requirement" data-testid="auto-sync-req">
                    {{ autoSyncReq }}
                  </p>
                }
                @if (presenter.hasUnsynced()) {
                  <p class="unsynced" data-testid="unsynced">
                    {{ unsyncedText }}
                  </p>
                }
              </div>

              <!-- Manual Google Drive backup — needs a Google login (Drive rides
                   the Google identity, ADR-0009). Shown always; disabled until. -->
              <div class="setting">
                <div class="head">
                  <span class="label">{{ driveHeading }}</span>
                  <button
                    appButton
                    type="button"
                    class="help"
                    [isIconOnly]="true"
                    [appTooltip]="driveHelp"
                    appTooltipTrigger="click"
                    [attr.aria-label]="aboutDrive"
                    data-testid="help-drive"
                  >
                    <app-icon name="help" />
                  </button>
                </div>
                <div class="backup-actions">
                  <button
                    appButton
                    variant="secondary"
                    [disabled]="!canDrive() || presenter.driveBusy()"
                    data-testid="drive-upload"
                    (click)="presenter.driveUpload()"
                  >
                    <app-icon name="download" />
                    {{ driveUploadLabel }}
                  </button>
                  <button
                    appButton
                    variant="secondary"
                    [disabled]="!canDrive() || presenter.driveBusy()"
                    data-testid="drive-download"
                    (click)="presenter.driveDownload()"
                  >
                    <app-icon name="import" />
                    {{ driveDownloadLabel }}
                  </button>
                </div>
                @if (!canDrive()) {
                  <p class="requirement" data-testid="drive-req">
                    {{ driveReq }}
                  </p>
                }
                @if (driveMessage(); as message) {
                  <p class="backup-help" data-testid="drive-status">
                    {{ message }}
                    @if (presenter.driveOutcome()?.kind === 'conflict') {
                      <button
                        appButton
                        variant="ghost"
                        [disabled]="presenter.driveBusy()"
                        data-testid="drive-force"
                        (click)="presenter.driveUpload(true)"
                      >
                        {{ driveForceLabel }}
                      </button>
                    }
                  </p>
                }
              </div>
            </div>
          }

          <!-- File backup — the no-account method, works everywhere. Distinct
               from Export: the entire library, verbatim; Restore REPLACES it. -->
          <div class="subsection">
            <div class="head">
              <h3 class="sub-title heading-inline">{{ backupHeading }}</h3>
              <button
                appButton
                type="button"
                class="help"
                [isIconOnly]="true"
                [appTooltip]="backupHelp"
                appTooltipTrigger="click"
                [attr.aria-label]="aboutBackup"
                data-testid="help-backup"
              >
                <app-icon name="help" />
              </button>
            </div>
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
          <div class="setting">
            <div class="head">
              <span class="label">{{ splitSharedLabel }}</span>
              <button
                appButton
                type="button"
                class="help"
                [isIconOnly]="true"
                [appTooltip]="splitSharedHelp"
                appTooltipTrigger="click"
                [attr.aria-label]="aboutSplitShared"
                data-testid="help-split-shared"
              >
                <app-icon name="help" />
              </button>
            </div>
            <!-- A checkbox, not a segmented pair: one fact that is either true or
                 false; "Linked / Not linked" would be two words for one switch. -->
            <label class="check-row">
              <input
                type="checkbox"
                class="check"
                [checked]="presenter.isSplitShared()"
                data-testid="split-shared"
                (change)="onSplitShared($event)"
              />
              <span class="check-label">{{ splitSharedOnLabel }}</span>
            </label>
          </div>
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

    @if (authDialog() === 'login') {
      <app-dialog
        [title]="loginTitle"
        data-testid="login-dialog"
        (closed)="closeAuthDialog()"
      >
        <div class="dialog-form">
          <input
            #le
            class="text-input"
            type="email"
            autocomplete="email"
            [placeholder]="emailPlaceholder"
            [attr.aria-label]="emailPlaceholder"
            [value]="fEmail()"
            (input)="fEmail.set(le.value)"
            (keydown.enter)="submitLogin()"
            data-testid="login-email"
          />
          <input
            #lp
            class="text-input"
            type="password"
            autocomplete="current-password"
            [placeholder]="passwordPlaceholder"
            [attr.aria-label]="passwordPlaceholder"
            [value]="fPassword()"
            (input)="fPassword.set(lp.value)"
            (keydown.enter)="submitLogin()"
            data-testid="login-password"
          />
          <button
            type="button"
            class="link-btn"
            data-testid="forgot-open"
            (click)="openForgot()"
          >
            {{ forgotLink }}
          </button>
          @if (presenter.authError() !== null) {
            <p class="warn" data-testid="login-error">
              {{ presenter.authError() || genericAuthError }}
            </p>
          }
        </div>
        <button
          dialog-actions
          appButton
          type="button"
          variant="ghost"
          data-testid="login-cancel"
          (click)="closeAuthDialog()"
        >
          {{ cancelLabel }}
        </button>
        <button
          dialog-actions
          appButton
          type="button"
          variant="primary"
          data-testid="login-submit"
          [disabled]="!canLogin()"
          (click)="submitLogin()"
        >
          {{ loginLabel }}
        </button>
      </app-dialog>
    }

    @if (authDialog() === 'register') {
      <app-dialog
        [title]="registerTitle"
        data-testid="register-dialog"
        (closed)="closeAuthDialog()"
      >
        <div class="dialog-form">
          <input
            #re
            class="text-input"
            type="email"
            autocomplete="email"
            [placeholder]="emailPlaceholder"
            [attr.aria-label]="emailPlaceholder"
            [value]="fEmail()"
            (input)="fEmail.set(re.value)"
            (keydown.enter)="submitRegister()"
            data-testid="register-email"
          />
          @if (fEmail() && !emailValid()) {
            <p class="field-hint">{{ emailInvalidHint }}</p>
          }
          <input
            #rp
            class="text-input"
            type="password"
            autocomplete="new-password"
            [placeholder]="passwordPlaceholder"
            [attr.aria-label]="passwordPlaceholder"
            [value]="fPassword()"
            (input)="fPassword.set(rp.value)"
            (keydown.enter)="submitRegister()"
            data-testid="register-password"
          />
          @if (fPassword() && !passwordValid()) {
            <p class="field-hint">{{ passwordHint }}</p>
          }
          <input
            #rc
            class="text-input"
            type="password"
            autocomplete="new-password"
            [placeholder]="confirmPlaceholder"
            [attr.aria-label]="confirmPlaceholder"
            [value]="fConfirm()"
            (input)="fConfirm.set(rc.value)"
            (keydown.enter)="submitRegister()"
            data-testid="register-confirm"
          />
          @if (fConfirm() && !confirmValid()) {
            <p class="field-hint">{{ confirmHint }}</p>
          }
          @if (presenter.authError() !== null) {
            <p class="warn" data-testid="register-error">
              {{ presenter.authError() || genericAuthError }}
            </p>
          }
        </div>
        <button
          dialog-actions
          appButton
          type="button"
          variant="ghost"
          data-testid="register-cancel"
          (click)="closeAuthDialog()"
        >
          {{ cancelLabel }}
        </button>
        <button
          dialog-actions
          appButton
          type="button"
          variant="primary"
          data-testid="register-submit"
          [disabled]="!canRegister()"
          (click)="submitRegister()"
        >
          {{ registerLabel }}
        </button>
      </app-dialog>
    }

    @if (authDialog() === 'forgot') {
      <app-dialog
        [title]="forgotTitle"
        data-testid="forgot-dialog"
        (closed)="closeAuthDialog()"
      >
        <div class="dialog-form">
          <p class="check-help">{{ forgotText }}</p>
          <input
            #fe
            class="text-input"
            type="email"
            autocomplete="email"
            [placeholder]="emailPlaceholder"
            [attr.aria-label]="emailPlaceholder"
            [value]="fEmail()"
            (input)="fEmail.set(fe.value)"
            (keydown.enter)="submitForgot()"
            data-testid="forgot-email"
          />
          @if (presenter.authError() !== null) {
            <p class="warn" data-testid="forgot-error">
              {{ presenter.authError() || genericAuthError }}
            </p>
          }
        </div>
        <button
          dialog-actions
          appButton
          type="button"
          variant="ghost"
          data-testid="forgot-cancel"
          (click)="closeAuthDialog()"
        >
          {{ cancelLabel }}
        </button>
        <button
          dialog-actions
          appButton
          type="button"
          variant="primary"
          data-testid="forgot-submit"
          [disabled]="!emailValid()"
          (click)="submitForgot()"
        >
          {{ forgotSubmitLabel }}
        </button>
      </app-dialog>
    }

    @if (presenter.resetState() === 'sent') {
      <app-dialog
        [title]="forgotTitle"
        data-testid="forgot-sent-dialog"
        (closed)="presenter.dismissReset()"
      >
        <p data-testid="forgot-sent">{{ forgotSentText }}</p>
        <button
          dialog-actions
          appButton
          type="button"
          variant="primary"
          data-testid="forgot-close"
          (click)="presenter.dismissReset()"
        >
          {{ okLabel }}
        </button>
      </app-dialog>
    }

    @if (authDialog() === 'addPassword') {
      <app-dialog
        [title]="addPasswordTitle"
        data-testid="add-password-dialog"
        (closed)="closeAuthDialog()"
      >
        <div class="dialog-form">
          <p class="check-help">{{ addPasswordText }}</p>
          <input
            #ae
            class="text-input"
            type="email"
            autocomplete="email"
            [placeholder]="emailPlaceholder"
            [attr.aria-label]="emailPlaceholder"
            [value]="fEmail()"
            (input)="fEmail.set(ae.value)"
            (keydown.enter)="submitAddPassword()"
            data-testid="add-password-email"
          />
          @if (fEmail() && !emailValid()) {
            <p class="field-hint">{{ emailInvalidHint }}</p>
          }
          <input
            #ap
            class="text-input"
            type="password"
            autocomplete="new-password"
            [placeholder]="passwordPlaceholder"
            [attr.aria-label]="passwordPlaceholder"
            [value]="fPassword()"
            (input)="fPassword.set(ap.value)"
            (keydown.enter)="submitAddPassword()"
            data-testid="add-password-password"
          />
          @if (fPassword() && !passwordValid()) {
            <p class="field-hint">{{ passwordHint }}</p>
          }
          <input
            #ac
            class="text-input"
            type="password"
            autocomplete="new-password"
            [placeholder]="confirmPlaceholder"
            [attr.aria-label]="confirmPlaceholder"
            [value]="fConfirm()"
            (input)="fConfirm.set(ac.value)"
            (keydown.enter)="submitAddPassword()"
            data-testid="add-password-confirm"
          />
          @if (fConfirm() && !confirmValid()) {
            <p class="field-hint">{{ confirmHint }}</p>
          }
          @if (presenter.authError() !== null) {
            <p class="warn" data-testid="add-password-error">
              {{ presenter.authError() || genericAuthError }}
            </p>
          }
        </div>
        <button
          dialog-actions
          appButton
          type="button"
          variant="ghost"
          data-testid="add-password-cancel"
          (click)="closeAuthDialog()"
        >
          {{ cancelLabel }}
        </button>
        <button
          dialog-actions
          appButton
          type="button"
          variant="primary"
          data-testid="add-password-submit"
          [disabled]="!canRegister()"
          (click)="submitAddPassword()"
        >
          {{ addPasswordLabel }}
        </button>
      </app-dialog>
    }

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

    /* Every section lays itself out the same way — a column with one gap — so
       the render panel and the hand-built sections read alike (item 3): no
       section relies on ad-hoc margins between its title and its controls. */
    .section {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    /* Copied verbatim from app-settings-panel's .section-title so the render
       section and the hand-built ones share one title style (item 3). */
    .heading {
      margin: 0;
      font-size: var(--text-xs);
      font-weight: 500;
      color: var(--text-faint);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    /* Sync / Backup sit UNDER the account (item 2): separated by a rule and the
       same internal gap, titled a level down from the section heading. */
    .subsection {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      padding-block-start: var(--space-3);
      border-block-start: 1px solid var(--border);
    }

    .sub-title {
      margin: 0;
      font-size: var(--text-xs);
      font-weight: 500;
      color: var(--text-faint);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    /* What unlocks a disabled sync method (item 7). */
    .requirement {
      margin: 0;
      font-size: var(--text-xs);
      color: var(--text-muted);
    }

    .check-row.is-disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    .doc-link {
      color: var(--brand);
      white-space: nowrap;
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
      margin: 0 0 var(--space-2);
      font-size: var(--text-sm);
      color: var(--text);
    }

    .method-line {
      margin: 0 0 var(--space-3);
      font-size: var(--text-xs);
      color: var(--text-muted);
    }

    /* One sentence + a docs link, on the section's own gap (no ad-hoc margin). */
    .setting-note {
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: var(--space-1);
      margin: 0;
      font-size: var(--text-sm);
      color: var(--text-muted);
    }

    /* A settings row: label + (?) help on one line, the control beneath — the
       same shape (and gap) app-settings-panel's .row gives every render setting. */
    .setting {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      align-items: flex-start;
    }

    .head {
      display: flex;
      align-items: center;
      gap: 2px;
    }

    .head .label {
      font-size: var(--text-sm);
      color: var(--text);
    }

    /* A section title that shares its line with a (?) — cancels the block
       heading's bottom margin so the row stays centred. */
    .heading-inline {
      margin: 0;
    }

    /* The (?) trigger, sized to sit quietly beside a label (from the panel). */
    .help {
      --icon-size: 13px;
      block-size: 18px;
      min-inline-size: 18px;
      color: var(--text-faint);
    }

    .dialog-form {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      min-inline-size: min(320px, 70vw);
    }

    .link-btn {
      align-self: flex-start;
      padding: 0;
      border: 0;
      background: none;
      color: var(--brand);
      font: inherit;
      font-size: var(--text-xs);
      cursor: pointer;
      text-decoration: underline;
    }

    .field-hint {
      margin: calc(-1 * var(--space-1)) 0 0;
      font-size: var(--text-xs);
      color: var(--text-muted);
    }

    /* The tier flag — always shown (item 1). Neutral for Free, brand for Pro. */
    .tier-badge {
      margin-inline-start: var(--space-2);
      padding: 2px var(--space-2);
      border-radius: var(--space-1);
      background: var(--surface-sunken, var(--surface));
      border: 1px solid var(--border);
      color: var(--text-muted);
      font-size: var(--text-xs);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .tier-badge.is-pro {
      background: var(--premium-glow, var(--brand));
      border-color: transparent;
      color: var(--text-on-brand, #fff);
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
  protected readonly splitSharedOnLabel = $localize`:@@settings.splitShared.on:Use one panel size everywhere`;
  protected readonly splitSharedHelp = $localize`:@@settings.splitShared.help:Off: each module remembers how you sized its panels.`;
  protected readonly aboutSplitShared = $localize`:@@settings.splitShared.about:About panel sizing`;

  protected onSplitShared(event: Event): void {
    this.presenter.setSplitShared((event.target as HTMLInputElement).checked);
  }
  protected readonly syncHeading = $localize`:@@settings.sync:Sync`;
  protected readonly autoSyncLabel = $localize`:@@settings.autoSync:Automatic sync`;
  protected readonly autoSyncOnLabel = $localize`:@@settings.autoSync.on:Sync automatically`;
  protected readonly autoSyncHelp = $localize`:@@settings.autoSync.help:Keep this library backed up to the cloud and pulled to your other devices.`;
  protected readonly aboutAutoSync = $localize`:@@settings.autoSync.about:About automatic sync`;
  protected readonly autoSyncReq = $localize`:@@settings.autoSync.requires:Available on a Premium account.`;
  protected readonly driveHeading = $localize`:@@settings.drive.heading:Google Drive backup`;
  protected readonly aboutDrive = $localize`:@@settings.drive.about:About Google Drive backup`;
  protected readonly driveReq = $localize`:@@settings.drive.requires:Sign in with Google to back up to Drive.`;

  protected onAutoSync(event: Event): void {
    void this.presenter.setAutoSync((event.target as HTMLInputElement).checked);
  }

  // --- Account & sync (Epic 10) ---------------------------------------------

  /** Which auth dialog is open (null = none). Login and register are forms in
   * their own dialogs so validation has room and the section stays a summary. */
  protected readonly authDialog = signal<AuthDialog>(null);

  // The one place the credential fields live while a dialog is open. Shared
  // across the dialogs because only one is ever open at a time.
  protected readonly fEmail = signal('');
  protected readonly fPassword = signal('');
  protected readonly fConfirm = signal('');

  protected readonly emailValid = computed(() =>
    EMAIL_RE.test(this.fEmail().trim()),
  );
  protected readonly passwordValid = computed(
    () => this.fPassword().length >= MIN_PASSWORD,
  );
  protected readonly confirmValid = computed(
    () => this.fConfirm().length > 0 && this.fConfirm() === this.fPassword(),
  );
  /** Login only needs a well-formed email and a non-empty password (the length
   * rule is the server's to enforce on an existing account). */
  protected readonly canLogin = computed(
    () => this.emailValid() && this.fPassword().length > 0,
  );
  /** Register / add-password need all three fields valid and matching. */
  protected readonly canRegister = computed(
    () => this.emailValid() && this.passwordValid() && this.confirmValid(),
  );

  /** Drive backup rides the Google identity (ADR-0009): it needs a signed-in
   * account that has Google linked. Shown always, enabled only then (item 7). */
  protected readonly canDrive = computed(
    () =>
      this.presenter.authStatus() === 'signed-in' && this.presenter.hasGoogle(),
  );

  /** A short, screen-reader-friendly summary of the linked login methods. */
  protected methodsSummary(): string {
    const parts: string[] = [];
    if (this.presenter.hasGoogle()) parts.push(this.googleWord);
    if (this.presenter.hasPassword()) parts.push(this.passwordWord);
    return parts.join(', ') || this.methodsNone;
  }

  protected openLogin(): void {
    this.resetForm('login');
  }

  protected openRegister(): void {
    this.resetForm('register');
  }

  /** Forgot flow reuses the email already typed (if any) and does not wipe it. */
  protected openForgot(): void {
    this.presenter.clearAuthError();
    this.presenter.dismissReset();
    this.authDialog.set('forgot');
  }

  protected openAddPassword(): void {
    this.resetForm('addPassword');
    this.fEmail.set(this.presenter.email() ?? '');
  }

  protected closeAuthDialog(): void {
    this.authDialog.set(null);
    this.fEmail.set('');
    this.fPassword.set('');
    this.fConfirm.set('');
    this.presenter.clearAuthError();
    this.presenter.dismissReset();
  }

  protected async submitLogin(): Promise<void> {
    if (!this.canLogin()) return;
    const ok = await this.presenter.logIn(
      this.fEmail().trim(),
      this.fPassword(),
    );
    if (ok) this.closeAuthDialog();
  }

  protected async submitRegister(): Promise<void> {
    if (!this.canRegister()) return;
    const ok = await this.presenter.register(
      this.fEmail().trim(),
      this.fPassword(),
    );
    // On success the confirmation dialog takes over (email must be confirmed).
    if (ok) this.closeAuthDialog();
  }

  protected async submitForgot(): Promise<void> {
    if (!this.emailValid()) return;
    const ok = await this.presenter.resetPassword(this.fEmail().trim());
    // Close the form (but keep `resetState`), so the "sent" confirmation dialog
    // takes its place. A failure leaves the form open with its error line.
    if (ok) {
      this.authDialog.set(null);
      this.fEmail.set('');
    }
  }

  protected async submitAddPassword(): Promise<void> {
    if (!this.canRegister()) return;
    const ok = await this.presenter.addPassword(
      this.fEmail().trim(),
      this.fPassword(),
    );
    if (ok) this.closeAuthDialog();
  }

  private resetForm(dialog: AuthDialog): void {
    this.fEmail.set('');
    this.fPassword.set('');
    this.fConfirm.set('');
    this.presenter.clearAuthError();
    this.presenter.dismissReset();
    this.authDialog.set(dialog);
  }

  protected readonly accountHeading = $localize`:@@settings.account:Account`;
  protected readonly accountUnavailable = $localize`:@@settings.account.unavailable:Sign-in and cloud sync are unavailable in this build. Your library works and is saved on this device.`;
  protected readonly signedInAs = $localize`:@@settings.account.signedInAs:Signed in as`;
  protected readonly proLabel = $localize`:@@settings.account.pro:Premium`;
  protected readonly freeLabel = $localize`:@@settings.account.free:Free`;
  protected readonly methodsLabel = $localize`:@@settings.account.methods:Sign-in methods:`;
  protected readonly googleWord = $localize`:@@settings.account.googleWord:Google`;
  protected readonly passwordWord = $localize`:@@settings.account.passwordWord:Email & password`;
  protected readonly methodsNone = $localize`:@@settings.account.methodsNone:none`;

  // One sentence in the open; the tier/privacy detail is a paragraph, so it
  // lives in the docs (linked) rather than a cramped tooltip.
  protected readonly accountWhy = $localize`:@@settings.account.why:Sign in to keep your library synced across your devices.`;
  protected readonly learnMore = $localize`:@@settings.account.learnMore:Learn more`;
  /** The published docs (apps/docs, GitHub Pages) — the account & sync guide. */
  protected readonly docsUrl = 'https://dcniemandd.github.io/achordeon/';
  protected readonly aboutGoogle = $localize`:@@settings.account.aboutGoogle:About signing in with Google`;
  protected readonly aboutEmail = $localize`:@@settings.account.aboutEmail:About email sign-in`;

  protected readonly googleHeading = $localize`:@@settings.account.googleHeading:Google`;
  protected readonly googleHelp = $localize`:@@settings.account.googleHelp:One tap. Also connects Google Drive for backup.`;
  protected readonly googleLabel = $localize`:@@settings.account.google:Continue with Google`;
  protected readonly emailHeading = $localize`:@@settings.account.emailHeading:Email & password`;
  protected readonly emailHelp = $localize`:@@settings.account.emailHelp:Use an email address instead of Google.`;
  protected readonly emailPlaceholder = $localize`:@@settings.account.email:Email`;
  protected readonly passwordPlaceholder = $localize`:@@settings.account.password:Password`;
  protected readonly confirmPlaceholder = $localize`:@@settings.account.confirm:Confirm password`;
  protected readonly loginLabel = $localize`:@@settings.account.login:Log in`;
  protected readonly registerLabel = $localize`:@@settings.account.register:Register`;
  protected readonly logoutLabel = $localize`:@@settings.account.logout:Log out`;
  protected readonly linkGoogleLabel = $localize`:@@settings.account.linkGoogle:Add Google & connect Drive`;
  protected readonly addPasswordLabel = $localize`:@@settings.account.addPassword:Add a password`;

  protected readonly loginTitle = $localize`:@@settings.account.loginTitle:Log in`;
  protected readonly registerTitle = $localize`:@@settings.account.registerTitle:Create your account`;
  protected readonly forgotLink = $localize`:@@settings.account.forgotLink:Forgot your password?`;
  protected readonly forgotTitle = $localize`:@@settings.account.forgotTitle:Reset your password`;
  protected readonly forgotText = $localize`:@@settings.account.forgotText:Enter your email and we'll send a link to set a new password.`;
  protected readonly forgotSubmitLabel = $localize`:@@settings.account.forgotSubmit:Send reset link`;
  protected readonly forgotSentText = $localize`:@@settings.account.forgotSent:Check your inbox for the reset link.`;
  protected readonly addPasswordTitle = $localize`:@@settings.account.addPasswordTitle:Add a password`;
  protected readonly addPasswordText = $localize`:@@settings.account.addPasswordText:Set an email and password you can also log in with. You'll need to confirm the email.`;

  protected readonly emailInvalidHint = $localize`:@@settings.account.emailInvalid:Enter a valid email address.`;
  protected readonly passwordHint = $localize`:@@settings.account.passwordRule:Use at least 8 characters.`;
  protected readonly confirmHint = $localize`:@@settings.account.confirmRule:Passwords do not match.`;
  protected readonly genericAuthError = $localize`:@@settings.account.error:That did not work. Please try again.`;
  protected readonly confirmEmailTitle = $localize`:@@settings.account.confirmTitle:Check your inbox`;
  protected readonly confirmEmailText = $localize`:@@settings.account.confirmText:We sent a confirmation link to your email. Click it to finish — the sign-in method is not active until you do.`;

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
  protected readonly aboutBackup = $localize`:@@settings.backup.about:About backup`;
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
