// LobbyHost — Epic 9 (host debounce + channel lifecycle + durable publish)

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
  let rpc: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    channel = new FakeChannel();
    let rev = 0;
    // The durable-publish RPC hands back a server-owned, monotonic rev.
    rpc = jest.fn(async (fn: string) => {
      if (fn === 'lobby_publish') return { data: (rev += 1), error: null };
      return { data: null, error: null };
    });
    const client = {
      channel: jest.fn(() => channel),
      removeChannel: jest.fn(async () => undefined),
      rpc,
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

  it('opens immediately, tracks liveness, and publishes the first payload', async () => {
    await host.sync('ABCDE', makePayload('s1'));

    // Presence carries only liveness now — the payload rides the row + broadcast.
    expect(channel.track).toHaveBeenCalledWith({ role: 'host' });
    expect(rpc).toHaveBeenCalledWith('lobby_publish', {
      p_pin: 'ABCDE',
      p_payload: expect.objectContaining({
        song: expect.objectContaining({ id: 's1' }),
      }),
    });
    expect(channel.send.mock.calls[0][0]).toMatchObject({
      event: 'song',
      payload: { rev: 1, payload: { song: { id: 's1' } } },
    });
    expect(host.status()).toBe('hosting');
  });

  it('debounces rapid same-PIN changes to just the one landed on', async () => {
    await host.sync('ABCDE', makePayload('s1')); // opens + publishes s1
    rpc.mockClear();
    channel.send.mockClear();

    // Tap through the book fast — no publish should happen yet.
    await host.sync('ABCDE', makePayload('s2'));
    await host.sync('ABCDE', makePayload('s3'));
    await host.sync('ABCDE', makePayload('s4'));
    expect(rpc).not.toHaveBeenCalled();
    expect(channel.send).not.toHaveBeenCalled();

    // Settle: exactly one publish + broadcast, carrying the last payload.
    await jest.advanceTimersByTimeAsync(200);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(channel.send).toHaveBeenCalledTimes(1);
    expect(channel.send.mock.calls[0][0]).toMatchObject({
      payload: { payload: { song: { id: 's4' } } },
    });
  });

  it('cancels a pending publish and ends the row when the lobby closes', async () => {
    await host.sync('ABCDE', makePayload('s1'));
    await host.sync('ABCDE', makePayload('s2')); // schedules a publish
    channel.send.mockClear();
    await host.close();

    await jest.advanceTimersByTimeAsync(200);
    expect(channel.send).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('lobby_end', { p_pin: 'ABCDE' });
    expect(host.status()).toBe('idle');
  });
});
