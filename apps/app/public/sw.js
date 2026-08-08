/*
 * Achordeon's service worker: the download bridge, and then ngsw.
 *
 * ngsw-worker.js is still the whole offline story — it is imported at the bottom
 * and owns every request this file does not answer. What sits in front of it is
 * one route, `__download/`, which exists because **a `blob:` URL is not a file**
 * as far as Firefox is concerned.
 *
 * The anchor download (`file-io.ts`) hands the browser a `blob:` URL and a
 * `download` attribute and trusts it to save. Firefox for Android, running an
 * installed PWA, does not: the attribute loses to the browser's own idea of what
 * the bytes are, the URL is navigated to instead of downloaded, and in a window
 * with no tab strip that navigation lands on a blank screen. A PNG survives it
 * (there is nothing to "open" a PNG into); a PDF does not, which is exactly the
 * shape of the reported bug.
 *
 * A response *served by this worker* has no such ambiguity. It is an ordinary
 * same-origin HTTP response carrying `Content-Disposition: attachment`, which is
 * the one instruction every browser — and Android's download manager behind it —
 * agrees means "this is a file, save it". No `blob:` URL is ever navigated.
 *
 * The path deliberately contains `__` and ends in the file's own extension: both
 * are in ngsw's default `navigationUrls` exclusions, so ngsw never treats a
 * download as a navigation to answer with index.html.
 */

/** Where the bytes wait between "make me a URL" and the click that fetches them. */
const DOWNLOAD_CACHE = 'achordeon-downloads';

/** Scope-relative, because the app is served under a base href (`/app/`). */
const DOWNLOAD_PREFIX = new URL('__download/', self.registration.scope)
  .pathname;

/** The message `file-io.ts` sends to ask for a download URL. */
const DOWNLOAD_MESSAGE = 'achordeon:download';

/**
 * Held in the **Cache**, not in a `Map`.
 *
 * A service worker is killed whenever the browser feels like it, including
 * between the message that stashes a file and the click that fetches it. A map
 * entry would go with it and the download would 404; a cache entry outlives the
 * worker, and the headers travel with the response rather than being rebuilt by
 * whichever instance wakes up to serve it.
 */
async function stash(blob, filename) {
  // The name is in the path as well as in the header: a browser that ignores the
  // header still has a sensible name to fall back on, and the random segment in
  // front keeps two downloads of the same song apart.
  const path = `${DOWNLOAD_PREFIX}${crypto.randomUUID()}/${encodeURIComponent(filename)}`;
  const cache = await caches.open(DOWNLOAD_CACHE);
  await cache.put(
    path,
    new Response(blob, {
      headers: {
        // Not `application/pdf`, deliberately: a type the browser has a viewer
        // for is an invitation to render instead of save, and the attachment
        // disposition should not have to argue with one.
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': contentDisposition(filename),
        'Content-Length': String(blob.size),
      },
    }),
  );
  return path;
}

/**
 * `attachment`, with the filename twice.
 *
 * The plain `filename=` is ASCII because the header is; `filename*=` carries the
 * real one for anything that reads RFC 5987, which is every browser we ship to.
 * Achordeon's own names are slugs already (`toFileSlug`), so this only matters
 * for the day one stops being.
 */
function contentDisposition(filename) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/** One shot: the bytes are handed over once and then dropped, so a download does
 * not sit in the cache for the rest of the install. */
async function serve(path) {
  const cache = await caches.open(DOWNLOAD_CACHE);
  const hit = await cache.match(path);
  // 204, not 404: this URL is reached by clicking a link, so the answer is a
  // navigation. "No content" leaves the app exactly where it was; an error page
  // would replace the song the user was looking at with a blank screen — the
  // very failure this route exists to end.
  if (!hit) return new Response(null, { status: 204 });
  await cache.delete(path);
  return hit;
}

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== DOWNLOAD_MESSAGE) return;
  const port = event.ports[0];
  if (!port) return;
  event.waitUntil(
    stash(data.blob, data.filename).then(
      (path) => port.postMessage({ path }),
      // A failure here is not fatal: the page waits for this reply and falls
      // back to the anchor download when it does not come or says nothing.
      () => port.postMessage({ path: null }),
    ),
  );
});

// Registered BEFORE ngsw is imported, so this handler runs first and ngsw only
// ever sees the requests it is left. Everything outside the download route is
// passed straight through by returning without calling `respondWith`.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(DOWNLOAD_PREFIX)) return;
  event.respondWith(serve(url.pathname));
});

// A download that was stashed but never fetched (the app was closed mid-save)
// has no second chance — a new worker means a new session, so the shelf starts
// empty rather than holding megabytes nobody asked for any more.
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.delete(DOWNLOAD_CACHE));
});

importScripts('ngsw-worker.js');
