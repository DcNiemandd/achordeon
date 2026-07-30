import { planSongbook } from './songbook-plan';

describe('planSongbook (the sequence both sinks obey)', () => {
  it('puts front matter first, then one numbered sheet per song', () => {
    const plan = planSongbook({
      hasTitlePage: true,
      summaryPages: 1,
      songCount: 2,
    });
    expect(plan.pages).toEqual([
      { kind: 'title', number: null },
      { kind: 'summary', sourceIndex: 0, number: null },
      { kind: 'song', sourceIndex: 0, number: 1 },
      { kind: 'song', sourceIndex: 1, number: 2 },
    ]);
    expect(plan.frontMatter).toBe(2);
  });

  it('makes the first song page 1 — front matter carries no number', () => {
    const plan = planSongbook({
      hasTitlePage: true,
      summaryPages: 2,
      songCount: 3,
    });
    const numbers = plan.pages
      .filter((page) => page.kind === 'song')
      .map((page) => page.number);
    expect(numbers).toEqual([1, 2, 3]);
    expect(plan.frontMatter).toBe(3);
  });

  it('counts no front matter when there is neither title page nor summary', () => {
    const plan = planSongbook({
      hasTitlePage: false,
      summaryPages: 0,
      songCount: 2,
    });
    expect(plan.frontMatter).toBe(0);
    expect(plan.pages).toEqual([
      { kind: 'song', sourceIndex: 0, number: 1 },
      { kind: 'song', sourceIndex: 1, number: 2 },
    ]);
  });

  it('gives each summary sheet its own source index', () => {
    const plan = planSongbook({
      hasTitlePage: false,
      summaryPages: 3,
      songCount: 1,
    });
    expect(plan.pages.filter((page) => page.kind === 'summary')).toEqual([
      { kind: 'summary', sourceIndex: 0, number: null },
      { kind: 'summary', sourceIndex: 1, number: null },
      { kind: 'summary', sourceIndex: 2, number: null },
    ]);
  });

  it('plans an empty book as pure front matter — no numbered pages', () => {
    const plan = planSongbook({
      hasTitlePage: true,
      summaryPages: 0,
      songCount: 0,
    });
    expect(plan.pages).toEqual([{ kind: 'title', number: null }]);
    expect(plan.frontMatter).toBe(1);
  });
});
