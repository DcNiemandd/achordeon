// Settings page — Epic 13 (frame + the Global settings-panel mount)
// Spec: PRD-UI-SHELL.md §4
//
// Epic 13 lands the FRAME and the panel's first home. Profile, sync and language
// are Epic 12 — it mounts THIS panel, it does not build another.

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Button, Premium } from '../primitives';
import { ActionBar } from '../shared/layout';
import { SettingsPanel } from '../shared/settings-panel';
import { SettingsPresenter } from './settings.presenter';

@Component({
  selector: 'app-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SettingsPresenter],
  imports: [ActionBar, SettingsPanel, Button, Premium],
  template: `
    <app-action-bar [title]="title" />

    <div class="body">
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
        <h2 class="heading">{{ renderHeading }}</h2>
        <!-- Global scope: the base of the cascade. The SAME component is mounted
             by songbooks (songbook scope) and the song editor (song scope). -->
        <app-settings-panel
          scope="global"
          [values]="presenter.globalValues()"
          (changed)="presenter.patchGlobal($event)"
        />
      </section>

      <section class="section">
        <h2 class="heading">{{ syncHeading }}</h2>
        <!-- Decoration over a WORKING control, never a disabled one: tierGuard is
             highlight-and-tooltip during testing, not a hard block. -->
        <app-premium [label]="autoSyncLabel">
          <button appButton variant="secondary" data-testid="auto-sync">
            {{ autoSyncLabel }}
          </button>
        </app-premium>
      </section>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      block-size: 100%;
    }

    .body {
      display: flex;
      flex-direction: column;
      gap: var(--space-6);
      padding: var(--space-4);
      overflow: auto;
      max-inline-size: 640px;
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
  `,
})
export class SettingsPage {
  protected readonly presenter = inject(SettingsPresenter);

  protected readonly title = $localize`:@@settings.title:Settings`;
  protected readonly appHeading = $localize`:@@settings.app:Application`;
  protected readonly themeHeading = $localize`:@@settings.theme:Theme`;
  protected readonly renderHeading = $localize`:@@settings.rendering:Rendering`;
  protected readonly syncHeading = $localize`:@@settings.sync:Sync`;
  protected readonly autoSyncLabel = $localize`:@@settings.autoSync:Automatic sync`;

  protected readonly themes = [
    { value: 'system' as const, label: $localize`:@@theme.system:System` },
    { value: 'light' as const, label: $localize`:@@theme.light:Light` },
    { value: 'dark' as const, label: $localize`:@@theme.dark:Dark` },
  ];
}
