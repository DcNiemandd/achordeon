// Reading what someone pasted — ADR-0016 (two front-ends, one path)
//
// Pure, and separate from the fetching so that "is this a font I can get?" is a
// question with a testable answer and no network.
//
// **Two front-ends.** A direct `.ttf` URL on an allow-listed host is used as it
// stands. A Google Fonts embed URL — the block the site tells you to paste into
// your `<head>` — is read for its **query string only**: the family names. The
// CSS it points at is never requested, because `fonts.googleapis.com/css2`
// answers by User-Agent (TrueType to curl, woff2 to a browser) and `User-Agent`
// is a forbidden header name, so `fetch` silently drops any attempt to ask as
// something else.
//
// **An allow-list, not a wildcard.** Reading a cross-origin response body from
// script needs `Access-Control-Allow-Origin`, and hosts that were not built to
// serve web fonts mostly do not send it — the failure arrives as an
// unexplainable `TypeError`, per host, unpredictably. Both hosts below send `*`
// and both reach the original TTFs of the Google Fonts catalogue.

/** The hosts a font may be fetched from. Adding one is a redeploy, not a setting. */
export const FONT_HOSTS: readonly string[] = [
  'cdn.jsdelivr.net',
  'raw.githubusercontent.com',
];

/** Why a pasted string cannot be used. The message is shown, so it says what is wrong. */
export class FontUrlError extends Error {}

/** What a pasted string turned out to be. */
export type FontRequest =
  /** One file, already at an address that can be fetched. */
  | { readonly kind: 'file'; readonly url: string }
  /** Family names, still to be resolved through the index. */
  | { readonly kind: 'google'; readonly families: readonly string[] };

/** One family's row in the generated index: its directory and its TTF files. */
export interface FontIndexRow {
  readonly d: string;
  readonly f: readonly string[];
}

export type FontIndex = Readonly<Record<string, FontIndexRow>>;

/**
 * The key a family name is looked up by.
 *
 * `google/fonts` folders its families as lowercase runs of letters and digits —
 * "Crimson Text" is `crimsontext`, not `crimson-text`. The generator uses the
 * folder name as the key, so this has to agree with it exactly; it is
 * deliberately **not** `slugify`, whose hyphens are what a *setting* id wants.
 */
export function familyKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** Read a pasted string, or say why it cannot be used. */
export function readFontUrl(raw: string): FontRequest {
  const text = raw.trim();
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new FontUrlError('that is not a link');
  }
  if (url.protocol !== 'https:') {
    throw new FontUrlError('only https links');
  }

  if (url.hostname === 'fonts.googleapis.com') {
    const families = googleFamilies(url);
    if (families.length === 0) {
      throw new FontUrlError('that link names no font');
    }
    return { kind: 'google', families };
  }

  if (!FONT_HOSTS.includes(url.hostname)) {
    throw new FontUrlError(`only ${FONT_HOSTS.join(' and ')}`);
  }
  if (!url.pathname.toLowerCase().endsWith('.ttf')) {
    throw new FontUrlError('only .ttf files');
  }
  return { kind: 'file', url: url.toString() };
}

/**
 * The family names out of an embed URL's query string.
 *
 * `?family=Courier+Prime:ital,wght@0,400;1,400&family=Oswald:wght@200..700` —
 * the axis spec after the colon is what the *website* would have asked for and
 * has no bearing on which files exist, so it is dropped. Which faces come back
 * is decided by what the repo actually ships (`filesFor`).
 */
function googleFamilies(url: URL): string[] {
  const names = url.searchParams
    .getAll('family')
    .map((value) => value.split(':')[0].trim())
    .filter((name) => name.length > 0);
  return [...new Set(names)];
}

/** The four faces worth fetching, by the suffix a static file names them with. */
const STATIC_FACES = ['-Regular', '-Bold', '-Italic', '-BoldItalic'];

/**
 * Which of a family's files to fetch.
 *
 * **Static files win.** A variable TTF registers with jsPDF as its default
 * instance and nothing else — `addFont` reads `glyf` and ignores `gvar` — so a
 * family that ships both would otherwise be installed as a bold that is not
 * bold in the PDF while the screen, which *can* vary the axis, shows a real one.
 * That is the divergence §4.10 forbids.
 *
 * Where a family ships **only** variable files, they are taken anyway: one
 * usable face each is better than nothing, and the family then simply borrows
 * what it has not got (ADR-0017's donor rule) with no special case here.
 */
