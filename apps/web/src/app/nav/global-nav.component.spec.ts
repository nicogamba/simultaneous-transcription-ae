import { TestBed } from '@angular/core/testing';
import { provideRouter, Routes } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { GlobalNavComponent } from './global-nav.component';

const routes: Routes = [
  { path: 'admin/broadcast', component: GlobalNavComponent },
  { path: 'stage/:id', component: GlobalNavComponent },
  { path: 'overlay/stage/:id', component: GlobalNavComponent },
];

describe('GlobalNavComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes)],
    });
  });

  it('renders the nav bar with the three links on non-overlay routes', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/stage/demo', GlobalNavComponent);

    const host = harness.routeNativeElement as HTMLElement;
    const nav = host.querySelector('.global-nav');
    expect(nav).not.toBeNull();

    const links = Array.from(host.querySelectorAll('.link')).map(
      (el) => (el as HTMLAnchorElement).getAttribute('href'),
    );
    expect(links).toEqual([
      '/admin/broadcast',
      '/stage/demo',
      '/overlay/stage/demo',
    ]);
  });

  it('renders the nav bar on the admin route as well', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/admin/broadcast', GlobalNavComponent);

    const host = harness.routeNativeElement as HTMLElement;
    expect(host.querySelector('.global-nav')).not.toBeNull();
  });

  it('hides the nav bar completely on overlay routes', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/overlay/stage/demo', GlobalNavComponent);

    const host = harness.routeNativeElement as HTMLElement;
    expect(host.querySelector('.global-nav')).toBeNull();
  });
});