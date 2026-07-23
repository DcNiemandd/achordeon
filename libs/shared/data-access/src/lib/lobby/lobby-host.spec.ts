// LobbyHost — Epic 9 (host debounce + channel lifecycle)

import { TestBed } from '@angular/core/testing';
import type { LobbyPayload, Song } from '@achordeon/shared/domain';
import { LobbyAnalytics } from './lobby-analytics';
import { LobbyHost } from './lobby-host';
import { SupabaseService } from './supabase-client';

function makePayload(songId: string): LobbyPayload {
  const song = {
    id: songId,
    name: songId,
    content: '',
    favorite: false,
    settings: {},
    cache: { title: '', subtitle: '' },
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
  } satisfies Song;
  return { song, settings: {} as never, summary: [], currentIndex: 0 };
}

// A fake Realtime channel that records track/send and subscribes synchronously.
class FakeChannel {
  readonly track = jest.fn(async () => 'ok');
  readonly send = jest.fn(async () => 'ok');
  presenceState() {
    return {};
  }
  on() {
    return this;
  }
  subscribe(cb: (status: string) => void) {
    cb('SUBSCRIBED');
    return this;
  }
}

describe('LobbyHost', () => {
  let channel: FakeChannel;
  let host: LobbyHost;

  beforeEach(() => {
    jest.useFakeTimers();
    channel = new FakeChannel();
    const client = {
      channel: jest.fn(() => channel),
      removeChannel: jest.fn(async () => undefined),
    };
    TestBed.configureTestingModule({
      providers: [
        LobbyHost,
        { provide: SupabaseService, useValue: { client: async () => client } },
        {
          provide: LobbyAnalytics,
          useValue: { created: jest.fn(), songChanged: jest.fn() },
        },
      ],
    });
    host = TestBed.inject(LobbyHost);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('opens immediately and tracks the first payload', async () => {
    await host.sync('ABCDE', makePayload('s1'));

    expect(channel.track).toHaveBeenCalledTimes(1);
    expect(channel.track.mock.calls[0][0]).toMatchObject({
      song: { id: 's1' },
    });
    expect(host.status()).toBe('hosting');
  });

  it('debounces rapid same-PIN changes to just the one landed on', async () => {
    await host.sync('ABCDE', makePayload('s1')); // opens + tracks s1
    channel.track.mockClear();
    channel.send.mockClear();

    // Tap through the book fast — no push should happen yet.
    await host.sync('ABCDE', makePayload('s2'));
    await host.sync('ABCDE', makePayload('s3'));
    await host.sync('ABCDE', makePayload('s4'));
    expect(channel.send).not.toHaveBeenCalled();

    // Settle: exactly one push, carrying the last payload.
    jest.advanceTimersByTime(200);
    expect(channel.send).toHaveBeenCalledTimes(1);
    expect(channel.track).toHaveBeenCalledTimes(1);
    expect(channel.send.mock.calls[0][0]).toMatchObject({
      payload: { song: { id: 's4' } },
    });
  });

  it('cancels a pending push when the lobby closes', async () => {
    await host.sync('ABCDE', makePayload('s1'));
    await host.sync('ABCDE', makePayload('s2')); // schedules a push
    await host.close();

    jest.advanceTimersByTime(200);
    expect(channel.send).not.toHaveBeenCalled();
    expect(host.status()).toBe('idle');
  });
});
