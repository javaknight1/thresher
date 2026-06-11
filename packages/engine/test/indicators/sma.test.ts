import { describe, expect, it } from 'vitest';
import { SMA } from 'technicalindicators';
import { smaSeries } from '../../src/indicators/sma';
import { genBars } from '../fixtures/bars';

describe('smaSeries — hand micro-fixtures (methodology I.1)', () => {
  it('computes the worked micro-fixture: smaSeries([1,2,3,4,5], 3)', () => {
    expect(smaSeries([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });

  it('period 1 returns the input values (no warm-up nulls)', () => {
    expect(smaSeries([3, 1, 4, 1.5, 9], 1)).toEqual([3, 1, 4, 1.5, 9]);
  });

  it('period = length yields nulls until the final bar, then the full mean', () => {
    expect(smaSeries([2, 4, 6, 8], 4)).toEqual([null, null, null, 5]);
  });

  it('period > length yields all nulls', () => {
    expect(smaSeries([1, 2, 3], 4)).toEqual([null, null, null]);
  });

  it('empty input yields an empty series', () => {
    expect(smaSeries([], 20)).toEqual([]);
  });

  it('rejects non-positive and non-integer periods', () => {
    expect(() => smaSeries([1, 2, 3], 0)).toThrow(RangeError);
    expect(() => smaSeries([1, 2, 3], -2)).toThrow(RangeError);
    expect(() => smaSeries([1, 2, 3], 2.5)).toThrow(RangeError);
  });
});

describe('smaSeries — golden cross-validation vs technicalindicators', () => {
  const closes = genBars('golden-sma', 300).map((b) => b.c);

  for (const period of [20, 50]) {
    it(`matches SMA.calculate for period ${period} on genBars('golden-sma', 300)`, () => {
      const ours = smaSeries(closes, period);
      const theirs = SMA.calculate({ period, values: [...closes] });

      // technicalindicators emits its first value at input index period − 1.
      expect(theirs).toHaveLength(closes.length - period + 1);

      for (let i = 0; i < closes.length; i++) {
        if (i < period - 1) {
          expect(ours[i]).toBeNull();
        } else {
          expect(ours[i]).not.toBeNull();
          expect(ours[i]!).toBeCloseTo(theirs[i - (period - 1)], 8);
        }
      }
    });
  }
});
