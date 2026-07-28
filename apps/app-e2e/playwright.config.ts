import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { workspaceRoot } from '@nx/devkit';

// For CI, you may want to set BASE_URL to the deployed application.
// The trailing path is the app's baseHref (project.json) — the app is served
// under /app/ (the docs site owns the root), so a bare origin would make every
// navigation miss. The trailing slash matters: without it, URL resolution drops
// the last segment. Specs must use RELATIVE paths (`goto('songs')`) — a leading
// slash resolves from the origin and throws the base path away.
const baseURL = process.env['BASE_URL'] || 'http://localhost:4200/app/';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  ...nxE2EPreset(__filename, { testDir: './src' }),
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    baseURL,
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    // Every test starts with seeding OFF, so a fresh browser context means a
    // genuinely empty library — the state the specs were written against, and the
    // one the app's own "No songs yet" screen is about. Set here rather than in each
    // file's `freshLibrary()` because most specs never clear the database at all:
    // they rely on a fresh context being empty, and would quietly gain a song.
    //
    // The two tests that DO want content ask for it: `?seed` for the demo set
    // (clearing this flag as it goes), or clearing the key by hand for the
    // first-run guide song.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: new URL(baseURL).origin,
          localStorage: [{ name: 'achordeon.seed', value: 'off' }],
        },
      ],
    },
  },
  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'pnpm exec nx run app:serve',
    url: 'http://localhost:4200',
    reuseExistingServer: true,
    cwd: workspaceRoot,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    // Uncomment for mobile browsers support
    /* {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    }, */

    // Uncomment for branded browsers
    /* {
      name: 'Microsoft Edge',
      use: { ...devices['Desktop Edge'], channel: 'msedge' },
    },
    {
      name: 'Google Chrome',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    } */
  ],
});
