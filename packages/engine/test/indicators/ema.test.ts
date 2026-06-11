import { describe, expect, it } from 'vitest';
import { EMA } from 'technicalindicators';
import { emaSeries } from '../../src/indicators/ema';
import { genBars } from '../fixtures/bars';

describe('emaSeries — hand micro-fixtures (methodology I.2)', () => {
  it('period 3 (k = 0.5): [2, 4, 6] → [2, 3, 4.5]', () => {
    // EMA_0 = 2 (first-value seed); EMA_1 = 4×0.5 + 2×0.5 = 3; EMA_2 = 6×0.5 + 3×0.5 = 4.5
    expect(emaSeries([2, 4, 6], 3)).toEqual([2, 3, 4.5]);
  });

  it('period 4 (k = 0.4, non-trivial): [10, 20, 30] → [10, 14, 20.4]', () => {
    // EMA_0 = 10; EMA_1 = 20×0.4 + 10×0.6 = 14; EMA_2 = 30×0.4 + 14×0.6 = 20.4
    const out = emaSeries([10, 20, 30], 4);
    expect(out).toHaveLength(3);
    expect(out[0]).toBeCloseTo(10, 12);
    expect(out[1]).toBeCloseTo(14, 12);
    expect(out[2]).toBeCloseTo(20.4, 12);
  });

  it('seeds with the first value: EMA_0 = values[0] regardless of period', () => {
    expect(emaSeries([7.25], 26)).toEqual([7.25]);
    expect(emaSeries([5, 5, 5, 5], 12)).toEqual([5, 5, 5, 5]);
  });

  it('returns [] for empty input and one output per input otherwise', () => {
    expect(emaSeries([], 12)).toEqual([]);
    expect(emaSeries([1, 2, 3, 4, 5], 12)).toHaveLength(5);
  });

  it('rejects non-positive or non-integer periods', () => {
    expect(() => emaSeries([1, 2], 0)).toThrow(RangeError);
    expect(() => emaSeries([1, 2], -3)).toThrow(RangeError);
    expect(() => emaSeries([1, 2], 2.5)).toThrow(RangeError);
  });
});

describe('emaSeries — cross-validation vs technicalindicators', () => {
  // Seeding difference, BY DESIGN: methodology I.2 seeds EMA_0 = values[0],
  // while technicalindicators seeds its first EMA with an SMA of the first
  // `period` values (so its output only starts at input index period−1, and
  // its early values differ from ours). The seed discrepancy decays as
  // (1−k)^t — for period 26 over 400 bars it is far below 1e-6 by the tail —
  // so we compare only the LAST 50 values, aligned from the end.
  const closes = genBars('golden-ema', 400).map((b) => b.c);

  for (const period of [12, 26]) {
    it(`period ${period}: last 50 values match to 6 decimal places`, () => {
      const ours = emaSeries(closes, period).slice(-50);
      const theirs = EMA.calculate({ period, values: [...closes] }).slice(-50);
      expect(theirs).toHaveLength(50);
      for (let i = 0; i < 50; i++) {
        expect(ours[i]).toBeCloseTo(theirs[i]!, 6);
      }
    });
  }
});
