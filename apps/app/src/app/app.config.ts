import {
  ApplicationConfig,
  isDevMode,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import {
  SUPABASE_CONFIG,
  provideAchordeonBoot,
  provideAchordeonData,
  provideAchordeonSync,
  provideSeedOnDemand,
} from '@achordeon/shared/data-access';
import { appRoutes } from './app.routes';
import { SUPABASE } from './supabase.config';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    // Route params and query params arrive as signal `input()`s on the routed
    // component (PRD-UI-SHELL.md §7) — no ActivatedRoute juggling, no RxJS.
    provideRouter(appRoutes, withComponentInputBinding()),
    // Binds the domain's ports to their adapters (ADR-0008).
    provideAchordeonData(),
    // The ADR-0007 ingest gateway over the local database, before any store reads
    // a row. Must come before the seeder and sync for the same reason.
    provideAchordeonBoot(),
    // Fills an empty library with the starter set, but only when the URL says
    // `?seed`. A no-op otherwise.
    provideSeedOnDemand(),
    // Audience/lobby backend (ADR-0003). `null`/empty url → offline-only build.
    { provide: SUPABASE_CONFIG, useValue: SUPABASE?.url ? SUPABASE : null },
    // Account + cloud sync (Epic 10). No-op without a backend or a session.
    provideAchordeonSync(),
    // The offline half of the PWA (PRD-INFRASTRUCTURE.md §11, D5). Registered by
    // hand rather than by `ng add @angular/pwa`, whose schematic does not fit an
    // Nx layout: the dep, this provider, `ngsw-config.json` and the build target's
    // `serviceWorker` option are all four steps there are.
    //
    // Enabled only where a worker was actually built — `ngsw-worker.js` ships with
    // the production configuration, and registering a missing script in dev would
    // be a 404 on every boot. Registration waits for stability so the first paint
    // never competes with the precache for bandwidth.
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
