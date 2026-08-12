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
import { RouterLink } from '@angular/router';
import { Button, Dialog, Icon, Premium, Tooltip } from '../primitives';
import { BUILD_DATE } from '../shared/build-info';
import { FeedbackDialog, type FeedbackDraft } from '../shared/feedback';
import { ShortcutsDialog } from '../shared/keyboard';
import { ActionBar, BackNavigation, docsPageUrl } from '../shared/layout';
import { FontList } from '../shared/fonts';
import { SettingsPanel } from '../shared/settings-panel';
import { SettingsPresenter, type RestoreMode } from './settings.presenter';

/**
 * A backup waiting on the Add-or-Replace choice, and where it came from — the
 * file the user picked, or the copy in their Drive.
 */
type PendingRestore =
  | { readonly source: 'file'; readonly file: File }
  | { readonly source: 'drive' };

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
  imports: [
    ActionBar,
    FontList,
    SettingsPanel,
    Button,
    Dialog,
    FeedbackDialog,
    Icon,
    Premium,
    RouterLink,
    ShortcutsDialog,
    Tooltip,
  ],
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
              <p class="setting-note">{{ accountUnavailable }}</p>
            }
            @case ('signed-in') {
              <!-- Who you are, on the card's own line above the controls: it is
                   the answer the section exists to give, not a setting. -->
              <div class="identity" data-testid="account-email">
                <span class="identity-who">
                  <span class="identity-caption">{{ signedInAs }}</span>
                  <strong class="identity-email">{{
                    presenter.email()
                  }}</strong>
                </span>
                <span
                  class="tier-badge"
                  [class.is-pro]="presenter.isPro()"
                  data-testid="tier-badge"
                  >{{ presenter.isPro() ? proLabel : freeLabel }}</span
                >
              </div>

              <div class="group">
                <div class="setting">
                  <div class="head">
                    <span class="label">{{ methodsLabel }}</span>
                  </div>
                  <p class="value" data-testid="account-methods">
                    {{ methodsSummary() }}
                  </p>
                  @if (!presenter.hasGoogle() || !presenter.hasPassword()) {
                    <div class="actions">
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
                    </div>
                  }
                </div>

                <div class="setting">
                  <div class="head">
                    <span class="label">{{ sessionHeading }}</span>
                  </div>
                  <div class="actions">
                    <button
                      appButton
                      variant="secondary"
                      data-testid="logout"
                      (click)="presenter.logOut()"
                    >
                      {{ logoutLabel }}
                    </button>
                    <button
                      appButton
                      variant="ghost"
                      class="danger-btn"
                      data-testid="delete-account"
                      (click)="confirmDelete.set(true)"
                    >
                      {{ deleteAccountLabel }}
                    </button>
                  </div>
                </div>
              </div>
            }
            @default {
              <!-- One sentence in the open; the tier/privacy detail is a
                   paragraph, so it lives in the docs, not a cramped tooltip. -->
              <p class="setting-note">
                {{ accountWhy }}
                <a
                  class="doc-link"
                  [href]="docsUrl()"
                  target="_blank"
                  rel="noopener"
                  data-testid="account-docs"
                  >{{ learnMore }}</a
                >
              </p>

              <div class="group">
                <div class="setting">
                  <div class="head">
                    <span class="label">{{ googleHeading }}</span>
                    <button
                      appButton
                      type="button"
                      class="help"
                      [isIconOnly]="true"
                      [appTooltip]="googleHelp"
                      appTooltipTrigger="help"
                      [attr.aria-label]="aboutGoogle"
                      data-testid="help-google"
                    >
                      <app-icon name="help" />
                    </button>
                  </div>
                  <div class="actions">
                    <button
                      appButton
                      variant="secondary"
                      data-testid="login-google"
                      (click)="presenter.logInGoogle()"
                    >
                      {{ googleLabel }}
                    </button>
                  </div>
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
                      appTooltipTrigger="help"
                      [attr.aria-label]="aboutEmail"
                      data-testid="help-email"
                    >
                      <app-icon name="help" />
                    </button>
                  </div>
                  <div class="actions">
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
              </div>
            }
          }

          <!-- Sync is a subsection OF the account (Epic 10): every way to get the
               library onto another device lives here. The online methods (auto
               sync, Drive) need an account and are hidden when the build has no
               backend; Manual backup is the no-account method, nested below and
               always available. Prerequisite-missing controls are DISABLED with a
               line saying what unlocks them (item 7) — never hidden. -->
          <!-- One level below the section heading, and the SAME title style the
               render panel gives PAGE / TITLE / CHORDS: the page has exactly two
               levels of grouping and each one looks like itself. -->
          <div class="subsection">
            <h3 class="subheading">{{ syncHeading }}</h3>

            <div class="group">
              @if (presenter.authStatus() !== 'unavailable') {
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
                      appTooltipTrigger="help"
                      [attr.aria-label]="aboutAutoSync"
                      data-testid="help-auto-sync"
                    >
                      <app-icon name="help" />
                    </button>
                  </div>
                  <app-premium
                    [label]="autoSyncLabel"
                    [isMarked]="presenter.marksAutoSyncPremium()"
                    [isTesting]="presenter.autoSyncTesting()"
                  >
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
                    <p class="requirement" data-testid="unsynced">
                      {{ unsyncedText }}
                    </p>
                  }
                </div>
              }

              <!-- Manual backup — the no-account method, works everywhere. Sits
                   with Sync because every "move my library elsewhere" tool
                   belongs together, and as a plain row rather than a third
                   heading level: it is one setting, not a group. Distinct from
                   Export: the entire library, verbatim; Restore REPLACES it. -->
              <div class="setting">
                <div class="head">
                  <span class="label">{{ backupHeading }}</span>
                  <button
                    appButton
                    type="button"
                    class="help"
                    [isIconOnly]="true"
                    [appTooltip]="backupHelp"
                    appTooltipTrigger="help"
                    [attr.aria-label]="aboutBackup"
                    data-testid="help-backup"
                  >
                    <app-icon name="help" />
                  </button>
                </div>
                <div class="actions">
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

              @if (presenter.authStatus() !== 'unavailable') {
                <!-- Manual Google Drive backup — needs a Google login (Drive
                     rides the Google identity, ADR-0009). Two buttons and a
                     status line, so it takes the row's full width rather than
                     wrapping inside half of it. -->
                <div class="setting is-wide">
                  <div class="head">
                    <span class="label">{{ driveHeading }}</span>
                    <button
                      appButton
                      type="button"
                      class="help"
                      [isIconOnly]="true"
                      [appTooltip]="driveHelp"
                      appTooltipTrigger="help"
                      [attr.aria-label]="aboutDrive"
                      data-testid="help-drive"
                    >
                      <app-icon name="help" />
                    </button>
                  </div>
                  <div class="actions">
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
                      (click)="askRestore({ source: 'drive' })"
                    >
                      <app-icon name="import" />
                      {{ driveDownloadLabel }}
                    </button>
                  </div>
                  <!-- Gone the moment Google is connected — the row works from
                       then on, and a line telling you to do what you have
                       already done reads as the app not having noticed. Until
                       then it names the step that is actually missing: "add
                       Google to your account" is nonsense to someone who has no
                       account yet. -->
                  @if (!presenter.hasGoogle()) {
                    <p class="requirement" data-testid="drive-req">
                      {{
                        presenter.isSignedIn() ? driveReqLink : driveReqSignIn
                      }}
                    </p>
                  }
                  @if (driveMessage(); as message) {
                    <p class="status" data-testid="drive-status">
                      <span>{{ message }}</span>
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
              }
            </div>

            <!-- The other way a library moves: a few songs, chosen, in a file
                 you send someone (Epic 7). It is NOT a second backup, and it is
                 not built here — the pickers live where the songs are, because
                 choosing which ones is the whole act. This is the signpost, so
                 someone who came to Settings looking for "export" leaves knowing
                 where it is instead of using Back up as a substitute. -->
            <p class="setting-note">
              {{ transferNote }}
              <a
                class="doc-link"
                routerLink="/songs"
                data-testid="transfer-link"
                >{{ transferLink }}</a
              >
            </p>
          </div>
        </section>

        <section class="section">
          <h2 class="heading">{{ appHeading }}</h2>
          <div class="group">
            <div class="setting">
              <div class="head">
                <span class="label">{{ themeHeading }}</span>
              </div>
              <div
                class="choices"
                role="group"
                [attr.aria-label]="themeHeading"
              >
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
            </div>

            <!-- The dark page, linked to the theme. Beside Theme because that is
                 the only reason to come looking for it, and a checkbox rather
                 than a third theme button: it is a fact about the two, not a
                 fourth thing the app could be. It reaches every render on this
                 screen, never an export — device-local, because a stage and a
                 kitchen table are different rooms. -->
            <div class="setting">
              <div class="head">
                <span class="label">{{ songDarkLabel }}</span>
                <button
                  appButton
                  type="button"
                  class="help"
                  [isIconOnly]="true"
                  [appTooltip]="songDarkHelp"
                  appTooltipTrigger="help"
                  [attr.aria-label]="aboutSongDark"
                  data-testid="help-song-dark"
                >
                  <app-icon name="help" />
                </button>
              </div>
              <label class="check-row">
                <input
                  type="checkbox"
                  class="check"
                  [checked]="presenter.isSongDarkFollowingTheme()"
                  data-testid="song-dark-follows-theme"
                  (change)="onSongDarkFollowsTheme($event)"
                />
                <span class="check-label">{{ songDarkOnLabel }}</span>
              </label>
            </div>

            <!-- Language (Epic 11 ▸ i18n). At runtime a message is translated
                 once, on first encounter, so a language change cannot be
                 re-rendered into a running app: choosing one reloads, on the same
                 URL. The hint says so, because a control that reloads the app
                 without warning is a control that feels broken. -->
            <div class="setting">
              <div class="head">
                <span class="label" data-testid="language-heading">{{
                  languageHeading
                }}</span>
                <button
                  appButton
                  type="button"
                  class="help"
                  [isIconOnly]="true"
                  [appTooltip]="languageHelp"
                  appTooltipTrigger="help"
                  [attr.aria-label]="aboutLanguage"
                  data-testid="help-language"
                >
                  <app-icon name="help" />
                </button>
              </div>
              <div
                class="choices"
                role="group"
                [attr.aria-label]="languageHeading"
              >
                @for (option of languages; track option.value) {
                  <button
                    appButton
                    variant="ghost"
                    [class.is-active]="presenter.language() === option.value"
                    [attr.aria-pressed]="presenter.language() === option.value"
                    [attr.data-testid]="'language-' + option.value"
                    (click)="presenter.setLanguage(option.value)"
                  >
                    {{ option.label }}
                  </button>
                }
              </div>
            </div>

            <div class="setting">
              <div class="head">
                <span class="label">{{ splitSharedLabel }}</span>
                <button
                  appButton
                  type="button"
                  class="help"
                  [isIconOnly]="true"
                  [appTooltip]="splitSharedHelp"
                  appTooltipTrigger="help"
                  [attr.aria-label]="aboutSplitShared"
                  data-testid="help-split-shared"
                >
                  <app-icon name="help" />
                </button>
              </div>
              <!-- A checkbox, not a segmented pair: one fact that is either true
                   or false; "Linked / Not linked" would be two words for one
                   switch. -->
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

            <!-- The extra usage statistics. The always-on half asks for nothing
                 and so has no control here; this switch governs only what has to
                 be read off the device. The hint links to the docs page rather
                 than restating it — that page is the one place the fields are
                 listed, and it carries the same switch. -->
            <div class="setting">
              <div class="head">
                <span class="label">{{ statsLabel }}</span>
                <button
                  appButton
                  type="button"
                  class="help"
                  [isIconOnly]="true"
                  [appTooltip]="statsHelp"
                  appTooltipTrigger="help"
                  [attr.aria-label]="aboutStats"
                  data-testid="help-stats"
                >
                  <app-icon name="help" />
                </button>
              </div>
              <label
                class="check-row"
                [class.is-disabled]="presenter.isStatsRefusedByBrowser"
              >
                <input
                  type="checkbox"
                  class="check"
                  [checked]="
                    presenter.isStatsAllowed() &&
                    !presenter.isStatsRefusedByBrowser
                  "
                  [disabled]="presenter.isStatsRefusedByBrowser"
                  data-testid="stats"
                  (change)="onStats($event)"
                />
                <span class="check-label">{{ statsOnLabel }}</span>
              </label>
              @if (presenter.isStatsRefusedByBrowser) {
                <p class="hint">{{ statsRefused }}</p>
              }
              <div class="actions">
                <a
                  appButton
                  variant="secondary"
                  [href]="privacyUrl()"
                  target="_blank"
                  rel="noopener"
                  data-testid="stats-privacy"
                  >{{ statsPrivacyButton }}</a
                >
              </div>
            </div>
          </div>
        </section>

        <section class="section">
          <h2 class="heading">{{ renderHeading }}</h2>
          <!-- Global scope: the base of the cascade. The SAME component is mounted
             by songbooks (songbook scope) and the song editor (song scope).
             The section already pads, so the panel's own inset is switched off
             (see .render-panel below) — that inset is for the dialogs, where the
             panel owns the whole surface. -->
          <app-settings-panel
            class="render-panel"
            scope="global"
            [values]="presenter.globalValues()"
            (changed)="presenter.patchGlobal($event)"
          />
        </section>

        <!-- The library itself, and the only place it is listed in full: the
             pickers above offer the same families, but deleting one and reading
             what it is licensed under are page-sized questions, not row-sized
             ones. Adding is reachable from both (§4.10). -->
        <section class="section">
          <h2 class="heading">{{ fontLibraryLabel }}</h2>
          <p class="hint">{{ fontLibraryHelp }}</p>
          <app-font-list />
        </section>

        <!-- Last, and deliberately so: the way out of the app. Everything above
             changes how Achordeon behaves; this block only points elsewhere —
             the guides, the issue tracker, and which build you are looking at
             when you write one. -->
        <section class="section">
          <h2 class="heading">{{ aboutHeading }}</h2>
          <div class="group">
            <div class="setting">
              <div class="head">
                <span class="label">{{ docsLabel }}</span>
              </div>
              <p class="hint">{{ docsHelp }}</p>
              <div class="actions">
                <a
                  appButton
                  variant="secondary"
                  [href]="docsUrl()"
                  target="_blank"
                  rel="noopener"
                  data-testid="about-docs"
                  >{{ docsButton }}</a
                >

                <!-- Beside the guides rather than in a row of its own: both
                     buttons open the same site, and "what the app does" and
                     "what changed in it lately" are one question asked twice.
                     The other way in is the update bar, which is only there when
                     there is an update; this one is always. -->
                <a
                  appButton
                  variant="secondary"
                  [href]="patchNotesUrl()"
                  target="_blank"
                  rel="noopener"
                  data-testid="about-patch-notes"
                  >{{ patchNotesButton }}</a
                >
              </div>
            </div>

            <div class="setting">
              <div class="head">
                <span class="label">{{ bugLabel }}</span>
              </div>
              <p class="hint">
                {{ presenter.canReport ? bugHelp : bugHelpOffline }}
              </p>
              <div class="actions">
                <!-- The report is filed from here. The GitHub link survives as
                     the offline-only build's fallback: with no backend there is
                     nothing to post to, and a dead button would be worse than
                     the tab it replaced. -->
                @if (presenter.canReport) {
                  <button
                    appButton
                    type="button"
                    variant="secondary"
                    data-testid="about-report"
                    (click)="openFeedback()"
                  >
                    {{ bugButton }}
                  </button>
                } @else {
                  <a
                    appButton
                    variant="secondary"
                    [href]="issuesUrl"
                    target="_blank"
                    rel="noopener"
                    data-testid="about-issues"
                    >{{ bugButtonGithub }}</a
                  >
                }
              </div>
            </div>

            <!-- The one row here that opens something *inside* the app. It is in
                 About because that is where a user goes to find out what the app
                 can do, and a keymap nobody can find is a keymap nobody has: the
                 question mark only helps somebody who has already been told
                 about the question mark. The dialog itself is live — it lists
                 whatever is bound right now, which on this screen is the
                 anywhere layer. -->
            <div class="setting">
              <div class="head">
                <span class="label">{{ shortcutsLabel }}</span>
              </div>
              <p class="hint">{{ shortcutsHelp }}</p>
              <div class="actions">
                <button
                  appButton
                  type="button"
                  variant="secondary"
                  data-testid="about-shortcuts"
                  (click)="isShortcutsOpen.set(true)"
                >
                  {{ shortcutsButton }}
                </button>
              </div>
            </div>

            <!-- Dropped rather than shown empty: a build outside a git checkout
                 has no commit date, and an "unknown" version helps nobody. -->
            @if (buildDate !== null) {
              <div class="setting">
                <div class="head">
                  <span class="label">{{ versionLabel }}</span>
                </div>
                <p class="value" data-testid="about-version">{{ buildDate }}</p>
              </div>
            }
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

    @if (pendingRestore(); as pending) {
      <app-dialog
        [title]="restoreConfirmTitle"
        data-testid="restore-dialog"
        (closed)="cancelRestore()"
      >
        <p>{{ restoreMergeText }}</p>
        <p class="warn">{{ restoreReplaceText }}</p>
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
          variant="danger"
          data-testid="restore-replace"
          (click)="confirmRestore(pending, 'replace')"
        >
          {{ restoreReplaceButton }}
        </button>
        <button
          dialog-actions
          appButton
          type="button"
          variant="primary"
          data-testid="restore-merge"
          (click)="confirmRestore(pending, 'merge')"
        >
          {{ restoreMergeButton }}
        </button>
      </app-dialog>
    }

    @if (confirmDelete()) {
      <app-dialog
        [title]="deleteConfirmTitle"
        data-testid="delete-dialog"
        (closed)="confirmDelete.set(false)"
      >
        <p class="warn">{{ deleteConfirmText }}</p>
        <button
          dialog-actions
          appButton
          type="button"
          variant="ghost"
          data-testid="delete-cancel"
          (click)="confirmDelete.set(false)"
        >
          {{ cancelLabel }}
        </button>
        <button
          dialog-actions
          appButton
          type="button"
          variant="primary"
          class="danger-btn"
          [disabled]="presenter.deleting()"
          data-testid="delete-confirm"
          (click)="presenter.deleteAccount()"
        >
          {{ deleteConfirmButton }}
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

    @if (isShortcutsOpen()) {
      <app-shortcuts-dialog (closed)="isShortcutsOpen.set(false)" />
    }

    <!-- The report itself. The thank-you replaces it rather than stacking on it,
         because the form has served its purpose the moment the report lands. -->
    @if (isFeedbackOpen() && !presenter.feedbackSent()) {
      <app-feedback-dialog
        [isBusy]="presenter.feedbackBusy()"
        [error]="feedbackError()"
        [knownContact]="presenter.email()"
        (submitted)="sendFeedback($event)"
        (closed)="closeFeedback()"
      />
    }

    @if (presenter.feedbackSent()) {
      <app-dialog
        [title]="feedbackSentTitle"
        data-testid="feedback-sent-dialog"
        (closed)="closeFeedback()"
      >
        <p>{{ feedbackSentText }}</p>
        <button
          dialog-actions
          appButton
          type="button"
          variant="primary"
          data-testid="feedback-sent-close"
          (click)="closeFeedback()"
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

    /* Full width, so its scrollbar is at the page's right edge. Sunken, so the
       cards below sit ON something: the shell's chrome (rail, action bar) is
       already --surface-raised, so a raised card would have read as more chrome
       rather than as the page's content. */
    .body {
      flex: 1;
      min-block-size: 0;
      overflow: auto;
      background: var(--surface-sunken);
    }

    /* The readable column: centred and capped, so the settings sit in the
       middle of the page rather than hard against the left. 720px, not 640 —
       a card that goes two-up has to leave each control a usable half. */
    .content {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      padding: var(--space-4) var(--space-4) var(--space-7);
      max-inline-size: 720px;
      margin-inline: auto;
    }

    /* A section is a card: its own inset, its own edge, one step above the page.
       That inset is the thing the render panel already had and the hand-built
       sections did not, which is why the render rows sat indented from every
       other row on the page — the panel was padding itself inside a section that
       padded nothing. Now the section pads and the panel does not (--panel-inset
       below), so one gutter runs down the whole page.

       The container query asks the CARD how wide it is, exactly as the panel
       asks its own host: same 420px switch, so the two never disagree about
       when to go two-up. */
    .section {
      container-type: inline-size;
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      padding: var(--space-4);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      background: var(--surface);
    }

    /* A real heading, not a caption. It used to copy the render panel's
       .section-title — but that style belongs to the level BELOW (PAGE, TITLE,
       CHORDS), and wearing it at both levels left the page with no hierarchy at
       all: RENDERING and PAGE looked like siblings. */
    .heading {
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: var(--space-2);
      margin: 0;
      font-size: var(--text-md);
      font-weight: 500;
      color: var(--text);
    }

    /* An aside on the heading's own line — "these are not available yet" is
       about the whole card, so it says so once, up here. */
    .heading-note {
      font-size: var(--text-xs);
      font-weight: 400;
      font-style: italic;
      color: var(--text-faint);
    }

    /* Rows, two-up once the card is wide enough: the render panel's grid to the
       pixel, because the render section and the rest are one page. */
    .group {
      display: grid;
      grid-template-columns: 1fr;
      gap: var(--space-3);
    }

    @container (min-width: 420px) {
      .group {
        grid-template-columns: 1fr 1fr;
      }
    }

    /* A row that needs the whole card: two buttons plus a status line does not
       fit in half of one without breaking into a stack of one-word lines. */
    .is-wide {
      grid-column: 1 / -1;
    }

    /* Sync sits UNDER the account: separated by a rule, and titled the way the
       render panel titles its groups. */
    .subsection {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      padding-block-start: var(--space-3);
      border-block-start: 1px solid var(--border);
    }

    .subheading {
      margin: 0 0 var(--space-1);
      font-size: var(--text-xs);
      font-weight: 500;
      color: var(--text-faint);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    /* Who you are — the one thing the Account card exists to state, so it gets
       the line above the controls rather than being a paragraph among them. */
    .identity {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    .identity-who {
      display: flex;
      flex-direction: column;
      min-inline-size: 0;
    }

    .identity-caption {
      font-size: var(--text-xs);
      color: var(--text-faint);
    }

    .identity-email {
      font-size: var(--text-md);
      font-weight: 500;
      color: var(--text);
      /* An address has no spaces to break at, and a long one must not push the
         badge off the card. */
      overflow-wrap: anywhere;
    }

    /* The section pads; the panel must not pad again. */
    .render-panel {
      --panel-inset: 0;
    }

    /* What unlocks a disabled sync method (item 7). */
    .requirement {
      margin: 0;
      font-size: var(--text-xs);
      color: var(--text-muted);
    }

    /* A line of copy under a label, about the row it sits in. */
    .hint {
      margin: 0;
      font-size: var(--text-xs);
      color: var(--text-faint);
    }

    /* A read-only answer under a label (which sign-in methods are linked). */
    .value {
      margin: 0;
      font-size: var(--text-sm);
      color: var(--text);
    }

    /* How the last Drive push/pull ended, with its one follow-up action inline —
       the offer to overwrite is part of the sentence that raised the conflict. */
    .status {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--space-2);
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

    /* Equal shares, like the panel's choice rows: three ghost buttons of
       different word lengths otherwise read as three unrelated links. */
    .choices {
      display: flex;
      gap: var(--space-1);
      inline-size: 100%;
    }

    .choices > * {
      flex: 1;
    }

    /* A row's buttons. Wrap rather than overflow; the panel's gap. */
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      inline-size: 100%;
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

    /* Not working yet, and the card says so once in its heading (#1). The rows
       are NOT dimmed on top of that: their controls are already disabled, and
       0.6 over the button's own 0.45 left them at a quarter opacity — unreadable
       for something whose whole job is to show the shape of what is coming. */
    .is-coming .label {
      color: var(--text-muted);
    }

    .warn {
      margin: 0 0 var(--space-2);
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
      /* A grid item's floor is its content; without this a long label stretches
         the column instead of wrapping. */
      min-inline-size: 0;
      inline-size: 100%;
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

    /* The tier flag — always shown (item 1). Neutral for Free, gold for Pro,
       pushed to the card's far edge so the eye finds it in the same place
       whatever the address beside it is. */
    .tier-badge {
      margin-inline-start: auto;
      padding: 2px var(--space-2);
      border-radius: var(--radius-sm);
      background: var(--surface-sunken);
      border: 1px solid var(--border);
      color: var(--text-muted);
      font-size: var(--text-xs);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    /* --premium-glow is a box-shadow, not a colour: substituting it into
       background made the declaration invalid at computed-value time, so the
       Pro badge was white text on nothing — invisible. It is the gold itself
       that belongs here. */
    .tier-badge.is-pro {
      background: var(--premium);
      border-color: transparent;
      color: var(--premium-on);
    }

    /* A destructive action — coloured so "Delete account" reads apart from the
       neutral logout/cancel beside it. */
    .danger-btn {
      color: var(--danger);
    }

    .text-input {
      padding: var(--space-2);
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-md);
      background: var(--surface);
      color: var(--text);
      font: inherit;
      font-size: var(--text-sm);
    }

    /* The real control behind Restore. Not display:none, which makes it
       unfocusable and, in some engines, unclickable from script.

       Every part of the rule below is load-bearing against one bug: a scrollbar
       on <html>. The overflow and the clip-path contain the ~230×21 of native
       control a file input is whatever box you give it; the FIXED position is
       what keeps the box itself out of the document's scrollable area, since an
       absolute one with no positioned ancestor lands at its static position deep
       inside this scrolling page. Same rule, same reasons, in import-panel.ts. */
    .file {
      position: fixed;
      inset-block-start: 0;
      inset-inline-start: 0;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
      clip-path: inset(50%);
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
  protected readonly languageHeading = $localize`:@@settings.language:Language`;
  protected readonly languageHelp = $localize`:@@settings.language.help:Achordeon reloads to switch language, and stays on the page you are on.`;
  protected readonly aboutLanguage = $localize`:@@settings.language.about:About the language setting`;
  // The same words the stage and audience menus use for the thing this seeds —
  // one name for one feature, so nobody has to work out that they are the same.
  protected readonly songDarkLabel = $localize`:@@stage.darkPage:Dark page`;
  protected readonly songDarkOnLabel = $localize`:@@settings.songDark.on:Dark song in the dark theme`;
  protected readonly songDarkHelp = $localize`:@@settings.songDark.help:While the app is dark, every song it draws goes light-on-dark: performing, watching, and the previews in Songs and Songbooks. The moon in the performing bar overrides it for that one performance, and the one under the songbook pages for that book. Printing, PDFs and downloads stay on white paper, and nothing here reaches your audience — every screen answers for the room it is in.`;
  protected readonly aboutSongDark = $localize`:@@settings.songDark.about:About the dark page`;

  protected onSongDarkFollowsTheme(event: Event): void {
    this.presenter.setSongDarkFollowsTheme(
      (event.target as HTMLInputElement).checked,
    );
  }

  protected readonly renderHeading = $localize`:@@settings.rendering:Rendering`;
  protected readonly splitSharedLabel = $localize`:@@settings.splitShared:One panel size everywhere`;
  protected readonly splitSharedOnLabel = $localize`:@@settings.splitShared.on:Use one panel size everywhere`;
  protected readonly splitSharedHelp = $localize`:@@settings.splitShared.help:Off: each module remembers how you sized its panels.`;
  protected readonly aboutSplitShared = $localize`:@@settings.splitShared.about:About panel sizing`;

  protected onSplitShared(event: Event): void {
    this.presenter.setSplitShared((event.target as HTMLInputElement).checked);
  }
  protected readonly statsLabel = $localize`:@@settings.stats:Usage statistics`;
  protected readonly statsOnLabel = $localize`:@@settings.stats.on:Share anonymous usage statistics`;
  protected readonly statsHelp = $localize`:@@settings.stats.help:Off: which pages get opened is still counted, without anything read from this device.`;
  protected readonly aboutStats = $localize`:@@settings.stats.about:About usage statistics`;
  protected readonly statsRefused = $localize`:@@settings.stats.refused:Your browser asks sites not to track you, so this stays off.`;
  protected readonly statsPrivacyButton = $localize`:@@settings.stats.privacyButton:What is counted`;

  protected onStats(event: Event): void {
    this.presenter.setStatsAllowed((event.target as HTMLInputElement).checked);
  }
  protected readonly syncHeading = $localize`:@@settings.sync:Sync`;
  protected readonly autoSyncLabel = $localize`:@@settings.autoSync:Automatic sync`;
  protected readonly autoSyncOnLabel = $localize`:@@settings.autoSync.on:Sync automatically`;
  protected readonly autoSyncHelp = $localize`:@@settings.autoSync.help:Keep this library backed up to the cloud and pulled to your other devices.`;
  protected readonly aboutAutoSync = $localize`:@@settings.autoSync.about:About automatic sync`;
  protected readonly autoSyncReq = $localize`:@@settings.autoSync.requires:Available on a Premium account.`;
  protected readonly driveHeading = $localize`:@@settings.drive.heading:Google Drive backup`;
  protected readonly aboutDrive = $localize`:@@settings.drive.about:About Google Drive backup`;
  protected readonly driveReqLink = $localize`:@@settings.drive.requires:Add Google to your account to back up to Drive.`;
  protected readonly driveReqSignIn = $localize`:@@settings.drive.requiresSignIn:Sign in with Google to back up to Drive.`;

  protected onAutoSync(event: Event): void {
    void this.presenter.setAutoSync((event.target as HTMLInputElement).checked);
  }

  // --- Account & sync (Epic 10) ---------------------------------------------

  /** Which auth dialog is open (null = none). Login and register are forms in
   * their own dialogs so validation has room and the section stays a summary. */
  protected readonly authDialog = signal<AuthDialog>(null);

  /** The account-deletion confirm is open. A delete wipes this device's library
   * and soft-deletes the cloud profile, so it never fires straight off the button. */
  protected readonly confirmDelete = signal(false);

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
  protected readonly methodsLabel = $localize`:@@settings.account.methods:Sign-in methods`;
  protected readonly sessionHeading = $localize`:@@settings.account.session:This device`;
  protected readonly googleWord = $localize`:@@settings.account.googleWord:Google`;
  protected readonly passwordWord = $localize`:@@settings.account.passwordWord:Email & password`;
  protected readonly methodsNone = $localize`:@@settings.account.methodsNone:none`;

  // One sentence in the open; the tier/privacy detail is a paragraph, so it
  // lives in the docs (linked) rather than a cramped tooltip.
  protected readonly accountWhy = $localize`:@@settings.account.why:Sign in to keep your library synced across your devices.`;
  protected readonly learnMore = $localize`:@@settings.account.learnMore:Learn more`;
  /**
   * The three docs pages this screen links to, in the language the app is
   * showing. The base-href reasoning lives on `docsPageUrl` (localization.ts) —
   * it moved there when the update bar grew a link of its own and the derivation
   * stopped being this page's alone.
   */
  protected readonly docsUrl = computed(() =>
    docsPageUrl(this.presenter.language(), ''),
  );
  /** The statistics page. */
  protected readonly privacyUrl = computed(() =>
    docsPageUrl(this.presenter.language(), 'privacy'),
  );
  /** What changed, and when — the same page the update bar offers. */
  protected readonly patchNotesUrl = computed(() =>
    docsPageUrl(this.presenter.language(), 'patch-notes'),
  );
  protected readonly aboutGoogle = $localize`:@@settings.account.aboutGoogle:About signing in with Google`;

  // The About block: the only rows on this page that leave the app, plus which
  // build you are looking at when you write the bug report.
  protected readonly aboutHeading = $localize`:@@settings.about.heading:About`;
  protected readonly docsLabel = $localize`:@@settings.about.docs:Documentation`;
  protected readonly docsHelp = $localize`:@@settings.about.docsHelp:Guides for songs, songbooks and performing.`;
  protected readonly docsButton = $localize`:@@settings.about.docsButton:Open docs`;
  protected readonly patchNotesButton = $localize`:@@settings.about.patchNotesButton:Patch notes`;
  protected readonly bugLabel = $localize`:@@settings.about.bug:Found a bug?`;
  protected readonly bugHelp = $localize`:@@settings.about.bugHelp:Say what you did and what happened instead. It comes straight to me.`;
  protected readonly bugHelpOffline = $localize`:@@settings.about.bugHelpOffline:This build has no backend, so reports go to the tracker on GitHub.`;
  protected readonly bugButton = $localize`:@@settings.about.bugButton:Report a problem`;
  protected readonly bugButtonGithub = $localize`:@@settings.about.bugButtonGithub:Report on GitHub`;
  protected readonly shortcutsLabel = $localize`:@@settings.about.shortcuts:Keyboard shortcuts`;
  protected readonly shortcutsHelp = $localize`:@@settings.about.shortcutsHelp:The list is live and follows the screen you are on. Press ? — or g then h, which is the same key on every layout — anywhere you are not typing to open it there.`;
  protected readonly shortcutsButton = $localize`:@@settings.about.shortcutsButton:Show shortcuts`;
  /** The list, opened from the row above. It is a dialog like any other here. */
  protected readonly isShortcutsOpen = signal(false);
  protected readonly versionLabel = $localize`:@@settings.about.version:Version`;
  /** The issue tracker. Only reached by an offline-only build, which has no
   * endpoint to post to. The repo is the repo — not a deploy-time value. */
  protected readonly issuesUrl =
    'https://github.com/DcNiemandd/achordeon/issues';
  /** Commit date of this build, generated (apps/app/tools/gen-build-info.mjs). */
  protected readonly buildDate = BUILD_DATE;

  // --- The report dialog ----------------------------------------------------

  /** The form is open. Separate from the presenter's `feedbackSent`, which is
   * what replaces it: closing the thank-you has to clear both. */
  protected readonly isFeedbackOpen = signal(false);

  protected openFeedback(): void {
    this.presenter.dismissFeedback();
    this.isFeedbackOpen.set(true);
  }

  protected closeFeedback(): void {
    this.isFeedbackOpen.set(false);
    this.presenter.dismissFeedback();
  }

  /** Send, and close only on success — a refusal leaves the dialog standing with
   * the reporter's text still in it (see `SettingsPresenter.sendFeedback`). */
  protected async sendFeedback(draft: FeedbackDraft): Promise<void> {
    await this.presenter.sendFeedback(draft);
  }

  /**
   * The failure as a sentence, or null.
   *
   * The presenter hands back a code and this is where it becomes language —
   * `throttled` gets its own, because "you have sent a few already" is not an
   * apology and should not read like one.
   */
  protected readonly feedbackError = computed(() => {
    switch (this.presenter.feedbackFailure()) {
      case 'throttled':
        return this.feedbackThrottledError;
      case 'rejected':
        return this.feedbackRejectedError;
      case 'failed':
        return this.feedbackFailedError;
      default:
        return null;
    }
  });

  protected readonly feedbackSentTitle = $localize`:@@feedback.sentTitle:Thank you`;
  protected readonly feedbackSentText = $localize`:@@feedback.sentText:Your report arrived. If you left an email address, you may hear back about it.`;
  protected readonly feedbackThrottledError = $localize`:@@feedback.error.throttled:That is several reports in one hour. Give it a while, then send the rest.`;
  protected readonly feedbackRejectedError = $localize`:@@feedback.error.rejected:That could not be accepted — the report or its attachment may be too long.`;
  protected readonly feedbackFailedError = $localize`:@@feedback.error.failed:It could not be sent. Check your connection and try again.`;

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
  protected readonly linkGoogleLabel = $localize`:@@settings.account.linkGoogle:Add Google`;
  protected readonly deleteAccountLabel = $localize`:@@settings.account.delete:Delete account`;
  protected readonly deleteConfirmTitle = $localize`:@@settings.account.deleteTitle:Delete this account?`;
  protected readonly deleteConfirmText = $localize`:@@settings.account.deleteText:This clears the library on this device and marks your cloud account deleted. Your cloud data is kept — sign in again with the same account to restore it. Anything on this device that has not synced is lost.`;
  protected readonly deleteConfirmButton = $localize`:@@settings.account.deleteConfirm:Delete account`;
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
  protected readonly driveHelp = $localize`:@@settings.drive.help:Your backup, kept in your own Google Drive instead of a file you hold. The first upload asks Google for Drive permission. Uploading merges with the Drive copy, so it never drops another device's work; downloading asks whether to add to your library or replace it.`;
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

  /**
   * Each label is in **its own language**, not in the UI's — a Czech name for
   * Czech is the one label a user looking for Czech can find in an English UI. So
   * these two are deliberately not translated.
   */
  protected readonly languages = [
    { value: 'en' as const, label: 'English' },
    { value: 'cs' as const, label: 'Čeština' },
  ];

  // --- Stub settings (#1) — placeholders, disabled, not wired ---------------
  protected readonly fontLibraryLabel = $localize`:@@settings.fontLibrary:Font library`;
  protected readonly fontLibraryHelp = $localize`:@@settings.fontLibrary.help:The fonts this device can set a song in. A font you add stays on this device — an export names it, but never carries it.`;

  // --- Backup / restore (#11) -----------------------------------------------
  private readonly _pendingRestore = signal<PendingRestore | null>(null);
  /**
   * A backup waiting on the Add-or-Replace choice, and where it is coming from.
   *
   * **One dialog for both sources.** A backup file and the Google Drive copy are
   * the same backup kept in two places, so they raise the same question and get
   * the same answer — two dialogs saying the same thing differently is how a user
   * comes to believe they are two different features.
   */
  protected readonly pendingRestore = this._pendingRestore.asReadonly();

  /** Open the choice for a backup that is ready to go in. */
  protected askRestore(pending: PendingRestore): void {
    this._pendingRestore.set(pending);
  }

  protected readonly backupHeading = $localize`:@@settings.backup:Manual backup`;
  protected readonly aboutBackup = $localize`:@@settings.backup.about:About backup`;
  protected readonly backupHelp = $localize`:@@settings.backup.help:Save your whole library to a file, or bring one back in — either added beside what you have, or replacing it. This is the entire database, different from exporting a few songs.`;
  protected readonly backupButton = $localize`:@@settings.backup.save:Back up to a file`;
  protected readonly restoreButton = $localize`:@@settings.backup.restore:Restore from a file`;
  protected readonly transferNote = $localize`:@@settings.transfer.note:Sending a few songs to someone else is a different job — export and import live with the songs.`;
  protected readonly transferLink = $localize`:@@settings.transfer.link:Go to Songs`;
  /**
   * The dialog asks which of the two acts a backup file is here to do, because
   * only the person holding the file knows. Both are described before either can
   * be pressed — the destructive one is not a footnote under a default.
   */
  protected readonly restoreConfirmTitle = $localize`:@@settings.restore.title:What should this backup do?`;
  protected readonly restoreMergeText = $localize`:@@settings.restore.mergeText:Add brings the backup's songs and songbooks in beside yours, keeping the newer copy of anything you have both. Your settings stay as they are.`;
  protected readonly restoreReplaceText = $localize`:@@settings.restore.replaceText:Replace puts the library back exactly as the backup has it. Anything not in the backup is lost, your settings included.`;
  protected readonly restoreMergeButton = $localize`:@@settings.restore.merge:Add to my library`;
  protected readonly restoreReplaceButton = $localize`:@@settings.restore.replace:Replace everything`;
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
    if (file) this.askRestore({ source: 'file', file });
  }

  protected cancelRestore(): void {
    this._pendingRestore.set(null);
  }

  protected confirmRestore(pending: PendingRestore, mode: RestoreMode): void {
    this._pendingRestore.set(null);
    if (pending.source === 'drive') {
      void this.presenter.driveDownload(mode);
      return;
    }
    void this.presenter.restore(pending.file, mode);
  }
}
