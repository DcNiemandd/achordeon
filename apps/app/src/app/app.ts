import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SettingsStore } from '@achordeon/shared/data-access';
import { Shell, ThemeApplier } from './shared/layout';

/**
 * The root: mount the shell and connect the theme.
 *
 * This is a shell file, not a component under the presenter rule — wiring the
 * app's stores to the frame is exactly its job (PRD-UI-SHELL.md §3).
 */
@Component({
  selector: 'app-root',
  imports: [Shell],
  template: `<app-shell />`,
  styles: `
    :host {
      display: block;
      block-size: 100%;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  constructor() {
    // ThemeApplier takes an accessor rather than injecting the store, so it can
    // live in app/shared under the import ladder. This is where the two meet.
    const settings = inject(SettingsStore);
    inject(ThemeApplier).connect(() => settings.theme());
  }
}
