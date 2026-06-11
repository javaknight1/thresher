/**
 * THE canonical fixture: methodology II.9 worked example, reproduced exactly,
 * plus its counterfactual. If the engine disagrees with these numbers, the
 * engine is wrong (CLAUDE.md). Do not adjust expectations — debug the engine
 * against the doc's step-by-step arithmetic.
 */
import { describe, expect, it } from 'vitest';
import type { Context, IndicatorSnapshot } from '../src/types';
import { DEFAULT_CONFIG } from '../src/config';
import { determine } from '../src/analyze';
import { compositeScore, resolveDirection } from '../src/composite';
import { computeConfidence } from '../src/confidence';
import { evaluateGates } from '../src/gates';

/** Indicator readings published in methodology II.9 (ticker QQXR, swing/daily). */
const SNAPSHOT: IndicatorSnapshot = {
  close: 84.6,
  sma20: 82.9,
  sma50: 80.4,
  sma50Prev: 79.8,
  rsi: 61,
  macd: { line: 0.92, signal: 0.71, hist: 0.21, histPrev: 0.13 },
  atr: 2.1,
  adx: 24,
  obvDelta: 1_000_000, // "OBV Δ20 > 0"
  priceDelta: 4.2, // "price Δ20 > 0"
  relVol: 0.76,
  percentB: 0.74,
  support: { price: 81.9, strength: 1, synthetic: false },
  resistance: { price: 89.4, strength: 1, synthetic: false },
  zonesAbove: [{ price: 89.4, strength: 1 }],
  zonesBelow: [{ price: 81.9, strength: 1 }],
};

const CTX: Context = { symbol: 'QQXR', timeframe: 'swing', tradingDaysToEarnings: null };

describe('methodology II.9 worked example', () => {
  const result = determine(SNAPSHOT, DEFAULT_CONFIG, CTX);

  it('scores the families exactly as published', () => {
    const byKey = Object.fromEntries(result.families.map((f) => [f.key, f.score]));
    expect(byKey.trend).toBeCloseTo(0.8, 10); // raw 1.0 × 0.8 (ADX 24, developing)
    expect(byKey.momentum).toBeCloseTo(0.9, 10);
    expect(byKey.volume).toBeCloseTo(0.5, 10);
    expect(byKey.structure).toBeCloseTo(0.6, 10);
  });

  it('composite S = +0.745 → LONG at G1', () => {
    expect(result.composite).toBeCloseTo(0.745, 10);
    expect(result.direction).toBe('long');
  });

  it('confidence 86 (HIGH) with a single −5 thin-volume penalty', () => {
    expect(result.confidence.score).toBe(86); // base 90.875 − 5 = 85.875 → 86
    expect(result.confidence.bucket).toBe('high');
    expect(result.confidence.penalties).toHaveLength(1);
    expect(result.confidence.penalties[0].points).toBe(-5);
    expect(result.confidence.penalties[0].reason).toMatch(/thin volume/i);
  });

  it('stop 80.96 from structure (cap 79.98 and floor 82.92 not binding)', () => {
    expect(result.plan).not.toBeNull();
    expect(result.plan!.stop).toBe(80.96); // 81.90 − 0.45×2.10 = 80.955 → cents
    expect(result.plan!.risk).toBeCloseTo(3.64, 10);
    expect(result.plan!.riskPct).toBeCloseTo(4.3, 2);
    expect(result.plan!.stopBasis).toContain('$81.90');
  });

  it('target 91.88 via 2R projection with overheadWarning (struct check 1.32 < 1.4)', () => {
    expect(result.plan!.target).toBe(91.88); // 84.60 + max(2×3.64, 2.5×2.10)
    expect(result.plan!.rewardPct).toBeCloseTo(8.61, 2);
    expect(result.plan!.rr).toBeCloseTo(2.0, 2);
    expect(result.plan!.targetBasis).toMatch(/projection/);
    expect(result.plan!.overheadWarning).toBe(true);
  });

  it('all five gates pass and the trade is emitted', () => {
    expect(result.gates).toHaveLength(5);
    expect(result.gates.every((g) => g.pass)).toBe(true);
    expect(result.refusal).toBeNull();
    expect(result.plan).not.toBeNull();
    // G4: 0.86 × 2.00 − 0.14 = 1.58 ≥ 0.25
    expect(result.gates[3].text).toContain('1.58');
  });

  it('sizing example: $25,000 at 1% → 68 shares', () => {
    expect(result.plan!.sizing.riskFraction).toBe(0.01);
    expect(result.plan!.sizing.example.account).toBe(25_000);
    expect(result.plan!.sizing.example.shares).toBe(68); // floor(250 / 3.64)
  });

  it('EV is reported as uncalibrated', () => {
    expect(result.plan!.ev.calibrated).toBe(false);
    expect(result.plan!.ev.value).toBeGreaterThan(0);
  });

  it('story narrates the long with the thin-volume caveat and overhead note', () => {
    expect(result.story).toContain('QQXR sets up LONG on the swing timeframe');
    expect(result.story).toMatch(/clear nearby resistance/);
    expect(result.story).toMatch(/Thin volume/);
  });
});

describe('methodology II.9 counterfactual — refusal at G2', () => {
  // "Same setup but ADX 15 and Momentum bearish at −0.40": the doc stipulates
  // the family scores directly (−0.40 is not reachable from the component
  // table), so this fixture drives the determination functions with them.
  const weights = DEFAULT_CONFIG.weights.swing;
  const families = [
    { key: 'trend' as const, score: 0.5, weight: weights.trend }, // 1.0 × 0.5 (ADX 15)
    { key: 'momentum' as const, score: -0.4, weight: weights.momentum },
    { key: 'volume' as const, score: 0.5, weight: weights.volume },
    { key: 'structure' as const, score: 0.6, weight: weights.structure },
  ];

  it('composite +0.25 — still LONG at G1', () => {
    expect(compositeScore(families)).toBeCloseTo(0.25, 10);
    expect(resolveDirection(0.25, DEFAULT_CONFIG)).toBe('long');
  });

  it('confidence 29: base 53.75 − choppy 12 − momentum dissent 8 − thin 5', () => {
    const confidence = computeConfidence(
      {
        composite: 0.25,
        direction: 'long',
        families,
        flags: { choppy: true, rsiHot: false, rsiCold: false, thin: true, earningsInWindow: false },
      },
      DEFAULT_CONFIG,
    );
    expect(confidence.score).toBe(29); // 28.75 → 29
    expect(confidence.bucket).toBe('low');
    expect(confidence.penalties.map((p) => p.points)).toEqual([-12, -8, -5]);
  });

  it('G2 refuses: NO TRADE at confidence 29 < 35', () => {
    const { gates, refusal } = evaluateGates(
      {
        composite: 0.25,
        direction: 'long',
        confidence: 29,
        rr: 2,
        timeframe: 'swing',
        tradingDaysToEarnings: null,
      },
      DEFAULT_CONFIG,
    );
    expect(refusal).not.toBeNull();
    expect(refusal!.gate).toBe('G2');
    expect(gates).toHaveLength(2); // G1 pass, G2 fail — later gates never evaluated
    expect(gates[0].pass).toBe(true);
    expect(gates[1].pass).toBe(false);
  });
});
