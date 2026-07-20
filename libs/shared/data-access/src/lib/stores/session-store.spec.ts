import { TestBed } from '@angular/core/testing';
import { SessionStore } from './session-store';

describe('SessionStore', () => {
  function make(): SessionStore {
    TestBed.configureTestingModule({});
    return TestBed.inject(SessionStore);
  }

  it('tracks the current song focus', () => {
    const store = make();
    expect(store.currentSongId()).toBeNull();
    store.setCurrentSong('song-1');
    expect(store.currentSongId()).toBe('song-1');
  });

  it('lets the current song be cleared', () => {
    const store = make();
    store.setCurrentSong('song-1');
    store.setCurrentSong(null);
    expect(store.currentSongId()).toBeNull();
  });
});
