import { describe, expect, it } from 'vitest';
import { ATR } from 'technicalindicators';
import { atrSeries } from '../../src/indicators/atr';
import type { Bar } from '../../src/types';
import { genBars } from '../fixtures/bars';

/** Build a Bar from OHLC; t/o/v are irrelevant to ATR but the type requires them. */
function bar(i: number, o: number, h: number, l: number, c: number): Bar {
  return { t: i, o, h, l, c, v: 1000 };
}

describe('atrSeries — hand micro-fixture, period 3 (methodology I.5)', () => {
  // Six bars; bar 3 gaps up so its TR is driven by |H − prevC|, not H − L.
  //
  //   i   H     L     C     prevC   TR_i = max(H−L, |H−prevC|, |L−prevC|)
  //   0   11    9     10    —       (no TR: needs previous close)
  //   1   11    10    10.5  10      max(1, |11−10|=1,   |10−10|=0)   = 1
  //   2   11.5  10.5  11    10.5    max(1, |11.5−10.5|=1, |10.5−10.5|=0) = 1
  //   3   14    13    13.5  11      max(1, |14−11|=3,   |13−11|=2)   = 3  ← gap bar
  //   4   14    13    13.5  13.5    max(1, |14−13.5|=0.5, |13−13.5|=0.5) = 1
  //   5   14.5  13.5  14    13.5    max(1, |14.5−13.5|=1, |13.5−13.5|=0) = 1
  //
  // Seed at index 3 (= period): mean(TR_1..TR_3) = (1 + 1 + 3) / 3 = 5/3
  // Wilder: ATR_4 = (5/3 × 2 + 1) / 3 = (13/3) / 3 = 13/9
  //         ATR_5 = (13/9 × 2 + 1) / 3 = (35/9) / 3 = 35/27
  const bars: Bar[] = [
    bar(0, 10, 11, 9, 10),
    bar(1, 10.5, 11, 10, 10.5),
    bar(2, 11, 11.5, 10.5, 11),
    bar(3, 13.5, 14, 13, 13.5), // gap up: TR = |H − prevC| = 3
    bar(4, 13.5, 14, 13, 13.5),
    bar(5, 14, 14.5, 13.5, 14),
  ];

  it('first non-null lands at index = period; values match hand arithmetic', () => {
    const out = atrSeries(bars, 3);
    expect(out).toHaveLength(6);
    expect(out.slice(0, 3)).toEqual([null, null, null]);
    expect(out[3]).toBeCloseTo(5 / 3, 12); // seed = simple mean of first 3 TRs
    expect(out[4]).toBeCloseTo(13 / 9, 12);
    expect(out[5]).toBeCloseTo(35 / 27, 12);
  });

  it('the gap bar TR is |H − prevC| (3), not H − L (1): seed reflects it', () => {
    // Counterfactual: without the gap (all three TRs = 1) the seed would be 1.
    // The actual seed 5/3 ≈ 1.667 proves the gap leg drove TR_3.
    const out = atrSeries(bars, 3);
    expect(out[3]).toBeGreaterThan(1);
    expect(out[3]).toBeCloseTo((1 + 1 + 3) / 3, 12);
  });

  it('bars.length ≤ period yields all nulls (seed needs TRs at indices 1..period)', () => {
    expect(atrSeries(bars.slice(0, 3), 3)).toEqual([null, null, null]);
  });

  it('empty input yields an empty series', () => {
    expect(atrSeries([], 14)).toEqual([]);
  });

  it('rejects non-positive and non-integer periods', () => {
    expect(() => atrSeries(bars, 0)).toThrow(RangeError);
    expect(() => atrSeries(bars, -3)).toThrow(RangeError);
    expect(() => atrSeries(bars, 2.5)).toThrow(RangeError);
  });
});

describe('atrSeries — golden cross-validation vs technicalindicators', () => {
  it("matches ATR.calculate for period 14 on genBars('golden-atr', 300)", () => {
    const period = 14;
    const bars = genBars('golden-atr', 300);
    const ours = atrSeries(bars, period);

    const theirs = ATR.calculate({
      period,
      high: bars.map((b) => b.h),
      low: bars.map((b) => b.l),
      close: bars.map((b) => b.c),
    });

    // Alignment: technicalindicators computes TR from bar 1 (N − 1 values) and
    // Wilder-seeds with the simple mean of the first `period` TRs, so its first
    // output corresponds to our bar index `period` — emissions align one-to-one
    // with our non-null tail (no offset or truncation needed).
    expect(theirs).toHaveLength(bars.length - period);

    for (let i = 0; i < bars.length; i++) {
      if (i < period) {
        expect(ours[i]).toBeNull();
      } else {
        expect(ours[i]).not.toBeNull();
        expect(ours[i]!).toBeCloseTo(theirs[i - period], 6);
      }
    }
  });
});
