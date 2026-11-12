// SongSiteService — the app's half of the Song sites contract
// (plans/import-chord-sheets.md phase 6, supabase/functions/song-sites).
//
// One `functions.invoke` per call. What is worth pinning is what goes out, and
// what a failure becomes: `invoke` reports every non-2xx as one opaque error
// with the Response hanging off it, and the dialog needs to tell "slow down"
// from "that link is from a site we can't read" from "the site is down".

import { TestBed } from '@angular/core/testing';
import { SupabaseService } from '../lobby/supabase-client';
import { SongSiteError, SongSiteService } from './song-site-service';

/** A non-2xx as `functions.invoke` hands it back. */
function httpError(status: number, reason: string): Error {
  return Object.assign(new Error('non-2xx'), {
    context: { status, json: () => Promise.resolve({ reason }) },
  });
}

describe('SongSiteService', () => {
  let invoke: jest.Mock;
  let isConfigured: boolean;

  function service(): SongSiteService {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SupabaseService,
          useValue: {
            get isConfigured() {
              return isConfigured;
            },
            client: async () => ({ functions: { invoke } }),
          },
        },
      ],
    });
    return TestBed.inject(SongSiteService);
  }

  beforeEach(() => {
    isConfigured = true;
    invoke = jest.fn(async () => ({ data: [], error: null }));
  });

  it('asks the function for the sites, a search, or one song', async () => {
    const songSites = service();
    await songSites.sites();
    await songSites.search('pohoda');
    await songSites.song({ site: 1, id: 'a/b' });
    await songSites.song({ url: 'https://example.com/x' });
    expect(invoke.mock.calls).toEqual([
      ['song-sites', { body: { action: 'sites' } }],
      ['song-sites', { body: { action: 'search', q: 'pohoda' } }],
      ['song-sites', { body: { action: 'song', site: 1, id: 'a/b' } }],
      [
        'song-sites',
        { body: { action: 'song', url: 'https://example.com/x' } },
      ],
    ]);
  });

  it.each([
    [429, 'rate-limited', 'rate-limited'],
    [422, 'unsupported-url', 'unsupported-url'],
    [404, 'not-found', 'not-found'],
    [504, 'timeout', 'timeout'],
    [502, 'unavailable', 'unavailable'],
    [500, 'failed', 'unavailable'],
  ])(
    'turns a %i into a %s failure the dialog can word',
    async (status, reason, expected) => {
      invoke.mockResolvedValue({
        data: null,
        error: httpError(status, reason),
      });
      await expect(service().search('pohoda')).rejects.toEqual(
        new SongSiteError(expected as SongSiteError['reason']),
      );
    },
  );

  it('calls a request that never got an answer unavailable', async () => {
    invoke.mockResolvedValue({ data: null, error: new TypeError('offline') });
    await expect(service().sites()).rejects.toEqual(
      new SongSiteError('unavailable'),
    );
  });

  it('is available only online, and only with a backend', () => {
    const songSites = service();
    expect(songSites.isAvailable()).toBe(navigator.onLine);
    window.dispatchEvent(new Event('offline'));
    expect(songSites.isAvailable()).toBe(false);
    window.dispatchEvent(new Event('online'));
    expect(songSites.isAvailable()).toBe(true);

    TestBed.resetTestingModule();
    isConfigured = false;
    expect(service().isAvailable()).toBe(false);
  });
});
