import { describe, expect, it } from 'vitest';
// technicalindicators: dev-dependency, cross-validation in tests ONLY (CLAUDE.md).
import { AverageGain, AverageLoss, RSI } from 'technicalindicators';
import { rsiSeries } from '../../src/indicators/rsi';
import { genBars } from '../fixtures/bars';

describe('rsiSeries — methodology I.4 (Wilder)', () => {
  it('hand micro-fixture, period 3: simple seed then Wilder smoothing', () => {
    // closes:   10    11    10.5   11.5   12    11    12.5
    // change:        +1.0  −0.5   +1.0  +0.5  −1.0  +1.5
    const closes = [10, 11, 10.5, 11.5, 12, 11, 12.5];
    const out = rsiSeries(closes, 3);

    expect(out).toHaveLength(7);
    // null before index = period (first RSI uses changes 1..3, lands at index 3)
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
    expect(out[2]).toBeNull();

    // ── Seed bar (index 3): simple averages of the first 3 gains/losses ──
    // AvgGain = (1 + 0 + 1) / 3 = 2/3
    // AvgLoss = (0 + 0.5 + 0) / 3 = 1/6
    // RS = (2/3) / (1/6) = 4 → RSI = 100 − 100/(1+4) = 80
    expect(out[3]).toBeCloseTo(80, 12);

    // ── Wilder bar (index 4): gain 0.5, loss 0 ──
    // AvgGain = (2/3 × 2 + 0.5) / 3 = (4/3 + 1/2) / 3 = (11/6)/3 = 11/18
    // AvgLoss = (1/6 × 2 + 0)   / 3 = (1/3)/3 = 1/9
    // RS = (11/18)/(1/9) = 11/2 = 5.5 → RSI = 100 − 100/6.5 = 1100/13 ≈ 84.6153846…
    expect(out[4]).toBeCloseTo(1100 / 13, 12);

    // ── Wilder bar (index 5): gain 0, loss 1 ──
    // AvgGain = (11/18 × 2 + 0) / 3 = (11/9)/3 = 11/27
    // AvgLoss = (1/9 × 2 + 1)  / 3 = (11/9)/3 = 11/27
    // RS = 1 → RSI = 100 − 100/2 = 50
    expect(out[5]).toBeCloseTo(50, 12);

    // ── Wilder bar (index 6): gain 1.5, loss 0 ──
    // AvgGain = (11/27 × 2 + 1.5) / 3 = (22/27 + 3/2)/3 = (125/54)/3 = 125/162
    // AvgLoss = (11/27 × 2 + 0)   / 3 = (22/27)/3 = 22/81
    // RS = (125/162)/(22/81) = 125/44 → RSI = 100 − 100/(1 + 125/44)
    //    = 100 − 4400/169 = 12500/169 ≈ 73.9644970…
    expect(out[6]).toBeCloseTo(12500 / 169, 12);
  });

  it('all-gains series → RSI = 100 exactly (AvgLoss = 0 branch)', () => {
    const closes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const out = rsiSeries(closes, 3);
    for (let i = 0; i < out.length; i++) {
      if (i < 3) expect(out[i]).toBeNull();
      else expect(out[i]).toBe(100);
    }
  });

  it('all-losses series → RSI = 0 (AvgGain → 0, RS = 0)', () => {
    const closes = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
    const out = rsiSeries(closes, 3);
    for (let i = 0; i < out.length; i++) {
      if (i < 3) expect(out[i]).toBeNull();
      else expect(out[i]).toBe(0);
    }
  });

  it('returns all nulls when there are not enough closes for one RSI', () => {
    expect(rsiSeries([1, 2, 3], 3)).toEqual([null, null, null]);
    expect(rsiSeries([], 14)).toEqual([]);
  });

  describe('cross-validation vs technicalindicators (period 14, genBars golden-rsi ×300)', () => {
    const period = 14;
    const closes = genBars('golden-rsi', 300).map((b) => b.c);
    const ours = rsiSeries(closes, period);

    it('aligns with their RSI output within its hard-coded 2-decimal rounding', () => {
      // technicalindicators' RSI is Wilder with the same simple-average seed, but
      // its final step is hard-coded `parseFloat((100 - 100/(1+RS)).toFixed(2))`
      // (dist/index.js, RSI generator) — the precision config does not reach it.
      // So a 1e-6 comparison against their RSI output is unattainable by
      // construction: this is output quantization, not a formula offset. We
      // assert exact alignment (their value k ↔ our index k + period) within the
      // half-step of their rounding (0.005), and prove 1e-6 agreement against
      // their unrounded averages in the next test.
      const theirs = RSI.calculate({ values: closes, period });
      expect(theirs).toHaveLength(closes.length - period);
      for (let k = 0; k < theirs.length; k++) {
        expect(ours[k + period]).not.toBeNull();
        expect(Math.abs((ours[k + period] as number) - theirs[k])).toBeLessThanOrEqual(
          0.005 + 1e-9,
        );
      }
    });

    it('matches RSI rebuilt from their unrounded AverageGain/AverageLoss to 1e-6', () => {
      // AverageGain/AverageLoss are the library's actual Wilder engine (simple
      // seed + Wilder smoothing, identical to methodology I.4). They accept a
      // custom `format`, so an identity format yields full-precision averages;
      // applying the I.4 closing formula to them recovers what their RSI would
      // emit without the toFixed(2).
      const identity = (x: number): number => x;
      const gains = AverageGain.calculate({ values: closes, period, format: identity });
      const losses = AverageLoss.calculate({ values: closes, period, format: identity });
      expect(gains).toHaveLength(closes.length - period);
      expect(losses).toHaveLength(closes.length - period);
      for (let k = 0; k < gains.length; k++) {
        const expected = losses[k] === 0 ? 100 : 100 - 100 / (1 + gains[k] / losses[k]);
        expect(ours[k + period]).toBeCloseTo(expected, 6);
      }
    });
  });
});
