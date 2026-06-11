import { describe, expect, it } from 'vitest';
import { relVol } from '../../src/indicators/relative-volume';
import { DEFAULT_CONFIG } from '../../src/config';
import { genBars } from '../fixtures/bars';

const { shortBars, longBars } = DEFAULT_CONFIG.indicators.relVol;

describe('relVol (methodology I.8)', () => {
  it('reads elevated (> 1.2) when the recent tape runs hot', () => {
    // 15 bars at 100 then 5 bars at 200:
    // short mean = 200, long mean = (15*100 + 5*200) / 20 = 125 → 1.6
    const volumes = [...Array<number>(15).fill(100), ...Array<number>(5).fill(200)];
    const rv = relVol(volumes, shortBars, longBars);
    expect(rv).toBeCloseTo(1.6, 12);
    expect(rv).toBeGreaterThan(1.2);
  });

  it('reads thin (< 0.8) when recent participation dries up', () => {
    // 15 bars at 100 then 5 bars at 50:
    // short mean = 50, long mean = (15*100 + 5*50) / 20 = 87.5 → 0.5714…
    const volumes = [...Array<number>(15).fill(100), ...Array<number>(5).fill(50)];
    const rv = relVol(volumes, shortBars, longBars);
    expect(rv).toBeCloseTo(50 / 87.5, 12);
    expect(rv).toBeLessThan(0.8);
  });

  it('is exactly 1.0 on perfectly uniform volume', () => {
    const volumes = Array<number>(20).fill(100);
    expect(relVol(volumes, shortBars, longBars)).toBe(1);
  });

  it('only the trailing long window matters — earlier bars are ignored', () => {
    // 30 bars: huge ancient volume must not leak into a 5/20 ratio.
    const volumes = [...Array<number>(10).fill(1e9), ...Array<number>(20).fill(100)];
    expect(relVol(volumes, shortBars, longBars)).toBe(1);
  });

  it('guards a zero long-window mean by returning 1 (neutral)', () => {
    expect(relVol(Array<number>(20).fill(0), shortBars, longBars)).toBe(1);
    expect(relVol([], shortBars, longBars)).toBe(1);
  });

  it('uses the available tail when input is shorter than the long window', () => {
    // 8 volumes: short window = last 5, long window = all 8 (documented behavior).
    const volumes = [100, 100, 100, 100, 200, 200, 200, 200];
    const shortMean = (100 + 200 * 4) / 5; // 180
    const longMean = (100 * 4 + 200 * 4) / 8; // 150
    expect(relVol(volumes, shortBars, longBars)).toBeCloseTo(shortMean / longMean, 12);
  });

  it('is exactly 1 when input is shorter than even the short window', () => {
    // Both windows collapse to the same 3 bars → ratio 1.
    expect(relVol([70, 90, 110], shortBars, longBars)).toBe(1);
  });

  it('matches a direct trailing-mean computation on deterministic bars', () => {
    const bars = genBars('relvol-cross-check', 60);
    const volumes = bars.map((b) => b.v);
    const tailMean = (xs: number[], n: number): number => {
      const tail = xs.slice(-n);
      return tail.reduce((a, b) => a + b, 0) / tail.length;
    };
    const expected = tailMean(volumes, 5) / tailMean(volumes, 20);
    expect(relVol(volumes, shortBars, longBars)).toBeCloseTo(expected, 12);
  });
});
