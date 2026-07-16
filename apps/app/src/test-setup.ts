import '@angular/localize/init';
import { setupZonelessTestEnv } from 'jest-preset-angular/setup-env/zoneless';

setupZonelessTestEnv({
  errorOnUnknownElements: true,
  errorOnUnknownProperties: true,
});

/**
 * jsdom implements no `matchMedia`, so anything that asks the viewport a
 * question would throw. This is a controllable stub, not a silencer: tests drive
 * it with `setViewportWidth()` below.
 */
let viewportWidth = 1400;
const listeners = new Set<(e: MediaQueryListEvent) => void>();

function matches(query: string): boolean {
  const max = /max-width:\s*([\d.]+)px/.exec(query);
  if (max) {
    return viewportWidth <= Number.parseFloat(max[1]);
  }
  const min = /min-width:\s*([\d.]+)px/.exec(query);
  return min ? viewportWidth >= Number.parseFloat(min[1]) : false;
}

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    get matches() {
      return matches(query);
    },
    media: query,
    onchange: null,
    addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => {
      listeners.add(cb);
    },
    removeEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => {
      listeners.delete(cb);
    },
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

/** Resize the fake viewport and notify anything listening. */
export function setViewportWidth(width: number): void {
  viewportWidth = width;
  for (const cb of listeners) {
    cb({ matches: matches(`(max-width: 1199.98px)`) } as MediaQueryListEvent);
  }
}
