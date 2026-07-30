import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '@thresher/engine';
import { setupScore, type SetupScoreInput } from '../lib/setup-score';

const evMin = DEFAULT_CONFIG.gates.evMargin;
const rrMin = DEFAULT_CONFIG.gates.minRR;

const base: SetupScoreInput = {
  ev: 1.5,
  confidence: 70,
  rr: 2.5,
  earningsInWindow: false,
  overheadWarning: false,
};

describe('setupScore', () => {
  it('returns an integer in [0, 100]', () => {
    const s = setupScore(base);
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
  });

  it('is monotonic in EV, agreement, and R:R', () => {
    const s0 = setupScore(base);
    expect(setupScore({ ...base, ev: base.ev + 0.5 })).toBeGreaterThan(s0);
    expect(setupScore({ ...base, confidence: base.confidence + 10 })).toBeGreaterThan(s0);
    expect(setupScore({ ...base, rr: base.rr + 0.5 })).toBeGreaterThan(s0);
  });

  it('deducts for earnings, overhead, and outlier R:R', () => {
    const s0 = setupScore(base);
    expect(setupScore({ ...base, earningsInWindow: true })).toBeLessThan(s0);
    expect(setupScore({ ...base, overheadWarning: true })).toBeLessThan(s0);
    // rr 5.9 vs 6 both saturate the R:R term, so the only difference is the
    // outlier deduction that kicks in at the outlier threshold.
    expect(setupScore({ ...base, rr: 6 })).toBeLessThan(setupScore({ ...base, rr: 5.9 }));
  });

  it('scores a barely-passing setup low and a strong one high', () => {
    const weak = setupScore({
      ev: evMin,
      confidence: 35,
      rr: rrMin,
      earningsInWindow: false,
      overheadWarning: false,
    });
    const strong = setupScore({
      ev: 3,
      confidence: 95,
      rr: 3.5,
      earningsInWindow: false,
      overheadWarning: false,
    });
    expect(weak).toBeLessThan(40);
    expect(strong).toBeGreaterThan(85);
    expect(strong).toBeGreaterThan(weak);
  });
});
