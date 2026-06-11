import { describe, expect, it } from 'vitest';
import { OBV } from 'technicalindicators';
import type { Bar } from '../../src/types';
import { obvDelta, obvSeries } from '../../src/indicators/obv';
import { genBars } from '../fixtures/bars';

/** Minimal bar: only `c` and `v` matter for OBV. */
function bar(c: number, v: number, i: number): Bar {
  return { t: i, o: c, h: c, l: c, c, v };
}

/**
 * Hand micro-fixture covering up / down / equal closes.
 *
 *   i  close   vol   move          OBV
 *   0  10.0     50   (seed)           0
 *   1  11.0    100   up    → +100   100
 *   2  10.5    200   down  → −200  −100
 *   3  10.5    300   equal → ±0    −100
 *   4  12.0    400   up    → +400   300
 *   5  11.0    500   down  → −500  −200
 */
const MICRO: Bar[] = [
  bar(10, 50, 0),
  bar(11, 100, 1),
  bar(10.5, 200, 2),
  bar(10.5, 300, 3),
  bar(12, 400, 4),
  bar(11, 500, 5),
];

describe('obvSeries', () => {
  it('matches the hand-computed micro-fixture (up/down/equal closes, OBV_0 = 0)', () => {
    expect(obvSeries(MICRO)).toEqual([0, 100, -100, -100, 300, -200]);
  });

  it('returns [] for no bars and [0] for a single bar', () => {
    expect(obvSeries([])).toEqual([]);
    expect(obvSeries([bar(10, 50, 0)])).toEqual([0]);
  });
});

describe('obvDelta', () => {
  it('computes last − value deltaBars earlier (no clamping)', () => {
    // OBV_5 − OBV_4 = −200 − 300 = −500
    expect(obvDelta(MICRO, 1)).toBe(-500);
    // OBV_5 − OBV_2 = −200 − (−100) = −100
    expect(obvDelta(MICRO, 3)).toBe(-100);
    // OBV_5 − OBV_0 = −200 − 0 = −200 (exactly reaches index 0)
    expect(obvDelta(MICRO, 5)).toBe(-200);
  });

  it('clamps the earlier index to 0 when the lookback exceeds the series', () => {
    // last − deltaBars = 5 − 20 = −15 → clamped to index 0: −200 − 0 = −200
    expect(obvDelta(MICRO, 20)).toBe(-200);
    // single bar: 0 − 0 = 0
    expect(obvDelta([bar(10, 50, 0)], 20)).toBe(0);
  });

  it('returns 0 for empty input', () => {
    expect(obvDelta([], 20)).toBe(0);
  });
});

describe('cross-validation vs technicalindicators', () => {
  it('bar-to-bar differences match on genBars("golden-obv", 300)', () => {
    const bars = genBars('golden-obv', 300);
    const ours = obvSeries(bars);
    const theirs = OBV.calculate({
      close: bars.map((b) => b.c),
      volume: bars.map((b) => b.v),
    });

    // Starting conventions differ (technicalindicators emits n−1 values, first
    // covering bar 1), so compare bar-to-bar DIFFERENCES, which are convention-
    // free, aligned from the end of each series.
    const diffs = (xs: number[]) => xs.slice(1).map((x, i) => x - xs[i]);
    const ourDiffs = diffs(ours);
    const theirDiffs = diffs(theirs);
    const n = Math.min(ourDiffs.length, theirDiffs.length);
    expect(n).toBeGreaterThan(250);

    for (let k = 1; k <= n; k++) {
      expect(ourDiffs[ourDiffs.length - k]).toBeCloseTo(theirDiffs[theirDiffs.length - k], 6);
    }
  });
});
