import { DEFAULT_TUNING, resolveTuning } from './tuning';

describe('resolveTuning', () => {
  it('returns the defaults untouched when no overrides given', () => {
    expect(resolveTuning()).toBe(DEFAULT_TUNING);
  });

  it('overrides a top-level knob without dropping the rest', () => {
    const t = resolveTuning({ baseSizePx: 24 });
    expect(t.baseSizePx).toBe(24);
    expect(t.fontFamily).toBe(DEFAULT_TUNING.fontFamily);
  });

  it('merges a nested spacing knob, keeping sibling spacing defaults', () => {
    const t = resolveTuning({ spacing: { interBlockGapFactor: 2 } });
    expect(t.spacing.interBlockGapFactor).toBe(2);
    expect(t.spacing.columnGapEm).toBe(DEFAULT_TUNING.spacing.columnGapEm);
  });

  it('merges a single role typography, keeping the other roles', () => {
    const t = resolveTuning({ typography: { chord: { sizeFactor: 0.9 } } });
    expect(t.typography.chord.sizeFactor).toBe(0.9);
    expect(t.typography.chord.weight).toBe(
      DEFAULT_TUNING.typography.chord.weight,
    );
    expect(t.typography.lyric).toEqual(DEFAULT_TUNING.typography.lyric);
  });

  it('does not mutate DEFAULT_TUNING', () => {
    resolveTuning({ baseSizePx: 99, spacing: { columnGapEm: 5 } });
    expect(DEFAULT_TUNING.baseSizePx).toBe(16);
    expect(DEFAULT_TUNING.spacing.columnGapEm).toBe(1.0);
  });
});
