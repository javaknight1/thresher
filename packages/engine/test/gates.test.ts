/**
 * Refusal gates G1–G5 (methodology II.7, design §5.5).
 * Gates run in order; the first failure stops evaluation and names the gate.
 */
import { describe, expect, it } from 'vitest';
import type { GateInput } from '../src/gates';
import { evaluateGates } from '../src/gates';
import { DEFAULT_CONFIG } from '../src/config';

const cfg = DEFAULT_CONFIG;

/** Methodology II.9 worked example as gate input: all five gates pass. */
const WORKED: GateInput = {
  composite: 0.745,
  direction: 'long',
  confidence: 86,
  rr: 2.0,
  timeframe: 'swing',
  tradingDaysToEarnings: null,
};

describe('all gates pass (worked example II.9)', () => {
  const { gates, refusal } = evaluateGates(WORKED, cfg);

  it('evaluates all 5 gates with refusal null', () => {
    expect(gates).toHaveLength(5);
    expect(gates.map((g) => g.gate)).toEqual(['G1', 'G2', 'G3', 'G4', 'G5']);
    expect(gates.every((g) => g.pass)).toBe(true);
    expect(refusal).toBeNull();
  });

  it('G1 text is sign-aware with the uppercased direction', () => {
    expect(gates[0].text).toBe('edge: composite +0.745 ≥ +0.22 → LONG');
  });

  it('G2/G3 texts show the numbers against the floors', () => {
    expect(gates[1].text).toBe('conviction: confidence 86 ≥ 35');
    expect(gates[2].text).toBe('structure: 2.00:1 ≥ 1.2:1');
  });

  it('G4 text shows the EV arithmetic with +1.58R', () => {
    expect(gates[3].text).toContain('1.58');
    expect(gates[3].text).toBe('expected value: 0.86×2.00 − 0.14 = +1.58R ≥ +0.25R');
  });

  it('G5 passes with the unknown-earnings text', () => {
    expect(gates[4].text).toBe('earnings date unknown — no veto');
  });
});

describe('G1 EDGE', () => {
  it('fails first when direction is none, even with failing confidence (ordering proof)', () => {
    const { gates, refusal } = evaluateGates(
      { ...WORKED, composite: 0.13, direction: 'none', confidence: 10 },
      cfg,
    );
    expect(gates).toHaveLength(1);
    expect(gates[0].pass).toBe(false);
    expect(gates[0].text).toBe(
      'no edge — signal families net out near zero (|composite| 0.130 < 0.22)',
    );
    expect(refusal).toEqual({ gate: 'G1', reason: gates[0].text });
  });

  it('formats a short pass with ≤ and negative threshold', () => {
    const { gates } = evaluateGates(
      { ...WORKED, composite: -0.53, direction: 'short' },
      cfg,
    );
    expect(gates[0].text).toBe('edge: composite -0.530 ≤ -0.22 → SHORT');
  });
});

describe('G2 CONVICTION', () => {
  it('fails at confidence 29 (II.9 counterfactual) and stops there', () => {
    const { gates, refusal } = evaluateGates({ ...WORKED, confidence: 29 }, cfg);
    expect(gates).toHaveLength(2);
    expect(gates[1]).toEqual({
      gate: 'G2',
      pass: false,
      text: 'conviction floor — confidence 29 < 35',
    });
    expect(refusal).toEqual({ gate: 'G2', reason: 'conviction floor — confidence 29 < 35' });
  });

  it('passes at the boundary confidence 35', () => {
    const { gates } = evaluateGates({ ...WORKED, confidence: 35, rr: 3 }, cfg);
    expect(gates[1].pass).toBe(true);
    expect(gates[1].text).toBe('conviction: confidence 35 ≥ 35');
  });
});

describe('G3 STRUCTURE', () => {
  it('fails at rr 1.19 and stops there', () => {
    const { gates, refusal } = evaluateGates({ ...WORKED, rr: 1.19 }, cfg);
    expect(gates).toHaveLength(3);
    expect(gates[2].pass).toBe(false);
    expect(gates[2].text).toBe('structure only offers 1.19:1 — below the 1.2:1 floor');
    expect(refusal?.gate).toBe('G3');
  });

  it('passes at the boundary rr 1.2', () => {
    const { gates } = evaluateGates({ ...WORKED, rr: 1.2 }, cfg);
    expect(gates[2]).toEqual({ gate: 'G3', pass: true, text: 'structure: 1.20:1 ≥ 1.2:1' });
  });

  it('defensively fails with "no plan available" when rr is null', () => {
    const { gates, refusal } = evaluateGates({ ...WORKED, rr: null }, cfg);
    expect(gates).toHaveLength(3);
    expect(gates[2]).toEqual({ gate: 'G3', pass: false, text: 'no plan available' });
    expect(refusal).toEqual({ gate: 'G3', reason: 'no plan available' });
  });
});

