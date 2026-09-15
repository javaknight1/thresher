import { describe, it, expect } from 'vitest';
import { positionSize } from '../lib/position-size';

describe('positionSize', () => {
  it('sizes a long: floors shares so actual risk ≤ intended', () => {
    // $10,000 account, risk 1% = $100. Entry 120, stop 114 → $6/share risk.
    // 100 / 6 = 16.67 → 16 shares. Actual risk 16×6 = $96.
    const r = positionSize({ accountSize: 10_000, riskPct: 1, entry: 120, stop: 114 });
    expect(r).not.toBeNull();
    expect(r!.riskPerShare).toBe(6);
    expect(r!.dollarRisk).toBe(100);
    expect(r!.shares).toBe(16);
    expect(r!.positionValue).toBe(16 * 120);
    expect(r!.actualRisk).toBe(96);
    expect(r!.actualRisk).toBeLessThanOrEqual(r!.dollarRisk);
    expect(r!.positionPct).toBeCloseTo((1920 / 10_000) * 100);
  });

  it('works for a short (stop above entry) via absolute risk-per-share', () => {
    const r = positionSize({ accountSize: 10_000, riskPct: 2, entry: 50, stop: 52 });
    expect(r!.riskPerShare).toBe(2);
    expect(r!.shares).toBe(100); // 200 / 2
  });

  it('returns null for incomplete/invalid inputs', () => {
    expect(positionSize({ accountSize: 0, riskPct: 1, entry: 100, stop: 95 })).toBeNull();
    expect(positionSize({ accountSize: 10_000, riskPct: 0, entry: 100, stop: 95 })).toBeNull();
    expect(positionSize({ accountSize: 10_000, riskPct: 1, entry: 100, stop: 100 })).toBeNull();
  });
});
