import { describe, expect, it } from 'vitest';
import { BollingerBands } from 'technicalindicators';
import { percentB } from '../../src/indicators/bollinger';
import { genBars } from '../fixtures/bars';

describe('percentB — hand micro-fixtures (methodology I.9)', () => {
  it('computes the worked micro-fixture: closes [2, 4, 4, 6], period 4, mult 2', () => {
    // Mid = (2 + 4 + 4 + 6) / 4 = 4
    // deviations: −2, 0, 0, 2 → Σdev² = 4 + 0 + 0 + 4 = 8
    // σ = √(8 / 4) = √2          (POPULATION stdev: divide by n = 4, not n − 1)
    // Upper = 4 + 2√2 ≈ 6.828427 · Lower = 4 − 2√2 ≈ 1.171573
    // %B = (6 − Lower) / (Upper − Lower) = (2 + 2√2) / (4√2) ≈ 0.8535534
    expect(percentB([2, 4, 4, 6], 4, 2)).toBeCloseTo((2 + 2 * Math.SQRT2) / (4 * Math.SQRT2), 12);
    expect(percentB([2, 4, 4, 6], 4, 2)).toBeCloseTo(0.8535534, 7);
  });

  it('returns 0.5 when the last close sits on the mean', () => {
    // closes [2, 6, 4, 4]: Mid = 4, C = 4 → %B = 0.5 regardless of σ
    // (computed via the division, so float-exact only to ~1e-16)
    expect(percentB([2, 6, 4, 4], 4, 2)).toBeCloseTo(0.5, 12);
  });

  it('exceeds 1 when price pierces the upper band', () => {
    // closes [10, 10, 10, 14], period 4, mult 1:
    // Mid = 11 · deviations −1, −1, −1, 3 → Σdev² = 12 → σ = √(12/4) = √3
    // Upper = 11 + √3 ≈ 12.732 < C = 14 → pierced
    // %B = (14 − (11 − √3)) / (2√3) = (3 + √3) / (2√3) ≈ 1.3660254
    const pb = percentB([10, 10, 10, 14], 4, 1);
    expect(pb).toBeGreaterThan(1);
    expect(pb).toBeCloseTo((3 + Math.sqrt(3)) / (2 * Math.sqrt(3)), 12);
  });

  it('goes below 0 when price pierces the lower band', () => {
    // closes [10, 10, 10, 6], period 4, mult 1:
    // Mid = 9 · deviations 1, 1, 1, −3 → Σdev² = 12 → σ = √3
    // Lower = 9 − √3 ≈ 7.268 > C = 6 → pierced
    // %B = (6 − (9 − √3)) / (2√3) = (√3 − 3) / (2√3) ≈ −0.3660254
    const pb = percentB([10, 10, 10, 6], 4, 1);
    expect(pb).toBeLessThan(0);
    expect(pb).toBeCloseTo((Math.sqrt(3) - 3) / (2 * Math.sqrt(3)), 12);
  });

  it('uses only the trailing `period` closes', () => {
    // Leading values must not affect the window.
    expect(percentB([999, 0.01, 2, 4, 4, 6], 4, 2)).toBeCloseTo(
      percentB([2, 4, 4, 6], 4, 2),
      12,
    );
  });

  it('distinguishes population from sample stdev (the doc formula is law)', () => {
    // Sample stdev of [2, 4, 4, 6] would be √(8/3) ≈ 1.63299 → %B ≈ 0.80618.
    // Population gives 0.8535534; assert we are NOT on the sample value.
    const samplePb = (2 + 2 * Math.sqrt(8 / 3)) / (4 * Math.sqrt(8 / 3));
    expect(percentB([2, 4, 4, 6], 4, 2)).not.toBeCloseTo(samplePb, 2);
  });
});

describe('percentB — guards', () => {
  it('σ = 0 (all window closes equal) returns the documented neutral 0.5', () => {
    expect(percentB([5, 5, 5, 5], 4, 2)).toBe(0.5);
  });

  it('single-bar window (σ = 0) returns 0.5', () => {
    expect(percentB([42], 4, 2)).toBe(0.5);
  });

  it('stdevMult = 0 (zero-width band) returns 0.5', () => {
    expect(percentB([2, 4, 4, 6], 4, 0)).toBe(0.5);
  });

  it('empty input returns 0.5', () => {
    expect(percentB([], 20, 2)).toBe(0.5);
  });

  it('shorter-than-period input uses the available tail (relVol convention)', () => {
    expect(percentB([2, 4, 4, 6], 20, 2)).toBeCloseTo(percentB([2, 4, 4, 6], 4, 2), 12);
  });

  it('rejects non-positive and non-integer periods', () => {
    expect(() => percentB([1, 2, 3], 0, 2)).toThrow(RangeError);
    expect(() => percentB([1, 2, 3], -4, 2)).toThrow(RangeError);
    expect(() => percentB([1, 2, 3], 2.5, 2)).toThrow(RangeError);
  });
});

describe('percentB — golden cross-validation vs technicalindicators', () => {
  // technicalindicators' SD (lib/Utils/SD.js) computes √(Σ(x − mean)² / period) —
  // POPULATION stdev, dividing by n — and its BollingerBands pb is
  // (tick − lower) / (upper − lower). Both conventions match methodology I.9
  // exactly, so direct cross-validation is valid.
  const period = 20;
  const stdevMult = 2;
  const closes = genBars('golden-bb', 200).map((b) => b.c);

  it(`matches BollingerBands pb at every full-window cut of genBars('golden-bb', 200)`, () => {
    const theirs = BollingerBands.calculate({ period, stdDev: stdevMult, values: [...closes] });

    // Their first output lands at input index period − 1.
    expect(theirs).toHaveLength(closes.length - period + 1);

    for (let i = period - 1; i < closes.length; i++) {
      const ours = percentB(closes.slice(0, i + 1), period, stdevMult);
      expect(ours).toBeCloseTo(theirs[i - (period - 1)].pb, 8);
    }
  });
});