describe('G4 EXPECTED VALUE', () => {
  it('confidence 35 + rr 2.57 fails — formula boundary, not the rounded table (ev 0.2495)', () => {
    const { gates, refusal } = evaluateGates({ ...WORKED, confidence: 35, rr: 2.57 }, cfg);
    expect(gates).toHaveLength(4);
    expect(gates[3].pass).toBe(false);
    // RR_min(35) = (0.25 + 0.65) / 0.35 = 2.5714…
    expect(gates[3].text).toBe(
      'expected value +0.25R below the +0.25R margin — confidence 35 needs ≥ 2.57:1',
    );
    expect(refusal?.gate).toBe('G4');
  });

  it('confidence 35 + rr 2.58 passes (ev 0.253)', () => {
    const { gates, refusal } = evaluateGates({ ...WORKED, confidence: 35, rr: 2.58 }, cfg);
    expect(gates).toHaveLength(5);
    expect(gates[3].pass).toBe(true);
    expect(refusal).toBeNull();
  });

  it('confidence 60 + rr 1.2 passes with ev 0.32', () => {
    const { gates } = evaluateGates({ ...WORKED, confidence: 60, rr: 1.2 }, cfg);
    expect(gates[3]).toEqual({
      gate: 'G4',
      pass: true,
      text: 'expected value: 0.60×1.20 − 0.40 = +0.32R ≥ +0.25R',
    });
  });

  it('names the required RR_min for a low-confidence failure (confidence 40 needs 2.13:1)', () => {
    const { gates } = evaluateGates({ ...WORKED, confidence: 40, rr: 1.75 }, cfg);
    // ev = 0.40 × 1.75 − 0.60 = +0.10R; RR_min = (0.25 + 0.60) / 0.40 = 2.125 → 2.13
    expect(gates[3].text).toBe(
      'expected value +0.10R below the +0.25R margin — confidence 40 needs ≥ 2.13:1',
    );
  });
});

describe('G5 EVENT', () => {
  it('swing: earnings in 3 trading days is inside the 3-day window → veto', () => {
    const { gates, refusal } = evaluateGates({ ...WORKED, tradingDaysToEarnings: 3 }, cfg);
    expect(gates).toHaveLength(5);
    expect(gates[4].pass).toBe(false);
    expect(gates[4].text).toBe('earnings in 3 trading days — inside the 3-day veto window');
    expect(refusal).toEqual({ gate: 'G5', reason: gates[4].text });
  });

  it('swing: earnings in 4 trading days is outside the window → pass', () => {
    const { gates, refusal } = evaluateGates({ ...WORKED, tradingDaysToEarnings: 4 }, cfg);
    expect(gates[4]).toEqual({
      gate: 'G5',
      pass: true,
      text: 'no earnings inside the 3-day veto window',
    });
    expect(refusal).toBeNull();
  });

  it('swing: earnings today (0 trading days) → veto', () => {
    const { gates, refusal } = evaluateGates({ ...WORKED, tradingDaysToEarnings: 0 }, cfg);
    expect(gates[4].pass).toBe(false);
    expect(gates[4].text).toBe('earnings in 0 trading days — inside the 3-day veto window');
    expect(refusal?.gate).toBe('G5');
  });

  it('intraday: 1 day fails, 2 days passes (1-day window)', () => {
    const fail = evaluateGates(
      { ...WORKED, timeframe: 'intraday', tradingDaysToEarnings: 1 },
      cfg,
    );
    expect(fail.gates[4].pass).toBe(false);
    expect(fail.gates[4].text).toBe('earnings in 1 trading days — inside the 1-day veto window');
    expect(fail.refusal?.gate).toBe('G5');

    const pass = evaluateGates(
      { ...WORKED, timeframe: 'intraday', tradingDaysToEarnings: 2 },
      cfg,
    );
    expect(pass.gates[4].pass).toBe(true);
    expect(pass.refusal).toBeNull();
  });

  it('position: earnings ahead are flagged, never vetoed', () => {
    const { gates, refusal } = evaluateGates(
      { ...WORKED, timeframe: 'position', tradingDaysToEarnings: 1 },
      cfg,
    );
    expect(gates[4]).toEqual({
      gate: 'G5',
      pass: true,
      text: 'earnings flagged, not vetoed (position timeframe)',
    });
    expect(refusal).toBeNull();
  });

  it('position: unknown earnings date → plain no-veto text', () => {
    const { gates } = evaluateGates(
      { ...WORKED, timeframe: 'position', tradingDaysToEarnings: null },
      cfg,
    );
    expect(gates[4]).toEqual({
      gate: 'G5',
      pass: true,
      text: 'no earnings veto (position timeframe)',
    });
  });

  it('swing: unknown earnings date passes with the unknown text (undefined too)', () => {
    const omitted: GateInput = {
      composite: WORKED.composite,
      direction: WORKED.direction,
      confidence: WORKED.confidence,
      rr: WORKED.rr,
      timeframe: 'swing',
    };
    const { gates, refusal } = evaluateGates(omitted, cfg);
    expect(gates[4]).toEqual({ gate: 'G5', pass: true, text: 'earnings date unknown — no veto' });
    expect(refusal).toBeNull();
  });
});
