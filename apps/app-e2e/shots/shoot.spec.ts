// The runner — one test per (shot × locale), each writing its PNG.
//
// It is a Playwright spec so it inherits the workspace's dev-server auto-start
// and browser management for free, but it is not a test suite: the "assertion"
// is that the file was produced. Run it with the `shots` target, never `e2e`.

import { expect, test } from '@playwright/test';
import { SHOTS, isView } from './manifest';
import {
  DEFAULT_SCALE,
  DEFAULT_VIEWPORT,
  contextFor,
  outputPath,
  paddedClip,
  saveDownload,
  settle,
  type Locale,
} from './harness';

for (const shot of SHOTS) {
  const locales: readonly Locale[] = shot.locales ?? ['en', 'cs'];

  for (const locale of locales) {
    test(`${shot.name} [${locale}]`, async ({ browser, baseURL }) => {
      expect(baseURL, 'baseURL must be configured').toBeTruthy();

      const page = await contextFor(
        browser,
        locale,
        shot.viewport ?? DEFAULT_VIEWPORT,
        shot.deviceScaleFactor ?? DEFAULT_SCALE,
        baseURL as string,
      );

      try {
        await shot.arrange(page);
        const dest = outputPath(shot.name, locale);

        if (isView(shot)) {
          await page.locator(shot.ready).first().waitFor({ state: 'visible' });
          await settle(page);

          // A clipped shot screenshots the PAGE through a box, not the element:
          // an element screenshot is the element and nothing else, and a subject
          // cropped to its own edges loses what it sits in (`paddedClip`).
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
        await page.context().close();
      }
    });
  }
}
