/**
 * buildTarget — methodology II.6 / I.10 multi-touch preference / design §5.3.
 * The II.9 worked example is the canonical fixture: its numbers are binding.
 */
import { describe, expect, it } from 'vitest';
import type { Level, Zone } from '../../src/types';
import { DEFAULT_CONFIG } from '../../src/config';
import { buildTarget } from '../../src/plan/target';

const cfg = DEFAULT_CONFIG;

const lvl = (price: number, strength = 1, synthetic = false): Level => ({
  price,
  strength,
  synthetic,
});
const zone = (price: number, strength = 1): Zone => ({ price, strength });

/** II.9 worked example geometry, with risk 3.64 from the stop at 80.96. */
const workedExample = {
  direction: 'long' as const,
  entry: 84.6,
  atr: 2.1,
  risk: 84.6 - 80.96,
  support: lvl(81.9),
  resistance: lvl(89.4),
  zonesAbove: [zone(89.4, 1)],
  zonesBelow: [zone(81.9, 1)],
};

describe('buildTarget — worked example (methodology II.9)', () => {
  it('projects to exactly 91.88 with RR 2.00 and overhead warning', () => {
    const res = buildTarget(workedExample, cfg);
    // structure check (89.40 − 84.60)/3.64 ≈ 1.32 < 1.4 → projection
    // 84.60 + max(2×3.64, 2.5×2.10) = 84.60 + 7.28 = 91.88.
    expect(res.target).toBe(91.88);
    expect(res.reward).toBeCloseTo(7.28, 10);
    expect(res.rr).toBeCloseTo(2.0, 2);
    expect(res.basis).toBe('2R / 2.5×ATR projection');
    expect(res.overheadWarning).toBe(true);
  });
});

describe('buildTarget — structure vs projection (long)', () => {
  it('takes a strong zone at ≥ 1.4R as a structure target with no warning', () => {
    const res = buildTarget(
      { ...workedExample, zonesAbove: [zone(92, 3)], resistance: lvl(92, 3) },
      cfg,
    );
    // (92 − 84.60)/3.64 ≈ 2.03 ≥ 1.4
    expect(res.target).toBe(92);
    expect(res.basis).toBe('structure level');
    expect(res.overheadWarning).toBe(false);
    expect(res.reward).toBeCloseTo(7.4, 10);
    expect(res.rr).toBeCloseTo(7.4 / 3.64, 10);
  });

  it('prefers the first multi-touch zone over a nearer single-touch zone', () => {
    const res = buildTarget(
      {
        ...workedExample,
        zonesAbove: [zone(90.5, 1), zone(93.0, 3)],
        resistance: lvl(90.5, 1),
      },
      cfg,
    );
    // strength-3 zone at 93.00: (93.00 − 84.60)/3.64 ≈ 2.31 ≥ 1.4 → structure.
    expect(res.target).toBe(93);
    expect(res.basis).toBe('structure level');
  });

  it('falls back to the synthetic resistance Level when no zones exist above', () => {
    const res = buildTarget(
      { ...workedExample, zonesAbove: [], resistance: lvl(92, 0, true) },
      cfg,
    );
    expect(res.target).toBe(92);
    expect(res.basis).toBe('structure level');
  });
});

describe('buildTarget — short mirrors exactly', () => {
  /** Worked example flipped around entry; stop 88.24 → risk 3.64. */
  const shortInput = {
    direction: 'short' as const,
    entry: 84.6,
    atr: 2.1,
    risk: 88.24 - 84.6,
    support: lvl(79.8),
    resistance: lvl(87.3),
    zonesAbove: [zone(87.3, 1)],
    zonesBelow: [zone(79.8, 1)],
  };

  it('projects DOWN past the nearby support: entry > target, rr ≈ 2', () => {
    const res = buildTarget(shortInput, cfg);
    // (84.60 − 79.80)/3.64 ≈ 1.32 < 1.4 → 84.60 − max(7.28, 5.25) = 77.32.
    expect(res.target).toBe(77.32);
    expect(res.target).toBeLessThan(shortInput.entry);
    expect(res.reward).toBeCloseTo(7.28, 2);
    expect(res.rr).toBeCloseTo(2.0, 2);
    expect(res.basis).toBe('2R / 2.5×ATR projection');
    expect(res.overheadWarning).toBe(true);
  });

  it('takes a far-enough support zone below as the structure target', () => {
    const res = buildTarget(
      { ...shortInput, zonesBelow: [zone(77, 2)], support: lvl(77, 2) },
      cfg,
    );
    expect(res.target).toBe(77);
    expect(res.basis).toBe('structure level');
    expect(res.overheadWarning).toBe(false);
  });
});
