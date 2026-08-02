// The "send app data" payload.
//
// Everything here answers one question a bug report cannot answer for itself:
// *which* Achordeon was this, on *what*. A build date and a commit, the browser,
// the language, the size of the window, and whether it was running as an installed
// app or a tab — the handful of facts that turn "the chords wrap wrong" into a
// reproduction.
//
// What is NOT here is the point of the file. No account, no email, no library, no
// song text (that is the dialog's own separate checkbox, on the reporter's own
// separate tick). Nothing is read that the page has not already been handed by the
// browser, and nothing is collected unless a box was ticked — which is why this is
// a plain function over `window` rather than a service that could acquire state
// and start remembering things between reports.

import { BUILD_COMMIT, BUILD_DATE } from '../build-info';

/**
 * A snapshot of the running app, for the report to carry.
 *
 * Every field is optional-by-omission: a browser that does not answer a question
 * simply leaves it out, because a payload full of `"unknown"` reads like data and
 * is not.
 */
export function collectDiagnostics(): Record<string, unknown> {
  return {
    build: { date: BUILD_DATE, commit: BUILD_COMMIT },
    ...(typeof document === 'undefined'
      ? {}
      : { locale: document.documentElement.lang || null }),
    ...(typeof location === 'undefined'
      ? {}
      : // The route, not the address: the origin is known, the hash is unused.
        { path: `${location.pathname}${location.search}` }),
    ...(typeof navigator === 'undefined'
      ? {}
      : { userAgent: navigator.userAgent, online: navigator.onLine }),
    ...(typeof window === 'undefined'
      ? {}
      : {
          viewport: `${window.innerWidth}×${window.innerHeight}`,
          pixelRatio: window.devicePixelRatio,
          display: isInstalled() ? 'installed' : 'browser',
        }),
  };
}

/**
 * Whether this is the installed PWA rather than a tab.
 *
 * Worth a line of its own because the two run different code paths — the service
 * worker serves the installed app, so a stale-cache bug can only ever be reported
 * from one of them, and "it works in my browser" is exactly the reply that wastes
 * an afternoon.
 */
function isInstalled(): boolean {
  try {
    return window.matchMedia('(display-mode: standalone)').matches;
  } catch {
    return false;
  }
}
