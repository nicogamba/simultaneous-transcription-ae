import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  { path: '', redirectTo: '/stage/demo', pathMatch: 'full' },
  {
    path: 'admin/broadcast',
    loadComponent: () =>
      import('./broadcast/broadcast.component').then(
        (m) => m.BroadcastComponent,
      ),
  },
  {
    path: 'stage/:id',
    loadComponent: () =>
      import('./stage/stage.component').then((m) => m.StageComponent),
  },
  {
    path: 'overlay/stage/:id',
    loadComponent: () =>
      import('./overlay/overlay.component').then((m) => m.OverlayComponent),
  },
  { path: '**', redirectTo: '/stage/demo' },
];