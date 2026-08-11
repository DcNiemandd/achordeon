# 16. A font is acquired, not referenced

Date: 2026-08-11

## Status

Accepted. **Supersedes** the "Importing a font from a URL — dropped [decided]"
block in `docs/PRD-RENDERING.md` §4.10.

## Context

§4.10 rejected user-supplied font URLs outright, on three grounds:

- **CSP** — a new origin the policy must allow (`PRD-INFRASTRUCTURE.md` §7).
- **Offline** — the service worker cannot precache a URL nobody has typed yet, so
  the face is missing on a cold offline boot.
- **The PDF** — jsPDF `addFont` accepts `.ttf` only and Google Fonts serves
  `.woff2`, so the screen would show the chosen face and the export would silently
  fall back to another. "The one failure mode a document app cannot have."

All three are correct about the thing they evaluated: a URL held as a **reference**,
where the face lives at that address and is fetched when a render needs it. That is
not the only way to read the feature.

**A URL can instead be an acquisition channel.** The user pastes it once; the app
fetches, validates and stores the bytes in IndexedDB there and then. From that
instant the font is byte-identical to an uploaded one — which §4.10 already blessed
as the escape hatch. Under ADR-0006's cascade and the injected catalog (below) it is
not even a second code path: it is a catalog row whose bytes arrived from somewhere
else, once.

Re-tested against the reframe:

- **Offline dies.** The bytes are in IndexedDB before the font is ever selectable.
  A cold offline boot has everything it needs. The objection was entirely about
  render-time referencing.
- **The PDF survives but changes character.** Its severity came from the divergence
  being _silent_ and _late_ — discovered when an export was already in the user's
  hands. Acquisition is a moment we control, with the user watching, so the same
  problem becomes a validation that can refuse loudly and up front.
- **CSP survives and shrinks.** It is `connect-src` for a one-time fetch, not
  `font-src` on every render. `font-src` does not move at all: stored bytes reach
  the browser through `FontFace(family, arrayBuffer)`, which is not a fetch.

A fourth objection the original did not record, and which decides the shape:

- **CORS.** Reading a cross-origin response body from script requires
  `Access-Control-Allow-Origin`. Fonts are stricter than images here — `@font-face`
  has been CORS-restricted since the WOFF era — so hosts _built_ to serve web fonts
  send the header and hosts that are not (a blog, a bucket, `github.com` pages)
  usually do not. `mode: 'no-cors'` returns an opaque response with no readable
  bytes, so it is not an escape. The failure reaches the app as an unexplainable
  `TypeError`, per host, unpredictably.

### Measured

| Host                        | ACAO | Content-Type               |
| --------------------------- | ---- | -------------------------- |
| `cdn.jsdelivr.net`          | `*`  | `font/ttf`                 |
| `raw.githubusercontent.com` | `*`  | `application/octet-stream` |
| `fonts.gstatic.com`         | `*`  | woff2                      |
| `unpkg.com`                 | `*`  | `font/woff2`               |

`cdn.jsdelivr.net/gh/google/fonts@main/...` reaches the **original TTFs** of the
Google Fonts catalog, which is what makes the PDF objection evaporate rather than
get worked around.

Two traps found while measuring:

- **`fonts.googleapis.com/css2` answers by User-Agent.** To `curl` it returns
  `format('truetype')` and real `.ttf` URLs; to a browser it returns woff2. The app
  cannot spoof its way to the first — `User-Agent` is a forbidden header name, so
  `fetch` silently drops any attempt to set it. Fetching that CSS from the app is a
  dead end, and the embed URL is therefore parsed for family names only, never
  followed.
- **`google/fonts` increasingly ships variable TTFs**, and its repo layout is
  irregular (`ofl/` vs `apache/` vs `ufl/`; `Oswald[wght].ttf` exists where
  `static/Oswald-Regular.ttf` 404s). jsPDF reads `glyf` and ignores `gvar`, so a
  variable font registers as its **default instance only** and cannot be asked for
  another axis value. Registered as both regular and bold it yields a PDF whose
  bold is not bold, while the screen — which can vary the axis on a registered
  `FontFace` — shows real bold. That is §4.10's forbidden divergence arriving
  through the front door.

## Options

- **A — Uphold the rejection.** Upload-only, as recorded. Costs nothing, and leaves
  the most convenient acquisition path permanently closed for reasons that no
  longer all hold.
- **B — Accept any URL.** Needs `connect-src` widened to a wildcard, which is a real
  regression against §7's stated top risk (XSS exfiltrating IndexedDB and sync
  tokens), and makes CORS failures a routine, unexplainable user experience.
- **C — Accept URLs from an allow-list of hosts known to be CORS-clean.**

## Decision

Adopt **C**.

- **A URL is an acquisition channel.** Fetch once at add-time, validate, store the
  bytes in IndexedDB. Nothing is fetched at render time, ever.
- **Two hosts:** `cdn.jsdelivr.net` and `raw.githubusercontent.com`. Both reach
  `google/fonts`' original TTFs. `connect-src` gains exactly these two; `font-src`
  is untouched. The allow-list is a build-time constant in the generated index, so
  adding a host is a redeploy, not a setting.
- **TTF only**, validated at add-time by parsing the sfnt header. `.otf` is refused
  rather than sniffed: the extension does not say whether the outlines are
  TrueType or CFF, and a user told "OTF is supported" whose file is then rejected
  is worse off than one told "TTF only" up front. woff/woff2 support is a named
  follow-up, not a v1 gap — the jsDelivr path already supplies TTF for everything
  on Google Fonts, so decompression would buy convenience, not capability.
- **Variable fonts are accepted as regular-only.** An `fvar` table found during the
  same parse marks the family as supplying its default instance and nothing else.
  It then falls through the existing rule for a family with missing faces
  (ADR-0017) rather than needing a mechanism of its own.
- **Two front-ends, one path.** A direct `.ttf` URL on an allow-listed host is used
  as-is. A Google Fonts embed URL is parsed for its **query string only** — family
  names — and each name resolved through a build-time index to a jsDelivr TTF URL.
  The CSS is never fetched.
- **One parse answers everything.** Format validity, family name, `fvar`, and which
  face the file actually is all come from a single read of the sfnt at add-time.

## Consequences

- §4.10's rejection block is retired. Its offline objection is void under
  fetch-once; its PDF objection survives as the add-time validation; its CSP
  objection survives as two named hosts.
- **A font file is one face, not a family.** A user wanting bold uploads a second
  file. Font entries accumulate face by face.
- The build-time family index is new shipped data, regenerated against `google/fonts`.
  It is also most of what an in-app font browser would need, so that feature becomes
  a list view over data already present rather than a new capability.
- Import must not silently reach a third-party host. A file naming fonts this
  install lacks surfaces in the import dialog for confirmation, alongside the
  existing unknown-settings warning (ADR-0014).
- Achordeon never redistributes font bytes: exports carry references, not files
  (`PRD-INFRASTRUCTURE.md` §8).
