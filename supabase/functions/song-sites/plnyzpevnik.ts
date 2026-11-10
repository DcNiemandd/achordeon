// plnyzpevnik.cz — the first Song site (ADR-0019, plan phase 5).
//
// Read through two doors: a JSON search endpoint, and the song page asked for as
// a Next.js RSC flight payload (`RSC: 1`), which carries the song's ChordPro
// without the HTML around it. The payload is undocumented, which is exactly why
// this adapter lives in the function: when the site changes, the fix is a
// deploy, not an app release.
//
// robots.txt allows everything (checked 2026-11-11, plan Q58).

import {
  UpstreamError,
  USER_AGENT,
  type SearchHit,
  type Site,
  type SongPage,
  type SongVersion,
} from './site.ts';

const ORIGIN = 'https://plnyzpevnik.cz';

export const plnyzpevnik: Site = {
  name: 'Plný zpěvník',
  urlHint: 'plnyzpevnik.cz',
  async search(q, fetch) {
    const response = await fetch(
      `${ORIGIN}/api/search?q=${encodeURIComponent(q)}`,
      { headers: { 'user-agent': USER_AGENT } },
    );
    if (!response.ok) throw new UpstreamError(response.status);
    return parseSearch(await response.json());
  },
  async song(id, fetch) {
    if (!SONG_ID.test(id)) return null;
    // `RSC: 1` asks for the flight payload instead of the HTML around it.
    const response = await fetch(this.urlOf(id), {
      headers: { 'user-agent': USER_AGENT, rsc: '1' },
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new UpstreamError(response.status);
    return parseSong(new Uint8Array(await response.arrayBuffer()));
  },
  idFromUrl(url) {
    if (!HOSTS.has(url.hostname)) return null;
    const path = /^\/zpevnik\/([a-z0-9-]+\/[a-z0-9-]+)\/?$/.exec(url.pathname);
    return path ? path[1] : null;
  },
  urlOf: (id) => `${ORIGIN}/zpevnik/${id}`,
};

const HOSTS = new Set(['plnyzpevnik.cz', 'www.plnyzpevnik.cz']);

/** `artist-slug/song-slug`, and nothing that could walk elsewhere on the site. */
const SONG_ID = /^[a-z0-9-]+\/[a-z0-9-]+$/;

/**
 * The songs among the search results, in the site's order. Artist hits are left
 * out: the contract lists songs, and an artist is a search the user can type.
 */
export function parseSearch(json: unknown): SearchHit[] {
  const results = (json as { results?: unknown })?.results;
  if (!Array.isArray(results)) return [];
  const hits: SearchHit[] = [];
  for (const r of results as Record<string, unknown>[]) {
    if (r?.type !== 'song') continue;
    const { title, artist, artistSlug, songSlug } = r;
    if (
      typeof title !== 'string' ||
      typeof artistSlug !== 'string' ||
      typeof songSlug !== 'string'
    ) {
      continue;
    }
    hits.push({
      id: `${artistSlug}/${songSlug}`,
      title,
      artist: typeof artist === 'string' ? artist : '',
    });
  }
  return hits;
}

/** The song in an RSC flight payload, or null when the page holds none. */
export function parseSong(bytes: Uint8Array): SongPage | null {
  const rows = parseFlight(bytes);
  const song = findSong(rows);
  if (!song) return null;
  const versions: SongVersion[] = [];
  song.variants.forEach((variant, i) => {
    const text = deref(rows, variant.chordpro);
    if (typeof text !== 'string' || text.trim() === '') return;
    versions.push({ label: versionLabel(variant, i), text });
  });
  return {
    title: typeof song.title === 'string' ? song.title : '',
    artist: typeof song.artist?.name === 'string' ? song.artist.name : '',
    versions,
  };
}

// --- RSC flight -----------------------------------------------------------
// Rows are `<hexId>:<payload>\n`. A text row is `<hexId>:T<hexByteLen>,<bytes>`
// with NO trailing newline, and may itself hold newlines, so it is read by byte
// length rather than by line.

interface Row {
  readonly text?: string;
  readonly raw?: string;
  readonly json?: unknown;
}

const COLON = 0x3a;
const COMMA = 0x2c;
const NEWLINE = 0x0a;
const T = 0x54;

function parseFlight(bytes: Uint8Array): Map<string, Row> {
  const utf8 = new TextDecoder();
  const latin1 = new TextDecoder('latin1');
  const rows = new Map<string, Row>();
  let i = 0;
  while (i < bytes.length) {
    const colon = bytes.indexOf(COLON, i);
    if (colon === -1) break;
    const id = latin1.decode(bytes.subarray(i, colon));
    if (!/^[0-9a-f]+$/.test(id)) {
      const nl = bytes.indexOf(NEWLINE, i);
      if (nl === -1) break;
      i = nl + 1;
      continue;
    }
    const p = colon + 1;
    if (bytes[p] === T) {
      const comma = bytes.indexOf(COMMA, p);
      const length = parseInt(latin1.decode(bytes.subarray(p + 1, comma)), 16);
      if (comma !== -1 && Number.isFinite(length)) {
        const end = comma + 1 + length;
        rows.set(id, { text: utf8.decode(bytes.subarray(comma + 1, end)) });
        i = end;
        continue;
      }
    }
    let nl = bytes.indexOf(NEWLINE, p);
    if (nl === -1) nl = bytes.length;
    const raw = utf8.decode(bytes.subarray(p, nl));
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      json = undefined; // tagged rows (I, HL, …) are not ours
    }
    rows.set(id, { raw, json });
    i = nl + 1;
  }
  return rows;
}

interface RscVariant {
  readonly chordpro?: unknown;
  readonly key?: unknown;
  readonly capo?: unknown;
}

interface RscSong {
  readonly title?: unknown;
  readonly artist?: { readonly name?: unknown };
  readonly variants: readonly RscVariant[];
}

/** The `{ song: { …, variants } }` prop the page renders with. */
function findSong(rows: Map<string, Row>): RscSong | null {
  const seen = new Set<object>();
  const walk = (value: unknown): RscSong | null => {
    if (!value || typeof value !== 'object' || seen.has(value)) return null;
    seen.add(value);
    const song = (value as { song?: RscSong }).song;
    if (!Array.isArray(value) && song && Array.isArray(song.variants)) {
      return song;
    }
    for (const child of Object.values(value)) {
      const hit = walk(child);
      if (hit) return hit;
    }
    return null;
  };
  for (const row of rows.values()) {
    if (row.json === undefined || !row.raw?.includes('"variants"')) continue;
    const hit = walk(row.json);
    if (hit) return hit;
  }
  return null;
}

/** `"$18"` → text row 18; `"$$x"` → the literal `$x`; anything else as is. */
function deref(rows: Map<string, Row>, value: unknown): unknown {
  if (typeof value !== 'string') return value ?? null;
  if (value.startsWith('$$')) return value.slice(1);
  const ref = /^\$([0-9a-f]+)$/.exec(value);
  if (!ref) return value;
  return rows.get(ref[1])?.text ?? null;
}

/** "G, capo 2" where the site says so, else "Version n" (plan Q57). */
function versionLabel(variant: RscVariant, index: number): string {
  const parts: string[] = [];
  if (typeof variant.key === 'string' && variant.key) parts.push(variant.key);
  if (typeof variant.capo === 'number' && variant.capo > 0) {
    parts.push(`capo ${variant.capo}`);
  }
  return parts.length > 0 ? parts.join(', ') : `Version ${index + 1}`;
}
