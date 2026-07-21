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

// jsdom's Blob predates `arrayBuffer()`/`text()`, which the transfer layer reads
// a picked file with. `FileReader` is jsdom's own reader for its own Blob, so it
// is the shim that cannot disagree with the object it is reading.
const blobProto = Blob.prototype as unknown as Record<string, unknown>;
if (typeof blobProto['arrayBuffer'] !== 'function') {
  blobProto['arrayBuffer'] = function (this: Blob) {
    return readBlob(this, 'readAsArrayBuffer');
  };
}
if (typeof blobProto['text'] !== 'function') {
  blobProto['text'] = function (this: Blob) {
    return readBlob(this, 'readAsText');
  };
}

function readBlob(
  blob: Blob,
  how: 'readAsArrayBuffer' | 'readAsText',
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader[how](blob);
  });
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
