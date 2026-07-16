import { Route } from '@angular/router';
import type { ShellRouteData } from './shared/layout';

/**
 * Lazy feature routes, one per nav module (PRD-INFRASTRUCTURE.md §10).
 *
 * `data.chrome: 'none'` strips the shell frame — a performer mid-song sees the
 * song and nothing else, and the Audience deep-link is the same
 * (PRD-UI-SHELL.md §4). Declaring it here means the shell never needs to know
 * which routes those are.
 *
 * The full route table (`/songs/:id/edit`, `/songbooks/:id`,
 * `/stage/:songbookId`, `/audience/:pin`) lands with the features that own it;
 * Epic 13 wires only the module roots the frame needs.
 */
export const appRoutes: Route[] = [
  { path: '', pathMatch: 'full', redirectTo: 'songs' },
  {
    path: 'songs',
    loadComponent: () => import('./songs/songs.page').then((m) => m.SongsPage),
  },
  {
    path: 'songbooks',
    loadComponent: () =>
      import('./songbooks/songbooks.page').then((m) => m.SongbooksPage),
  },
  {
    path: 'stage',
    loadComponent: () => import('./stage/stage.page').then((m) => m.StagePage),
  },
  {
    path: 'audience',
    loadComponent: () =>
      import('./audience/audience.page').then((m) => m.AudiencePage),
    data: { chrome: 'none' } satisfies ShellRouteData,
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./settings/settings.page').then((m) => m.SettingsPage),
  },
  { path: '**', redirectTo: 'songs' },
];
