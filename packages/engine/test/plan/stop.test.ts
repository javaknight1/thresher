/**
 * buildStop — methodology II.5 / design §5.2.
 * The II.9 worked example is the canonical fixture: its numbers are binding.
 */
import { describe, expect, it } from 'vitest';
import type { Level } from '../../src/types';
import { DEFAULT_CONFIG } from '../../src/config';
import { buildStop } from '../../src/plan/stop';

const cfg = DEFAULT_CONFIG;

const lvl = (price: number, strength = 1, synthetic = false): Level => ({
  price,
  strength,
  synthetic,
});

/** II.9 worked example geometry (QQXR, swing). */
const workedExample = {
  direction: 'long' as const,
  entry: 84.6,
  atr: 2.1,
  support: lvl(81.9),
  resistance: lvl(89.4),
};

describe('buildStop — worked example (methodology II.9)', () => {
  it('structure bound wins: stop exactly 80.96, risk ≈ 3.64', () => {
    const res = buildStop(workedExample, cfg);
    // structStop 81.90 − 0.45×2.10 = 80.955; cap 79.98 loses; floor 82.92 loses.
    expect(res.stop).toBe(80.96);
    expect(res.risk).toBeCloseTo(3.64, 10);
  });

  it('basis cites the support anchor with cfg constants interpolated', () => {
    const res = buildStop(workedExample, cfg);
    expect(res.basis).toContain('support $81.90');
    expect(res.basis).toContain('0.45×ATR');
    expect(res.basis).not.toContain('synthetic');
  });
});

describe('buildStop — bound selection (long)', () => {
  it('cap binds when support is very far below entry', () => {
    const res = buildStop({ ...workedExample, support: lvl(60) }, cfg);
    // entry − 2.2×ATR = 84.60 − 4.62 = 79.98
    expect(res.stop).toBe(79.98);
    expect(res.risk).toBeCloseTo(4.62, 10);
    expect(res.basis).toBe('2.2×ATR risk cap (support too far)');
  });

  it('floor binds when support sits just under entry', () => {
    const res = buildStop({ ...workedExample, support: lvl(84.4) }, cfg);
    // entry − 0.8×ATR = 84.60 − 1.68 = 82.92
    expect(res.stop).toBe(82.92);
    expect(res.risk).toBeCloseTo(1.68, 10);
    expect(res.basis).toBe('0.8×ATR noise floor (support too close)');
  });

  it('appends "(synthetic level)" when the anchor is synthetic', () => {
    const res = buildStop({ ...workedExample, support: lvl(81.9, 1, true) }, cfg);
    expect(res.stop).toBe(80.96);
    expect(res.basis).toContain('support $81.90');
    expect(res.basis).toContain('(synthetic level)');
  });
});

describe('buildStop — short mirrors exactly', () => {
  /** Worked example flipped around entry: resistance 87.30 (= entry + 2.70). */
  const shortInput = {
    direction: 'short' as const,
    entry: 84.6,
    atr: 2.1,
    support: lvl(79.8),
    resistance: lvl(87.3),
  };

  it('anchors above resistance: stop > entry, risk ≈ 3.64', () => {
    const res = buildStop(shortInput, cfg);
    // structStop 87.30 + 0.45×2.10 = 88.245 → 88.24; cap 89.22 and floor 86.28 lose.
    expect(res.stop).toBe(88.24);
    expect(res.stop).toBeGreaterThan(shortInput.entry);
    expect(res.risk).toBeCloseTo(3.64, 2);
    expect(res.basis).toContain('resistance $87.30');
    expect(res.basis).toContain('+ 0.45×ATR');
  });

  it('cap binds when resistance is very far above entry', () => {
    const res = buildStop({ ...shortInput, resistance: lvl(110) }, cfg);
    expect(res.stop).toBe(89.22); // entry + 2.2×ATR
    expect(res.basis).toBe('2.2×ATR risk cap (resistance too far)');
  });

  it('floor binds when resistance sits just above entry', () => {
    const res = buildStop({ ...shortInput, resistance: lvl(84.8) }, cfg);
    expect(res.stop).toBe(86.28); // entry + 0.8×ATR
    expect(res.basis).toBe('0.8×ATR noise floor (resistance too close)');
  });
});
