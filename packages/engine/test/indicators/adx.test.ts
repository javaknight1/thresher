import { describe, expect, it } from 'vitest';
import { ADX } from 'technicalindicators';
import { adxSeries } from '../../src/indicators/adx';
import { genBars } from '../fixtures/bars';
import type { Bar } from '../../src/types';

function bar(h: number, l: number, c: number, i: number): Bar {
  return { t: i, o: c, h, l, c, v: 1000 };
}

describe('adxSeries — hand micro-fixture, period 2 (methodology I.6 — the authority)', () => {
  // Bars (h, l, c):
  //   t=0: 10,    8,    9
  //   t=1: 11,    9,   10
  //   t=2: 12,   10,   11
  //   t=3: 11.5,  9,   10
  //   t=4: 11,    8.5,  9
  //   t=5: 12,   10,   11.5
  //   t=6: 13,   11,   12.5
  //   t=7: 14,   12,   13.5
  //
  // Per-bar values (t ≥ 1), n = 2:
  //   upMove = H_t − H_(t−1) · downMove = L_(t−1) − L_t
  //   +DM = upMove if (upMove > downMove && upMove > 0) else 0 · −DM mirror
  //   TR = max(H−L, |H−Cprev|, |L−Cprev|)
  //
  // t=1: up = 11−10 = 1 · down = 8−9 = −1 → +DM=1, −DM=0
  //      TR = max(11−9=2, |11−9|=2, |9−9|=0) = 2
  // t=2: up = 12−11 = 1 · down = 9−10 = −1 → +DM=1, −DM=0
  //      TR = max(12−10=2, |12−10|=2, |10−10|=0) = 2
  // t=3: up = 11.5−12 = −0.5 · down = 10−9 = 1 → +DM=0, −DM=1
  //      TR = max(11.5−9=2.5, |11.5−11|=0.5, |9−11|=2) = 2.5
  // t=4: up = 11−11.5 = −0.5 · down = 9−8.5 = 0.5 → +DM=0, −DM=0.5
  //      TR = max(11−8.5=2.5, |11−10|=1, |8.5−10|=1.5) = 2.5
  // t=5: up = 12−11 = 1 · down = 8.5−10 = −1.5 → +DM=1, −DM=0
  //      TR = max(12−10=2, |12−9|=3, |10−9|=1) = 3
  // t=6: up = 13−12 = 1 · down = 10−11 = −1 → +DM=1, −DM=0
  //      TR = max(13−11=2, |13−11.5|=1.5, |11−11.5|=0.5) = 2
  // t=7: up = 14−13 = 1 · down = 11−12 = −1 → +DM=1, −DM=0
  //      TR = max(14−12=2, |14−12.5|=1.5, |12−12.5|=0.5) = 2
  //
  // Wilder smoothing, seed = SUM of first n=2 (bars 1–2), then S = S − S/2 + x:
  //   t=2: S(TR)=2+2=4        · S(+DM)=1+1=2          · S(−DM)=0
  //   t=3: S(TR)=4−2+2.5=4.5  · S(+DM)=2−1+0=1        · S(−DM)=0−0+1=1
  //   t=4: S(TR)=4.5−2.25+2.5=4.75
  //                           · S(+DM)=1−0.5+0=0.5    · S(−DM)=1−0.5+0.5=1
  //   t=5: S(TR)=4.75−2.375+3=5.375
  //                           · S(+DM)=0.5−0.25+1=1.25· S(−DM)=1−0.5+0=0.5
  //   t=6: S(TR)=5.375−2.6875+2=4.6875
  //                           · S(+DM)=1.25−0.625+1=1.625
  //                                                   · S(−DM)=0.5−0.25+0=0.25
  //   t=7: S(TR)=4.6875−2.34375+2=4.34375
  //                           · S(+DM)=1.625−0.8125+1=1.8125
  //                                                   · S(−DM)=0.25−0.125+0=0.125
  //
  // DI = 100×S(DM)/S(TR) · DX = 100×|+DI−−DI|/(+DI+−DI):
  //   t=2: +DI=100×2/4=50          · −DI=0              · DX=100×50/50=100
  //   t=3: +DI=100×1/4.5=22.2222…  · −DI=22.2222…       · DX=0
  //   t=4: +DI=100×0.5/4.75=10.526315…
  //        −DI=100×1/4.75=21.052631…
  //        DX=100×|0.5−1|/(0.5+1)=100/3=33.3333…
  //   t=5: +DI=100×1.25/5.375=23.255813…
  //        −DI=100×0.5/5.375=9.302325…
  //        DX=100×0.75/1.75=300/7=42.857142…
  //   t=6: +DI=100×1.625/4.6875=34.6666…
  //        −DI=100×0.25/4.6875=5.3333…
  //        DX=100×1.375/1.875=220/3=73.3333…
  //   t=7: +DI=100×1.8125/4.34375=41.726618…
  //        −DI=100×0.125/4.34375=2.877697…
  //        DX=100×1.6875/1.9375=2700/31=87.096774…
  //
  // ADX, seed at t = 2n−1 = 3 as simple mean of first n=2 DX values, then
  // ADX = (prev×(n−1) + DX)/n:
  //   t=3: ADX = (100+0)/2 = 50
  //   t=4: ADX = (50×1 + 100/3)/2 = 125/3 = 41.6666…
  //   t=5: ADX = (125/3 + 300/7)/2 = 1775/42 = 42.261904…
  //   t=6: ADX = (1775/42 + 220/3)/2 = 4855/84 = 57.797619…
  //   t=7: ADX = (4855/84 + 2700/31)/2 = 377305/5208 = 72.447196…
  const bars: Bar[] = [
    bar(10, 8, 9, 0),
    bar(11, 9, 10, 1),
    bar(12, 10, 11, 2),
    bar(11.5, 9, 10, 3),
    bar(11, 8.5, 9, 4),
    bar(12, 10, 11.5, 5),
    bar(13, 11, 12.5, 6),
    bar(14, 12, 13.5, 7),
  ];
  const { adx, plusDI, minusDI } = adxSeries(bars, 2);

  it('emits +DI first at bar index = period, ADX first at 2×period − 1', () => {
    expect(plusDI.slice(0, 2)).toEqual([null, null]);
    expect(minusDI.slice(0, 2)).toEqual([null, null]);
    expect(adx.slice(0, 3)).toEqual([null, null, null]);
    expect(plusDI[2]).not.toBeNull();
    expect(adx[3]).not.toBeNull();
  });

  it('matches the hand-computed +DI series', () => {
    const expected = [50, 100 / 4.5, 100 * (0.5 / 4.75), 100 * (1.25 / 5.375), 100 * (1.625 / 4.6875), 100 * (1.8125 / 4.34375)];
    for (let i = 0; i < expected.length; i++) {
      expect(plusDI[2 + i]!).toBeCloseTo(expected[i]!, 10);
    }
  });

  it('matches the hand-computed −DI series', () => {
    const expected = [0, 100 / 4.5, 100 * (1 / 4.75), 100 * (0.5 / 5.375), 100 * (0.25 / 4.6875), 100 * (0.125 / 4.34375)];
    for (let i = 0; i < expected.length; i++) {
      expect(minusDI[2 + i]!).toBeCloseTo(expected[i]!, 10);
    }
  });

  it('matches the hand-computed ADX series (seed = mean of first n DX)', () => {
    const expected = [50, 125 / 3, 1775 / 42, 4855 / 84, 377305 / 5208];
    for (let i = 0; i < expected.length; i++) {
      expect(adx[3 + i]!).toBeCloseTo(expected[i]!, 10);
    }
  });
});

