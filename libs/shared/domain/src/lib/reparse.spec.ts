import type { SongAst } from './ast';
import { FakeChordTheory } from './fake-chord-theory.fake';
import { createReparser } from './reparse';

const theory = new FakeChordTheory();

describe('createReparser', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('debounces: only the last content is parsed, once, after the delay', () => {
    const seen: SongAst[] = [];
    const r = createReparser(theory, (ast) => seen.push(ast), 80);

    r.schedule('* One');
    r.schedule('* Two');
    r.schedule('* Three');
    jest.advanceTimersByTime(79);
    expect(seen).toHaveLength(0);

    jest.advanceTimersByTime(1);
    expect(seen).toHaveLength(1);
    expect(seen[0].title).toBe('Three');
  });

  it('flush parses the pending content immediately', () => {
    const seen: SongAst[] = [];
    const r = createReparser(theory, (ast) => seen.push(ast), 80);

    r.schedule('* Now');
    r.flush();
    expect(seen).toHaveLength(1);
    expect(seen[0].title).toBe('Now');

    // The debounce timer must not fire a second time afterwards.
    jest.advanceTimersByTime(200);
    expect(seen).toHaveLength(1);
  });

  it('flush with nothing pending is a no-op', () => {
    const seen: SongAst[] = [];
    createReparser(theory, (ast) => seen.push(ast)).flush();
    expect(seen).toHaveLength(0);
  });

  it('cancel prevents a scheduled parse from firing', () => {
    const seen: SongAst[] = [];
    const r = createReparser(theory, (ast) => seen.push(ast), 80);

    r.schedule('* Dropped');
    r.cancel();
    jest.advanceTimersByTime(200);
    expect(seen).toHaveLength(0);
  });
});