export function filesFor(row: FontIndexRow): string[] {
  const statics = row.f.filter((file) => !file.includes('['));
  const wanted = statics.filter((file) =>
    STATIC_FACES.some((face) => file.endsWith(`${face}.ttf`)),
  );
  if (wanted.length > 0) return wanted;
  // A family whose statics are all named something else — "Light", "SemiBold".
  // The regular is not identifiable from the name, so take the file the sfnt
  // parse can identify, which is any of them, and let it say what it is.
  if (statics.length > 0) return [statics[0]];
  return row.f.filter((file) => file.includes('['));
}

/** One family the index offers, as a search result can show it. */
export interface FontCandidate {
  /** Its key in the index — what `addFamily` is called with. */
  readonly key: string;
  /** The family's own name, spaced out of the file name it ships under. */
  readonly label: string;
  /**
   * How many faces adding it would install. One file is one face, so this is
   * exactly `filesFor(row).length` — the count the library will show afterwards,
   * said before rather than after.
   */
  readonly faces: number;
  /**
   * Its faces come from variable files, which give their default instance only.
   *
   * The reason a family offering nine weights on the Google Fonts site installs
   * as one: jsPDF's `addFont` reads `glyf` and ignores `gvar`. Known here from
   * the file name alone — a variable file carries its axes in brackets — so the
   * surprise can be headed off before any bytes are fetched.
   */
  readonly isVariable: boolean;
}

/**
 * A family's name, read back out of a file name.
 *
 * The index is keyed by the repo's folder convention — `crimsontext`, lowercase
 * and run together — which cannot be turned back into "Crimson Text" by any
 * amount of splitting. The **file** name can: `CrimsonText-Bold.ttf` still has
 * its capitals, and the same is true of every family in the repo, because
 * `google/fonts` names its files after the family.
 *
 * Derived here rather than written into the index by the generator. It would be
 * the same derivation either way — the trees API has no display names to offer
 * — so doing it at generation time would only commit 27 kB of JSON to say what
 * the file names already say.
 */
export function displayName(row: FontIndexRow, key: string): string {
  const stem = (row.f[0] ?? '')
    // `Lora[wght].ttf`, `CrimsonText-Bold.ttf`, `static/Lora-Regular.ttf` — the
    // family is whatever comes before the axes, the style, or the extension.
    .replace(/^.*\//, '')
    .replace(/[[-].*$/, '')
    .replace(/\.ttf$/i, '')
    .replace(/_/g, ' ');
  if (!stem) return key;
  return (
    stem
      // `CrimsonText` → `Crimson Text`, and `NotoSansJP` → `Noto Sans JP`: a
      // capital after a lowercase starts a word, and so does the last capital
      // of a run that is followed by a lowercase.
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .trim()
  );
}

/**
 * The families whose name contains what was typed.
 *
 * Matched against the **key**, which is what `familyKey` reduces both sides to,
 * so "crimson text", "CrimsonText" and "crimson  text" are one query. Prefixes
 * sort first: someone typing "rob" wants Roboto before Fira Sans Roboto-ish
 * near-misses, and the list is capped because nobody reads the four hundredth
 * family whose name contains "sans".
 */
export function searchFamilies(
  index: FontIndex,
  query: string,
  limit: number,
): FontCandidate[] {
  const needle = familyKey(query);
  if (!needle) return [];

  const prefix: FontCandidate[] = [];
  const rest: FontCandidate[] = [];
  for (const [key, row] of Object.entries(index)) {
    const at = key.indexOf(needle);
    if (at < 0) continue;
    const files = filesFor(row);
    const candidate = {
      key,
      label: displayName(row, key),
      faces: files.length,
      isVariable: files.some((file) => file.includes('[')),
    };
    (at === 0 ? prefix : rest).push(candidate);
  }

  const byLabel = (a: FontCandidate, b: FontCandidate) =>
    a.label.localeCompare(b.label);
  return [...prefix.sort(byLabel), ...rest.sort(byLabel)].slice(0, limit);
}

/** jsDelivr's address for one file in `google/fonts`. */
export function jsdelivrUrl(dir: string, file: string): string {
  const path = `${dir}/${file}`
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `https://cdn.jsdelivr.net/gh/google/fonts@main/${path}`;
}
