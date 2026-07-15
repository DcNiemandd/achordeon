import { TestBed } from '@angular/core/testing';
import { SessionStore } from './session-store';

describe('SessionStore', () => {
  function make(): SessionStore {
    TestBed.configureTestingModule({});
    return TestBed.inject(SessionStore);
  }

  it('toggles selection membership and tracks the count', () => {
    const store = make();
    store.toggle('a');
    store.toggle('b');
    expect(store.isSelected('a')).toBe(true);
    expect(store.selectionCount()).toBe(2);

    store.toggle('a');
    expect(store.isSelected('a')).toBe(false);
    expect(store.selectionCount()).toBe(1);
  });

  it('clears the whole selection', () => {
    const store = make();
    store.select('a');
    store.select('b');
    store.clearSelection();
    expect(store.selectionCount()).toBe(0);
  });

  it('tracks the current song focus', () => {
    const store = make();
    expect(store.currentSongId()).toBeNull();
    store.setCurrentSong('song-1');
    expect(store.currentSongId()).toBe('song-1');
  });
});
