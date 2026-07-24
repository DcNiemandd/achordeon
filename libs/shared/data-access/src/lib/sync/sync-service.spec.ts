import type { Song } from '@achordeon/shared/domain';
import { changedSince } from './sync-service';

function song(id: string, updatedAt: number): Song {
  return {
    id,
    createdAt: 0,
    updatedAt,
    deletedAt: null,
    name: id,
    content: '',
    favorite: false,
    settings: {},
    cache: { title: '', subtitle: '' },
  };
}

describe('changedSince', () => {
  it('keeps only rows edited strictly after the watermark', () => {
    const data = {
      user: [],
      songs: [song('a', 5), song('b', 10), song('c', 11)],
      songbooks: [],
    };
    expect(changedSince(data, 10).songs.map((s) => s.id)).toEqual(['c']);
  });

  it('is empty when nothing moved past the watermark', () => {
    const data = { user: [], songs: [song('a', 3)], songbooks: [] };
    expect(changedSince(data, 10).songs).toEqual([]);
  });
});
