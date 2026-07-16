import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideZonelessChangeDetection } from '@angular/core';
import { App } from './app';
import { appRoutes } from './app.routes';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideZonelessChangeDetection(), provideRouter(appRoutes)],
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
