import { defineConfig, devices } from '@playwright/test';
import { workspaceRoot } from '@nx/devkit';

// The screenshot harness. Kept apart from `playwright.config.ts` on purpose: it
// runs one browser (docs images do not need a cross-engine matrix), it must not
// fail `nx e2e`, and it writes files rather than asserting. Each shot builds its
// own context (language, theme, density), so there is no shared `storageState`
// or default viewport here — see `shots/harness.ts`.
//
// Same base path and dev-server auto-start as the e2e config: the app is served
// under /app/, so shot routes are RELATIVE (`goto('songs')`).
const baseURL = process.env['BASE_URL'] || 'http://localhost:4200/app/';

export default defineConfig({
  testDir: './shots',
  testMatch: '**/*.spec.ts',
  // Spelled out, because Playwright's default is `test-results` under the
  // nearest package.json — and this project has none, so the fallback walks up
  // to the workspace root and litters it. Under `dist` it is ignored already,
  // beside the e2e suite's own output (`nxE2EPreset` in `playwright.config.ts`).
  outputDir: '../../dist/.playwright/apps/app-e2e/shots-output',
  // Shots seed a real library and render songs; give each room and do not retry.
  timeout: 120_000,
  retries: 0,
  // One context per shot, run a few at a time; the dev server is the bottleneck.
  workers: 4,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL,
    // The shots run on a PUBLIC origin (`DOCS_ORIGIN`, so a lobby's join link
    // and QR read as the real address) while the app's Supabase stays on
    // `127.0.0.1`. Chrome's Local Network Access refuses a public page a socket
    // to a local one, which killed Realtime: REST still answered, so a viewer
    // rendered, but presence never synced and the lobby pictured itself with an
    // audience of nobody. These flags stand the check down for the shot browser.
    // Nothing about the app changes — only what this browser is willing to dial.
    launchOptions: {
      args: [
        '--disable-features=BlockInsecurePrivateNetworkRequests,LocalNetworkAccessChecks,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults',
        '--allow-running-insecure-content',
      ],
    },
  },
  webServer: {
    command: 'pnpm exec nx run app:serve',
    url: 'http://localhost:4200',
    reuseExistingServer: true,
    cwd: workspaceRoot,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
