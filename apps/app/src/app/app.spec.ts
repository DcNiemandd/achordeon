import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideServiceWorker } from '@angular/service-worker';
import { provideAchordeonData } from '@achordeon/shared/data-access';
import { App } from './app';
import { appRoutes } from './app.routes';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter(appRoutes),
        // The import host mounted here reaches `ImportService`, which re-derives
        // a song's cache from the parser — so the theory port has to be bound.
        ...provideAchordeonData(),
        // Disabled, but present: `AppUpdate` injects `SwUpdate`, which only has a
        // provider once the worker is provided at all. Every signal it exposes
        // stays false, which is exactly the no-service-worker case.
        provideServiceWorker('ngsw-worker.js', { enabled: false }),
      ],
    }).compileComponents();
  });

  it('mounts the shell', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const shell = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="shell"]',
    );

    expect(shell).not.toBeNull();
  });

  it('applies the theme to the document element', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    // 'system' is the default, and it must leave the attribute OFF: the token
    // sheet's bare :root already means "follow prefers-color-scheme", so a
    // [data-theme] would override the very thing the user asked for.
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});
