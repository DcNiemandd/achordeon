import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { appRoutes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    // Route params and query params arrive as signal `input()`s on the routed
    // component (PRD-UI-SHELL.md §7) — no ActivatedRoute juggling, no RxJS.
    provideRouter(appRoutes, withComponentInputBinding()),
  ],
};
