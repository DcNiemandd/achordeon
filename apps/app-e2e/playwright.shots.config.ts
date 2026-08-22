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
  // Shots seed a real library and render songs; give each room and do not retry.
  timeout: 120_000,
  retries: 0,
  // One context per shot, run a few at a time; the dev server is the bottleneck.
  workers: 4,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL },
  webServer: {
    command: 'pnpm exec nx run app:serve',
    url: 'http://localhost:4200',
    reuseExistingServer: true,
    cwd: workspaceRoot,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
