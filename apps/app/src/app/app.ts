import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
} from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import {
  AuthService,
  BootGate,
  SettingsStore,
  SyncService,
} from '@achordeon/shared/data-access';
import {
  AppUpdate,
  Localization,
  Shell,
  Stats,
  ThemeApplier,
  TierGuard,
  UiStore,
  UpdateNotice,
  WarnUnsynced,
} from './shared/layout';

/**
 * The root: mount the shell and connect the cross-cutting services to the stores.
 *
 * This is a shell file, not a component under the presenter rule — wiring the
 * app's stores to the frame is exactly its job (PRD-UI-SHELL.md §3). Everything
 * here follows the same shape: the service in `app/shared` takes a plain accessor
 * so it can stay under the import ladder, and this is where it meets the real one.
 */
@Component({
  selector: 'app-root',
  imports: [Shell, UpdateNotice],
  template: `<app-shell /> <app-update-notice />`,
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
    const settings = inject(SettingsStore);

    // The theme, and the language the running bundle was built for (Epic 11):
    // both are preferences the rest of the app reads off SettingsStore, and
    // neither can be recovered from IndexedDB early enough to be read
    // synchronously — so the store is seeded from where they actually live. The
    // theme's home is ThemeApplier's pre-paint cache; the language's is the URL,
    // one sub-path per locale.
    const localization = inject(Localization);
    const themes = inject(ThemeApplier);
    settings.hydrate({
      theme: themes.cached() ?? undefined,
      language: localization.current,
    });
    themes.connect(() => settings.theme());

    // And, for whoever asked for it, the song page follows the theme it is being
    // read in (Settings ▸ Application ▸ Dark page). The applier resolves
    // `system` against the OS; the shell's store decides whether that answer is
    // allowed to reach the paper.
    inject(UiStore).connectTheme(() => themes.isDark());

    // The unsynced-leave guard (ADR-0004).
    const sync = inject(SyncService);
    inject(WarnUnsynced).connect(() => sync.hasUnsynced());

    // Which controls wear the Premium marker (PRD-INFRASTRUCTURE.md §10).
    const auth = inject(AuthService);
    inject(TierGuard).connect(() => auth.isPro());

    // Which routes get used (docs/privacy.mdx). `NavigationEnd` and not the
    // router's own start event, so a guard that redirects counts where the reader
    // landed rather than where they aimed; `urlAfterRedirects` for the same
    // reason. One bundle serves every language, so the URL carries no locale and
    // a path is the same row whichever language rendered it.
    const stats = inject(Stats);
    inject(Router)
      .events.pipe(
        filter(
          (event): event is NavigationEnd => event instanceof NavigationEnd,
        ),
        takeUntilDestroyed(),
      )
      .subscribe((event) => stats.count(event.urlAfterRedirects));

    // ADR-0007's refuse path, delivered: local data written by a newer breaking
    // build cannot be read here, so the update stops being optional. The gateway
    // has already run (an app initializer), so this fires on the first tick.
    const boot = inject(BootGate);
    const update = inject(AppUpdate);
    effect(() => {
      if (boot.mustUpdate()) update.requireUpdate();
    });
  }
}
