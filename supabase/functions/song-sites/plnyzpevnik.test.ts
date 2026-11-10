// The plnyzpevnik adapter's parsing — plans/import-chord-sheets.md, phase 5.
//
// Against responses recorded once from the real site (fixtures/), so a test run
// never reaches it. When the site changes its format these are the tests that
// say so: re-record the fixture and see what broke.

import { assertEquals, assertExists } from 'jsr:@std/assert@1';
import { parseSearch, parseSong } from './plnyzpevnik.ts';

const fixture = (name: string) =>
  Deno.readFile(new URL(`./fixtures/${name}`, import.meta.url));

Deno.test('a search keeps the songs, in the site’s order', async () => {
  const json = JSON.parse(
    new TextDecoder().decode(await fixture('plnyzpevnik-search-pohoda.json')),
  );
  const hits = parseSearch(json);
  assertEquals(hits.slice(0, 2), [
    { id: 'sam-sebou/pohoda', title: 'Pohoda', artist: 'Sám Sebou' },
    { id: 'e-e/pohoda', title: 'Pohoda', artist: 'E!E' },
  ]);
  // Artist hits are not songs.
  assertEquals(
    hits.some((hit) => hit.title === 'Tichá dohoda'),
    false,
  );
});

Deno.test('a song page gives its title, artist and every version', async () => {
  const song = parseSong(
    await fixture('plnyzpevnik-song-sam-sebou-pohoda.rsc'),
  );
  assertExists(song);
  assertEquals(song.title, 'Pohoda');
  assertEquals(song.artist, 'Sám Sebou');
  assertEquals(song.versions.length, 2);
  assertEquals(song.versions[0].text.split('\n')[0], '{start_of_verse: P1}');
  assertEquals(
    song.versions[0].text.endsWith('s poho[C]dou\n{end_of_verse}'),
    true,
  );
  assertEquals(song.versions[1].text.split('\n')[0], '{c: capo 1}');
});
