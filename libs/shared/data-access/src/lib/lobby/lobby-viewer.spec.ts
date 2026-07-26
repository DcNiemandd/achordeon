// LobbyViewer — catching up after the tab was away
//
// The reducer itself (rev-gated, three transports) is ADR-0011's and is exercised
// through the fake channel's handlers; what this pins down is the repair: a phone
// in a pocket for most of a set must come back on the right song without blanking
// the one it is showing on the way.

import { TestBed } from '@angular/core/testing';
import type { LobbyPayload, Song } from '@achordeon/shared/domain';
import { LobbyViewer } from './lobby-viewer';
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

type Handler = (message: unknown) => void;

/** A fake Realtime channel that subscribes synchronously and records its config. */
class FakeChannel {
  state = 'closed';
  readonly broadcasts: Handler[] = [];
  readonly track = jest.fn(async () => 'ok');

  constructor(readonly presenceKey: string) {}

  presenceState() {
    return {};
  }
  on(type: string, _filter: unknown, handler: Handler) {
    if (type === 'broadcast') this.broadcasts.push(handler);
    return this;
  }
  subscribe(cb: (status: string) => void) {
    this.state = 'joined';
    cb('SUBSCRIBED');
    return this;
  }
}

describe('LobbyViewer', () => {
  let viewer: LobbyViewer;
  let opened: FakeChannel[];
  /** What the durable row currently holds. */
  let row: { rev: number; payload: LobbyPayload; ended_at: string | null };

  beforeEach(() => {
    jest.useFakeTimers();
    opened = [];
    row = { rev: 1, payload: makePayload('s1'), ended_at: null };
    const client = {
      channel: jest.fn(
        (_name: string, options: { config: { presence: { key: string } } }) => {
          const channel = new FakeChannel(options.config.presence.key);
          opened.push(channel);
          return channel;
        },
      ),
      removeChannel: jest.fn(async () => undefined),
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
        }),
      }),
    };
    TestBed.configureTestingModule({
      providers: [
        LobbyViewer,
        { provide: SupabaseService, useValue: { client: async () => client } },
      ],
    });
    viewer = TestBed.inject(LobbyViewer);
  });

  afterEach(() => jest.useRealTimers());

  it('joins and shows what the row holds', async () => {
    await viewer.join('ABCDE');
    await jest.advanceTimersByTimeAsync(0);

    expect(viewer.status()).toBe('joined');
    expect(viewer.payload()?.song.id).toBe('s1');
  });

  describe('after the tab was asleep', () => {
    it('re-reads the row on a channel that held, without re-joining', async () => {
      await viewer.join('ABCDE');
      await jest.advanceTimersByTimeAsync(0);

      // Three songs went by while the screen was off.
      row = { rev: 4, payload: makePayload('s4'), ended_at: null };
      await viewer.resume();

      expect(opened).toHaveLength(1);
      expect(viewer.payload()?.song.id).toBe('s4');
    });

    it('re-joins a channel that closed, and keeps the song on screen', async () => {
      await viewer.join('ABCDE');
      await jest.advanceTimersByTimeAsync(0);

      opened[0].state = 'closed'; // the socket went with the lock screen
      await viewer.resume();
      await jest.advanceTimersByTimeAsync(0);

      expect(opened).toHaveLength(2);
      // Not reset: `join` would have blanked the payload and dropped to
      // 'connecting' — a flicker in the middle of a repair.
      expect(viewer.status()).toBe('joined');
      expect(viewer.payload()?.song.id).toBe('s1');
    });

    // A fresh key is counted as a second viewer until the old entry expires, so a
    // lobby's audience count would climb every time a phone woke up.
    it('re-joins under the same Presence key', async () => {
      await viewer.join('ABCDE');
      await jest.advanceTimersByTimeAsync(0);

      opened[0].state = 'closed';
      await viewer.resume();

      expect(opened[1].presenceKey).toBe(opened[0].presenceKey);
    });

    // The rev gate: a re-read no newer than what is shown changes nothing.
    it('applies nothing when the viewer is already current', async () => {
      await viewer.join('ABCDE');
      await jest.advanceTimersByTimeAsync(0);
      const before = viewer.payload();

      await viewer.resume();

      expect(viewer.payload()).toBe(before);
    });

    it('does nothing when the viewer has not joined anything', async () => {
      await viewer.resume();

      expect(opened).toHaveLength(0);
      expect(viewer.status()).toBe('idle');
    });

    // The wiring, not just the method.
    it('heals on becoming visible again', async () => {
      await viewer.join('ABCDE');
      await jest.advanceTimersByTimeAsync(0);
      opened[0].state = 'closed';

      document.dispatchEvent(new Event('visibilitychange'));
      await jest.advanceTimersByTimeAsync(0);

      expect(opened).toHaveLength(2);
    });
  });
});
