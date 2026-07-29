import { starterLibrary } from './seed';

// No database here on purpose: `starterLibrary` is a pure builder, and whether an
// empty library gets these rows is `applyFirstRun`'s decision and its spec's
// subject. What is left to check is the content's internal consistency.

describe('starterLibrary', () => {
  it('builds songs and at least one songbook', () => {
    const { songs, books } = starterLibrary(1000000);

    expect(songs.length).toBeGreaterThan(1);
    expect(books.length).toBeGreaterThan(0);
  });

  it('links every songbook entry to a real song id', () => {
    const { songs, books } = starterLibrary(1000000);
    const ids = new Set(songs.map((s) => s.id));

    for (const book of books) {
      expect(book.entries.length).toBeGreaterThan(0);
      for (const entry of book.entries) {
        expect(ids.has(entry)).toBe(true);
      }
    }
  });

  it('stamps every song behind `now`, in descending order', () => {
    // `now` belongs to the guide song, which has to stay the most recently changed
    // row so `autoSelect` opens the tour. These sit behind it, spread rather than
    // tied so "recently changed" is a real order.
    const now = 1000000;
    const { songs } = starterLibrary(now);

    for (const song of songs) {
      expect(song.updatedAt).toBeLessThan(now);
      expect(song.createdAt).toBe(song.updatedAt);
      expect(song.deletedAt).toBeNull();
    }
    const stamps = songs.map((s) => s.updatedAt);
    expect(stamps).toEqual([...stamps].sort((a, b) => b - a));
    expect(new Set(stamps).size).toBe(stamps.length);
  });

  it('gives every song a cache matching its own title markers', () => {
    // The cache is authored here rather than parsed, so nothing but this test stops
    // the list showing one title and the render pane another.
    for (const song of starterLibrary(1000000).songs) {
      const [titleLine, subtitleLine] = song.content.split('\n');
      expect(titleLine).toBe(`* ${song.cache.title}`);
      expect(subtitleLine).toBe(`** ${song.cache.subtitle}`);
    }
  });

  it('hands back fresh ids on every call', () => {
    const first = starterLibrary(1000000).songs.map((s) => s.id);
    const second = starterLibrary(1000000).songs.map((s) => s.id);

    expect(new Set([...first, ...second]).size).toBe(
      first.length + second.length,
    );
  });
});
