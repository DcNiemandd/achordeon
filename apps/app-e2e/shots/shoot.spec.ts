// The runner — one test per (shot × locale × theme), each writing its PNG.
//
// It is a Playwright spec so it inherits the workspace's dev-server auto-start
// and browser management for free, but it is not a test suite: the "assertion"
// is that the file was produced. Run it with the `shots` target, never `e2e`.

import { expect, test, type Page } from '@playwright/test';
import { SHOTS, isView } from './manifest';
import {
  DEFAULT_SCALE,
  DEFAULT_VIEWPORT,
  contextFor,
  isBackendUp,
  outputPath,
  paddedClip,
  saveDownload,
  seededGoto,
  settle,
  type Locale,
  type Theme,
  type Viewport,
} from './harness';

for (const shot of SHOTS) {
  const locales: readonly Locale[] = shot.locales ?? ['en', 'cs'];
  const themes: readonly Theme[] = shot.themes ?? ['light', 'dark'];

  for (const locale of locales) {
    for (const theme of themes) {
      test(`${shot.name} [${locale}/${theme}]`, async ({
        browser,
        baseURL,
      }) => {
        expect(baseURL, 'baseURL must be configured').toBeTruthy();
        // Skipped, not failed: a lobby needs a Supabase the workspace does not
        // start for it, so a run without one should still write every other
        // picture rather than going red on the four it cannot take.
        if (shot.needs === 'backend') {
          test.skip(
            !(await isBackendUp()),
            'no Supabase reachable - a lobby shot needs one',
          );
        }

        const open = (viewport?: Viewport) =>
          contextFor(
            browser,
            locale,
            theme,
            viewport ?? shot.viewport ?? DEFAULT_VIEWPORT,
            shot.deviceScaleFactor ?? DEFAULT_SCALE,
            baseURL as string,
          );
        const page = await open();

        // The other devices in the picture. A lobby is two machines by
        // definition - a shot of a viewer following along is only true if
        // something is really performing at the other end - so a peer gets a
        // context of its own rather than a second tab sharing this one's
        // storage. Seeded on open, because a peer is usually the host.
        const peers: Page[] = [];
        const openPeer = async (route: string, viewport?: Viewport) => {
          const peer = await open(viewport);
          peers.push(peer);
          await seededGoto(peer, route);
          return peer;
        };

        try {
          await shot.arrange(page, { open: openPeer });
          const dest = outputPath(shot.name, locale, theme);

          if (isView(shot)) {
            await page
              .locator(shot.ready)
              .first()
              .waitFor({ state: 'visible' });
            await settle(page);

            // A clipped shot screenshots the PAGE through a box, not the
            // element: an element screenshot is the element and nothing else,
            // and a subject cropped to its own edges loses what it sits in
            // (`paddedClip`).
            const { clip, pad } = shot.capture;
            await page.screenshot({
              path: dest,
              ...(clip ? { clip: await paddedClip(page, clip, pad) } : {}),
            });
          } else {
            const waiting = page.waitForEvent('download', { timeout: 60_000 });
            await shot.capture.act(page);
            await saveDownload(await waiting, dest);
          }
        } finally {
          for (const peer of peers) await peer.context().close();
          await page.context().close();
        }
      });
    }
  }
}
