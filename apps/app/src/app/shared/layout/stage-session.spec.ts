// StageSession — Epic 8 ▸ a performance that survives the page
//
// `TestBed.resetTestingModule()` is the reload: it throws away the root injector,
// so the next `inject` builds a session whose only memory is what it wrote down.

import { TestBed } from '@angular/core/testing';
import { Fullscreen } from './fullscreen';
import { StageSession } from './stage-session';

const KEY = 'achordeon.stage';

/** A performance of `total` songs, already opened on `book`. */
function perform(book: string, total: number): StageSession {
  const session = TestBed.inject(StageSession);
  session.start(book);
  session.setTotal(total);
  return session;
}

describe('StageSession', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      // Fullscreen reaches for the DOM and the wake lock; `end()` only needs it
      // to be droppable.
      providers: [
        { provide: Fullscreen, useValue: { exit: async () => undefined } },
      ],
    });
  });

  it('starts with no performance', () => {
    expect(TestBed.inject(StageSession).isPerforming()).toBe(false);
  });

  it('resumes the same song after a reload — the whole point of persisting it', () => {
    const session = perform('book-1', 5);
    session.next();
    session.next();
    expect(session.index()).toBe(2);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Fullscreen, useValue: { exit: async () => undefined } },
      ],
    });
    const resumed = TestBed.inject(StageSession);

    expect(resumed.isPerforming()).toBe(true);
    expect(resumed.bookId()).toBe('book-1');
    expect(resumed.index()).toBe(2);
    // `start` with the book off the URL must be the early return, or the reload
    // silently restarts the book at song 1.
    resumed.start('book-1');
    expect(resumed.index()).toBe(2);
  });

  it('resumes the lobby PIN, so a reload does not strand the audience', () => {
    const session = perform('book-1', 3);
    session.createLobby();
    const pin = session.lobbyPin();
    expect(pin).not.toBe('');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Fullscreen, useValue: { exit: async () => undefined } },
      ],
    });

    expect(TestBed.inject(StageSession).lobbyPin()).toBe(pin);
  });

  it('ends for good — the exit cross must not leave a session to come back to', () => {
    const session = perform('book-1', 3);
    session.next();
    session.end();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Fullscreen, useValue: { exit: async () => undefined } },
      ],
    });
    const after = TestBed.inject(StageSession);

    expect(after.isPerforming()).toBe(false);
    expect(after.lobbyPin()).toBe('');
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('starts a different book from the top', () => {
    const session = perform('book-1', 5);
    session.jumpTo(3);

    session.start('book-2');

    expect(session.index()).toBe(0);
  });

  it('drops a performance older than the resume window', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        bookId: 'book-1',
        index: 4,
        lobbyPin: 'ABCDE',
        savedAt: Date.now() - 13 * 60 * 60 * 1000,
      }),
    );

    const session = TestBed.inject(StageSession);

    expect(session.isPerforming()).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  // A song deleted between sessions makes the stored index unreachable, and an
  // index past the end renders a blank page inside a book that is not empty.
  it('clamps a stored index to the book that came back', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        bookId: 'book-1',
        index: 9,
        lobbyPin: '',
        savedAt: Date.now(),
      }),
    );

    const session = TestBed.inject(StageSession);
    session.start('book-1');
    session.setTotal(3);

    expect(session.index()).toBe(2);
  });

  it('falls back to no performance rather than failing a boot on bad storage', () => {
    localStorage.setItem(KEY, '{ not json');

    expect(() => TestBed.inject(StageSession).isPerforming()).not.toThrow();
    expect(TestBed.inject(StageSession).isPerforming()).toBe(false);
  });
});