describe('adxSeries — guards and edge cases', () => {
  it('flat bars (TR = 0 forever): DI = 0 and ADX = 0 — never NaN', () => {
    const bars = Array.from({ length: 10 }, (_, i) => bar(5, 5, 5, i));
    const { adx, plusDI, minusDI } = adxSeries(bars, 2);
    for (let i = 2; i < 10; i++) {
      expect(plusDI[i]).toBe(0);
      expect(minusDI[i]).toBe(0);
    }
    for (let i = 3; i < 10; i++) expect(adx[i]).toBe(0);
  });

  it('equal up and down moves produce zero +DM and −DM (strict inequalities)', () => {
    // Every bar expands symmetrically: upMove = downMove = 1 > 0 on each bar,
    // so neither strict inequality holds and both DMs are 0 → DI = 0, DX = 0.
    const bars = Array.from({ length: 8 }, (_, i) => bar(10 + i, 10 - i, 10, i));
    const { adx, plusDI, minusDI } = adxSeries(bars, 2);
    for (let i = 2; i < 8; i++) {
      expect(plusDI[i]).toBe(0);
      expect(minusDI[i]).toBe(0);
    }
    for (let i = 3; i < 8; i++) expect(adx[i]).toBe(0);
  });

  it('input shorter than warm-up yields all nulls; empty input yields empty arrays', () => {
    const short = adxSeries(genBars('adx-short', 5), 14);
    expect(short.adx).toEqual(new Array(5).fill(null));
    expect(short.plusDI).toEqual(new Array(5).fill(null));
    expect(short.minusDI).toEqual(new Array(5).fill(null));

    const empty = adxSeries([], 14);
    expect(empty.adx).toEqual([]);
    expect(empty.plusDI).toEqual([]);
    expect(empty.minusDI).toEqual([]);
  });

  it('rejects non-positive and non-integer periods', () => {
    const bars = genBars('adx-period-guard', 10);
    expect(() => adxSeries(bars, 0)).toThrow(RangeError);
    expect(() => adxSeries(bars, -3)).toThrow(RangeError);
    expect(() => adxSeries(bars, 2.5)).toThrow(RangeError);
  });
});

