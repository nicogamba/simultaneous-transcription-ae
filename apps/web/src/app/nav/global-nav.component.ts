import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, map } from 'rxjs';

@Component({
  selector: 'app-global-nav',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './global-nav.component.html',
  styleUrl: './global-nav.component.scss',
})
export class GlobalNavComponent {
  private readonly router = inject(Router);

  protected readonly hidden = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this.isOverlayRoute()),
    ),
    { initialValue: this.isOverlayRoute() },
  );

  private isOverlayRoute(): boolean {
    return this.router.url.includes('/overlay');
  }
}