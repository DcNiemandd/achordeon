// A whole library in a link's fragment — plan §4 / §5
//
// A link carries an envelope; tapping it opens the import preview, already filled
// in. There is no route: the fragment is read **wherever the user lands**, so a
// writer appends it to `ACHORDEON_URL` and stops. Nothing to deploy, no route name
// for a model to get wrong, and the base URL always resolves.
//
// **The fragment, never the query.** It must not reach a server, must survive with
// no network, and must not land in anyone's logs. It is also why this works for
// someone who installed the PWA and is offline.
//
// **Two forms, one reader.** Both are URL-encoded; they differ only in whether the
// JSON is compressed first, and the reader branches on WHICH PARAMETER carries the
// payload rather than sniffing the bytes. The digit is what lets a third form
// arrive later without guessing — a new encoding takes a new parameter, and old
// links keep meaning what they meant.

/** Gzip then base64url. Roughly halves a song. Written by the app and the skill,
 * which both have a compressor. */
export const SHARE_LINK_COMPRESSED = 'z1';

/**
 * The JSON, percent-encoded, nothing else. Written by a model.
 *
 * A model cannot produce the compressed form: gzip is a byte-level transform with
 * no reasoning in it, and a model asked for one emits a plausible string that
 * decodes to nothing. Without the plain form the link would be a tooling-only
 * feature and the published schema would have no way to reach the app.
 */
export const SHARE_LINK_PLAIN = 'j1';

/**
 * How long a whole share link may be before a writer gives up and offers a file.
 *
 * **The app enforces nothing on the way in.** A payload too long to survive being
 * pasted arrives truncated, fails to decode, and gets the existing "could not be
 * imported" dialog — truncated and corrupt are indistinguishable and have the same
 * answer. Deciding a song is too big to link belongs to the writers: the download
 * dialog disables the option and says why, and the skill writes a file instead.
 *
 * A conservative floor across chat clients, mail and address bars rather than a
 * derived number — it is a limit to test against a real client, and one named
 * constant is what makes raising it a one-line change.
 */
export const SHARE_LINK_MAX_URL = 8000;

/**
 * An envelope's JSON as a link, compressed.
 *
 * The app always writes `z1`: it has `CompressionStream`, and the plain form
 * exists for writers that do not.
 */
export async function toShareLink(json: string, base: string): Promise<string> {
  const gzipped = await gzip(new TextEncoder().encode(json));
  return `${base}#${SHARE_LINK_COMPRESSED}=${toBase64Url(gzipped)}`;
}

/**
 * The envelope a fragment carries, as the Blob every inbound path hands to
 * `ImportService.read`.
 *
 * `null` means this fragment is not a share link at all — an ordinary anchor, a
 * router fragment, an empty hash — which is the common case on every navigation
 * and must stay silent. A fragment that IS one and does not decode throws, so it
 * reaches the same failure dialog as an unreadable file: truncated and corrupt are
 * indistinguishable, and have the same answer.
 */
export async function fromShareLink(fragment: string): Promise<Blob | null> {
  const params = parseFragment(fragment);

  const compressed = params.get(SHARE_LINK_COMPRESSED);
  if (compressed !== undefined) {
    return new Blob([await ungzip(fromBase64Url(compressed))]);
  }

  const plain = params.get(SHARE_LINK_PLAIN);
  if (plain !== undefined) return new Blob([plain]);

  return null;
}

/**
 * `a=1&b=2` → a map, decoding each half with `decodeURIComponent`.
 *
 * Hand-rolled rather than `URLSearchParams`, which applies *form* decoding and
 * turns a `+` into a space. base64url has no `+` in its alphabet, so `z1` would
 * survive — but a hand-written `j1` whose JSON contains one would not, and a
 * writer that percent-encoded correctly deserves to be read correctly.
 */
function parseFragment(fragment: string): Map<string, string> {
  const out = new Map<string, string>();
  const body = fragment.startsWith('#') ? fragment.slice(1) : fragment;
  for (const pair of body.split('&')) {
    if (pair === '') continue;
    const at = pair.indexOf('=');
    if (at <= 0) continue;
    try {
      out.set(
        decodeURIComponent(pair.slice(0, at)),
        decodeURIComponent(pair.slice(at + 1)),
      );
    } catch {
      // A stray `%` in somebody's anchor is not a malformed share link — it is
      // not a share link. Skipping the pair keeps `null` the answer.
    }
  }
  return out;
}

function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  return collect(through(bytes, new CompressionStream('gzip')));
}

async function ungzip(bytes: Uint8Array): Promise<string> {
  return new TextDecoder().decode(
    await collect(through(bytes, new DecompressionStream('gzip'))),
  );
}

/**
 * The bytes through one compression stream.
 *
 * One chunk in, then done. A `Blob`'s own `stream()` would do as the source, but
 * a Blob is a file and this is a buffer.
 *
 * The cast is the DOM lib's doing: a compression stream's writable side is typed
 * `BufferSource` while its readable side is `Uint8Array`, so the pair does not
 * satisfy `ReadableWritablePair` for either type on its own. What actually
 * crosses is bytes both ways.
 */
function through(
  bytes: Uint8Array,
  transform: CompressionStream | DecompressionStream,
): ReadableStream<Uint8Array> {
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  return source.pipeThrough(
    transform as unknown as ReadableWritablePair<Uint8Array, Uint8Array>,
  );
}

async function collect(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/** base64url: the URL-safe alphabet, padding dropped — no `+`, `/` or `=` to be
 * escaped, re-escaped, or eaten by a chat client on the way. */
function toBase64Url(bytes: Uint8Array): string {
  // Chunked: `String.fromCharCode(...bytes)` on a whole song overruns the
  // argument limit and throws, which would make the feature work only for songs
  // small enough not to need it.
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(text.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