describe('adxSeries — properties on deterministic synthetic bars', () => {
  for (const seed of ['adx-prop-a', 'adx-prop-b', 'adx-prop-c']) {
    it(`never emits NaN and stays in [0, 100] on genBars('${seed}', 300), period 14`, () => {
      const bars = genBars(seed, 300);
      const period = 14;
      const { adx, plusDI, minusDI } = adxSeries(bars, period);
      expect(adx).toHaveLength(300);
      expect(plusDI).toHaveLength(300);
      expect(minusDI).toHaveLength(300);

      for (let i = 0; i < 300; i++) {
        if (i < period) {
          expect(plusDI[i]).toBeNull();
          expect(minusDI[i]).toBeNull();
        } else {
          expect(Number.isFinite(plusDI[i]!)).toBe(true);
          expect(Number.isFinite(minusDI[i]!)).toBe(true);
          expect(plusDI[i]!).toBeGreaterThanOrEqual(0);
          expect(plusDI[i]!).toBeLessThanOrEqual(100);
          expect(minusDI[i]!).toBeGreaterThanOrEqual(0);
          expect(minusDI[i]!).toBeLessThanOrEqual(100);
        }
        if (i < 2 * period - 1) {
          expect(adx[i]).toBeNull();
        } else {
          expect(Number.isFinite(adx[i]!)).toBe(true);
          expect(adx[i]!).toBeGreaterThanOrEqual(0);
          expect(adx[i]!).toBeLessThanOrEqual(100);
        }
      }
    });
  }
});

describe('adxSeries — cross-validation vs technicalindicators (period 14)', () => {
  // Finding: technicalindicators' ADX uses the same seeding convention as the
  // methodology doc here — its output length is bars.length − (2×period − 1) + 1,
  // i.e. its first value lands exactly at our adxStart index — and the aligned
  // tail agrees to machine precision (max relative diff ≈ 6e-16 observed).
  // The task allows up to 1% relative tolerance for convention drift; we assert
  // a much tighter 1e-9 since the implementations actually coincide.
  const TAIL = 50;
  const REL_TOL = 1e-9;

  it("agrees on the aligned tail of genBars('golden-adx', 400)", () => {
    const bars = genBars('golden-adx', 400);
    const period = 14;
    const ours = adxSeries(bars, period);
    const theirs = ADX.calculate({
      period,
      high: bars.map((b) => b.h),
      low: bars.map((b) => b.l),
      close: bars.map((b) => b.c),
    });

    // Their first output corresponds to bar index 2×period − 1 = 27.
    expect(theirs).toHaveLength(bars.length - (2 * period - 1));

    for (let k = 0; k < TAIL; k++) {
      const i = bars.length - 1 - k;
      const t = theirs[theirs.length - 1 - k]!;
      expect(Math.abs(ours.adx[i]! - t.adx) / Math.abs(t.adx)).toBeLessThanOrEqual(REL_TOL);
      expect(Math.abs(ours.plusDI[i]! - t.pdi) / Math.abs(t.pdi)).toBeLessThanOrEqual(REL_TOL);
      expect(Math.abs(ours.minusDI[i]! - t.mdi) / Math.abs(t.mdi)).toBeLessThanOrEqual(REL_TOL);
    }
  });
});
