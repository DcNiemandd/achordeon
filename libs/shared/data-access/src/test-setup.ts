import { setupZonelessTestEnv } from 'jest-preset-angular/setup-env/zoneless';

setupZonelessTestEnv({
  errorOnUnknownElements: true,
  errorOnUnknownProperties: true,
});

// jsdom's global lacks `structuredClone`, which fake-indexeddb uses to clone
// stored values. Our persisted records are JSON-safe, so a JSON round-trip is a
// sufficient test-only shim (production runs in a browser that has the real one).
if (typeof globalThis.structuredClone === 'undefined') {
  globalThis.structuredClone = (value) => JSON.parse(JSON.stringify(value));
}
