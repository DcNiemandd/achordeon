import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import {
  SUPABASE_CONFIG,
  provideAchordeonData,
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
    // Fills an empty library with the starter set, but only when the URL says
    // `?seed`. A no-op otherwise.
    provideSeedOnDemand(),
    // Audience/lobby backend (ADR-0003). `null`/empty url → offline-only build.
    { provide: SUPABASE_CONFIG, useValue: SUPABASE?.url ? SUPABASE : null },
  ],
};
