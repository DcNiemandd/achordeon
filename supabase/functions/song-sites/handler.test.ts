// The Song sites contract — plans/import-chord-sheets.md, phase 5 (Q14–Q16,
// Q55–Q57). The handler is driven with a fake upstream that serves the recorded
// fixtures, and a fake limiter, so nothing here reaches the network or the db.

import { deepStrictEqual } from 'node:assert';
import { handle, type Deps } from './handler.ts';

const fixture = (name: string) =>
  Deno.readFile(new URL(`./fixtures/${name}`, import.meta.url));

/** plnyzpevnik as recorded: one search, one song page, nothing else. */
const upstream: typeof fetch = async (input) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.pathname === '/api/search') {
    return new Response(await fixture('plnyzpevnik-search-pohoda.json'));
  }
  if (url.pathname === '/zpevnik/sam-sebou/pohoda') {
    return new Response(await fixture('plnyzpevnik-song-sam-sebou-pohoda.rsc'));
  }
  return new Response('not found', { status: 404 });
};

function deps(over: Partial<Deps> = {}): Deps {
  return {
    fetch: upstream,
    isRateLimited: () => Promise.resolve(false),
    timeoutMs: 5000,
    ...over,
  };
}

async function post(
  body: unknown,
  over: Partial<Deps> = {},
): Promise<{ status: number; json: unknown }> {
  const response = await handle(
    new Request('http://localhost/song-sites', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    deps(over),
  );
  return { status: response.status, json: await response.json() };
}

Deno.test('sites: a number, a name and a link hint for each site', async () => {
  deepStrictEqual(await post({ action: 'sites' }), {
    status: 200,
    json: [{ site: 1, name: 'Plný zpěvník', urlHint: 'plnyzpevnik.cz' }],
  });
});

Deno.test('search: every site answers in a group of its own', async () => {
  const { status, json } = await post({ action: 'search', q: 'pohoda' });
  deepStrictEqual(status, 200);
  const [group] = json as {
    site: number;
    results: { id: string; title: string; artist: string }[];
  }[];
  deepStrictEqual(group.site, 1);
  deepStrictEqual(group.results[0], {
    id: 'sam-sebou/pohoda',
    title: 'Pohoda',
    artist: 'Sám Sebou',
  });
});

Deno.test('search: a site that fails says so in its own group', async () => {
  const broken: typeof fetch = () =>
    Promise.resolve(new Response('down', { status: 503 }));
  deepStrictEqual(
    await post({ action: 'search', q: 'pohoda' }, { fetch: broken }),
    {
      status: 200,
      json: [{ site: 1, groupError: 'unavailable', results: [] }],
    },
  );
});

Deno.test('search: a site that takes too long is given up on', async () => {
  // Answers only when told to stop, as a real fetch does on abort.
  const stuck: typeof fetch = (_input, init) =>
    new Promise((_resolve, reject) =>
      init?.signal?.addEventListener('abort', () =>
        reject(new DOMException('aborted', 'AbortError')),
      ),
    );
  deepStrictEqual(
    await post(
      { action: 'search', q: 'pohoda' },
      { fetch: stuck, timeoutMs: 10 },
    ),
    {
      status: 200,
      json: [{ site: 1, groupError: 'timeout', results: [] }],
    },
  );
});

interface SongResponse {
  site: number;
  title: string;
  artist: string;
  versions?: { label: string; text: string }[];
  text: string;
  format: string;
  url: string;
}

Deno.test(
  'song: by site and id, every version and the first as the text',
  async () => {
    const { status, json } = await post({
      action: 'song',
      site: 1,
      id: 'sam-sebou/pohoda',
    });
    deepStrictEqual(status, 200);
    const song = json as SongResponse;
    deepStrictEqual(
      { ...song, text: song.text.split('\n')[0], versions: undefined },
      {
        site: 1,
        title: 'Pohoda',
        artist: 'Sám Sebou',
        versions: undefined,
        text: '{start_of_verse: P1}',
        format: 'chordpro',
        url: 'https://plnyzpevnik.cz/zpevnik/sam-sebou/pohoda',
      },
    );
    deepStrictEqual(
      song.versions?.map((v) => v.label),
      ['Version 1', 'Version 2'],
    );
    deepStrictEqual(song.versions?.[0].text, song.text);
  },
);

Deno.test('song: by a link someone pasted, whichever site it is', async () => {
  const { status, json } = await post({
    action: 'song',
    url: 'https://www.plnyzpevnik.cz/zpevnik/sam-sebou/pohoda?ref=x#top',
  });
  deepStrictEqual(status, 200);
  const song = json as SongResponse;
  deepStrictEqual(
    [song.site, song.title, song.url],
    [1, 'Pohoda', 'https://plnyzpevnik.cz/zpevnik/sam-sebou/pohoda'],
  );
});

Deno.test('song: a link no site can read is turned away', async () => {
  for (const url of [
    'https://example.com/zpevnik/sam-sebou/pohoda',
    'https://plnyzpevnik.cz/interpreti/sam-sebou',
    'not a link',
  ]) {
    deepStrictEqual(await post({ action: 'song', url }), {
      status: 422,
      json: { reason: 'unsupported-url' },
    });
  }
});

Deno.test('a caller over the limit reaches no site', async () => {
  let reached = 0;
  const counting: typeof fetch = (input, init) => {
    reached++;
    return upstream(input, init);
  };
  const over = {
    fetch: counting,
    isRateLimited: () => Promise.resolve(true),
  };
  for (const body of [
    { action: 'search', q: 'pohoda' },
    { action: 'song', site: 1, id: 'sam-sebou/pohoda' },
  ]) {
    deepStrictEqual(await post(body, over), {
      status: 429,
      json: { reason: 'rate-limited' },
    });
  }
  deepStrictEqual(reached, 0);
  // Asking which sites there are costs no site anything.
  deepStrictEqual((await post({ action: 'sites' }, over)).status, 200);
});
