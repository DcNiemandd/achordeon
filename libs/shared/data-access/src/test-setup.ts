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

// jsdom's crypto lacks randomUUID (used for the device id). A counter-backed shim
// keeps ids unique within a test run; production uses the real browser crypto.
if (typeof globalThis.crypto?.randomUUID !== 'function') {
  let seq = 0;
  const cryptoObj = (globalThis.crypto ??= {} as Crypto) as {
    randomUUID: () => `${string}-${string}-${string}-${string}-${string}`;
  };
  cryptoObj.randomUUID = () =>
    `test-uuid-${seq++}-0-0-0` as `${string}-${string}-${string}-${string}-${string}`;
}
