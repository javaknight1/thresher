import { describe, expect, it } from 'vitest';
import { MACD } from 'technicalindicators';
import { macdSeries } from '../../src/indicators/macd';
import { emaSeries } from '../../src/indicators/ema';
import { genBars } from '../fixtures/bars';

describe('macdSeries — self-consistency micro (methodology I.3)', () => {
  // closes = [10, 11, 9, 12], fast 2 (k = 2/3), slow 3 (k = 1/2), signal 2.
  const closes = [10, 11, 9, 12];
  const { line, signal, hist } = macdSeries(closes, 2, 3, 2);

  it('line = EMA_fast(C) − EMA_slow(C) at every index', () => {
    const fast = emaSeries(closes, 2);
    const slow = emaSeries(closes, 3);
    expect(line).toHaveLength(closes.length);
    for (let t = 0; t < closes.length; t++) {
      expect(line[t]).toBeCloseTo(fast[t]! - slow[t]!, 12);
    }
  });

  it('signal = EMA_signalPeriod(line) at every index', () => {
    expect(signal).toEqual(emaSeries(line, 2));
  });

  it('hand-computed early values: seeds collapse to 0, then diverge', () => {
    // EMA_fast: 10, 11×(2/3) + 10×(1/3) = 32/3 · EMA_slow: 10, 10.5
    // line_0 = 0 (both EMAs seed with C_0) · line_1 = 32/3 − 10.5 = 1/6
    // signal_0 = 0 · signal_1 = (1/6)×(2/3) + 0×(1/3) = 1/9
    // hist_1 = 1/6 − 1/9 = 1/18
    expect(line[0]).toBe(0);
    expect(line[1]).toBeCloseTo(1 / 6, 12);
    expect(signal[1]).toBeCloseTo(1 / 9, 12);
    expect(hist[0]).toBe(0);
    expect(hist[1]).toBeCloseTo(1 / 18, 12);
  });

  it('returns empty series for empty input', () => {
    expect(macdSeries([], 12, 26, 9)).toEqual({ line: [], signal: [], hist: [] });
  });
});

describe('macdSeries — worked-example shape', () => {
  it('hist = line − signal at every index, one output per input bar', () => {
    const closes = genBars('macd-shape', 120).map((b) => b.c);
    const { line, signal, hist } = macdSeries(closes, 12, 26, 9);
    expect(line).toHaveLength(closes.length);
    expect(signal).toHaveLength(closes.length);
    expect(hist).toHaveLength(closes.length);
    for (let t = 0; t < closes.length; t++) {
      expect(hist[t]).toBeCloseTo(line[t]! - signal[t]!, 12);
    }
  });
});

describe('macdSeries — cross-validation vs technicalindicators', () => {
  // Seeding difference, BY DESIGN: methodology I.2 seeds every EMA with its
  // first input value, while technicalindicators seeds with an SMA of the
  // first `period` values. The discrepancy decays geometrically — slowest
  // term is (1 − 2/27)^t for the 26-EMA, compounded once more through the
  // 9-EMA signal pass — and is far below 1e-8 by bar 400. We therefore
  // compare only the LAST 50 values, aligned from the end, at 4 decimal
  // places (the tolerance the task fixes; comfortably above the residual).
  const closes = genBars('golden-macd', 400).map((b) => b.c);
  const ours = macdSeries(closes, 12, 26, 9);
  const theirs = MACD.calculate({
    values: [...closes],
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });

  it('last 50 MACD / signal / histogram values match to 4 decimal places', () => {
    expect(theirs.length).toBeGreaterThanOrEqual(50);
    for (let i = 0; i < 50; i++) {
      const t = closes.length - 50 + i; // ti's last output aligns with the last close
      const ref = theirs[theirs.length - 50 + i]!;
      expect(ref.MACD).toBeDefined();
      expect(ref.signal).toBeDefined();
      expect(ref.histogram).toBeDefined();
      expect(ours.line[t]).toBeCloseTo(ref.MACD!, 4);
      expect(ours.signal[t]).toBeCloseTo(ref.signal!, 4);
      expect(ours.hist[t]).toBeCloseTo(ref.histogram!, 4);
    }
  });
});
