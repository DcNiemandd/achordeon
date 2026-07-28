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

  // The audience action is one control drawn by two chromes (the perform page's
  // top bar and the shell's bottom-bar menu), and it used to offer "create" to a
  // performer who was already hosting. The word is derived here so both say it.
  describe('the audience action', () => {
    it('offers to create one while no lobby is live', () => {
      const session = perform('book-1', 3);

      expect(session.audienceState()).toBe('closed');
      expect(session.audienceLabel()).toBe('Create an audience');
    });

    it('still offers to create one while the create panel is open', () => {
      const session = perform('book-1', 3);
      session.openAudience();

      expect(session.audienceState()).toBe('create');
      expect(session.audienceLabel()).toBe('Create an audience');
    });

    it('switches to managing the moment a lobby exists', () => {
      const session = perform('book-1', 3);
      session.openAudience();
      session.createLobby();

      expect(session.audienceState()).toBe('active');
      expect(session.audienceLabel()).toBe('Manage audience');
    });

    // Closing the panel keeps the lobby, so the button must keep saying so.
    it('keeps managing after the panel is closed on a live lobby', () => {
      const session = perform('book-1', 3);
      session.createLobby();
      session.closeAudience();

      expect(session.audienceState()).toBe('closed');
      expect(session.audienceLabel()).toBe('Manage audience');
    });

    it('counts the listeners once there are any', () => {
      const session = perform('book-1', 3);
      session.createLobby();
      session.setAudienceCount(3);

      expect(session.audienceLabel()).toBe('Manage audience (3 listening)');
    });

    // A count with no lobby is stale by definition, and "0 listening" is noise
    // on a lobby nobody has joined yet.
    it('says nothing about a count of nobody', () => {
      const session = perform('book-1', 3);
      session.createLobby();
      session.setAudienceCount(0);

      expect(session.audienceLabel()).toBe('Manage audience');
    });

    it('goes back to the create wording when the lobby ends', () => {
      const session = perform('book-1', 3);
      session.createLobby();
      session.setAudienceCount(2);
      session.endLobby();

      expect(session.audienceLabel()).toBe('Create an audience');
    });

    // A reload resurrects the PIN, so it must resurrect the wording with it —
    // otherwise the button invites the performer to start a second lobby over
    // the one the durable row is still holding open.
    it('comes back managing after a reload that resumed a lobby', () => {
      perform('book-1', 3).createLobby();

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          { provide: Fullscreen, useValue: { exit: async () => undefined } },
        ],
      });

      expect(TestBed.inject(StageSession).audienceLabel()).toBe(
        'Manage audience',
      );
    });
  });

  it('falls back to no performance rather than failing a boot on bad storage', () => {
    localStorage.setItem(KEY, '{ not json');

    expect(() => TestBed.inject(StageSession).isPerforming()).not.toThrow();
    expect(TestBed.inject(StageSession).isPerforming()).toBe(false);
  });
});
