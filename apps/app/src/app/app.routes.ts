import { Route } from '@angular/router';

/**
 * Lazy feature routes, one per nav module (PRD-INFRASTRUCTURE.md §10).
 *
 * **Every route gets the shell frame.** Performing without chrome is a runtime
 * mode (`Fullscreen`), not a property of a route — the bars come back on the next
 * pointer move, wherever you are. An earlier draft carried a `data.chrome: 'none'`
 * flag here; it could not express "hidden right now, back on the next tap", which
 * is the actual requirement.
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
    path: 'songs/:id/edit',
    loadComponent: () =>
      import('./songs/song-editor.page').then((m) => m.SongEditorPage),
  },
  {
    path: 'songbooks',
    loadComponent: () =>
      import('./songbooks/songbooks.page').then((m) => m.SongbooksPage),
  },
  {
    path: 'songbooks/:id',
    loadComponent: () =>
      import('./songbooks/songbook-detail.page').then(
        (m) => m.SongbookDetailPage,
      ),
  },
  {
    path: 'stage',
    loadComponent: () => import('./stage/stage.page').then((m) => m.StagePage),
  },
  {
    path: 'audience',
    loadComponent: () =>
      import('./audience/audience.page').then((m) => m.AudiencePage),
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./settings/settings.page').then((m) => m.SettingsPage),
  },
  { path: '**', redirectTo: 'songs' },
];
