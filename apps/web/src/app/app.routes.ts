import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  { path: '', redirectTo: '/stage/demo', pathMatch: 'full' },
  {
    path: 'admin/broadcast',
    loadComponent: () =>
      import('./broadcast/admin-broadcast.component').then(
        (m) => m.AdminBroadcastComponent,
      ),
  },
  {
    path: 'stage/:id',
    loadComponent: () =>
      import('./stage/stage-subtitles.component').then(
        (m) => m.StageSubtitlesComponent,
      ),
  },
  {
    path: 'overlay/stage/:id',
    loadComponent: () =>
      import('./overlay/obs-overlay.component').then(
        (m) => m.ObsOverlayComponent,
      ),
  },
  { path: '**', redirectTo: '/stage/demo' },
];