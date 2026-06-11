import { describe, expect, it } from 'vitest';
import { scoreMomentum } from '../../src/families/momentum';
import { DEFAULT_CONFIG } from '../../src/config';
import type { EngineConfig } from '../../src/config';
import type { IndicatorSnapshot, MacdReading } from '../../src/types';

/** Minimal snapshot: only the fields scoreMomentum reads vary per test. */
function snap(overrides: { rsi?: number; macd?: Partial<MacdReading> }): IndicatorSnapshot {
  return {
    close: 100,
    sma20: 100,
    sma50: 100,
    sma50Prev: 100,
    rsi: overrides.rsi ?? 50,
    macd: { line: 1, signal: 0, hist: 0.2, histPrev: 0.1, ...overrides.macd },
    atr: 2,
    adx: 25,
    obvDelta: 0,
    priceDelta: 0,
    relVol: 1,
    percentB: 0.5,
    support: { price: 95, strength: 2, synthetic: false },
    resistance: { price: 105, strength: 2, synthetic: false },
    zonesAbove: [],
    zonesBelow: [],
  };
}

const cfg = DEFAULT_CONFIG;

describe('scoreMomentum — worked example (methodology II.9, MANDATORY fixture)', () => {
  // QQXR swing: MACD 0.92 vs signal 0.71, hist 0.21 vs 0.13 three bars ago, RSI 61.
  const result = scoreMomentum(
    snap({ rsi: 61, macd: { line: 0.92, signal: 0.71, hist: 0.21, histPrev: 0.13 } }),
    cfg,
  );

  it('scores exactly +0.90 (0.4 + 0.2 + 0.3)', () => {
    expect(result.score).toBeCloseTo(0.9, 12);
  });

  it('sets neither extreme flag', () => {
    expect(result.rsiHot).toBe(false);
    expect(result.rsiCold).toBe(false);
  });

  it('emits exactly 3 details, all bullish, with the spec reason strings', () => {
    expect(result.details).toEqual([
      { ok: 1, text: 'MACD above signal line' },
      { ok: 1, text: 'MACD histogram expanding upward' },
      { ok: 1, text: 'RSI 61 — bullish momentum zone' },
    ]);
  });
});

describe('scoreMomentum — MACD line vs signal (±0.40)', () => {
  it('line > signal → +0.4, ok:1', () => {
    const { details } = scoreMomentum(snap({ macd: { line: 0.5, signal: 0.4 } }), cfg);
    expect(details[0]).toEqual({ ok: 1, text: 'MACD above signal line' });
  });

  it('line < signal → −0.4, ok:-1', () => {
    const r = scoreMomentum(
      snap({ rsi: 50, macd: { line: 0.4, signal: 0.5, hist: 0.2, histPrev: 0.1 } }),
      cfg,
    );
    expect(r.details[0]).toEqual({ ok: -1, text: 'MACD below signal line' });
    expect(r.score).toBeCloseTo(-0.4 + 0.2 + 0, 12);
  });

  it('line === signal counts as below (strict >)', () => {
    const { details } = scoreMomentum(snap({ macd: { line: 0.5, signal: 0.5 } }), cfg);
    expect(details[0]).toEqual({ ok: -1, text: 'MACD below signal line' });
  });
});

describe('scoreMomentum — MACD histogram vs 3 bars ago (±0.20)', () => {
  it('hist > histPrev → +0.2, ok:1', () => {
    const { details } = scoreMomentum(snap({ macd: { hist: 0.21, histPrev: 0.13 } }), cfg);
    expect(details[1]).toEqual({ ok: 1, text: 'MACD histogram expanding upward' });
  });

  it('hist < histPrev → −0.2, ok:-1', () => {
    const r = scoreMomentum(
      snap({ rsi: 50, macd: { line: 1, signal: 0, hist: 0.1, histPrev: 0.2 } }),
      cfg,
    );
    expect(r.details[1]).toEqual({ ok: -1, text: 'MACD histogram fading' });
    expect(r.score).toBeCloseTo(0.4 - 0.2 + 0, 12);
  });

  it('hist === histPrev counts as fading (strict >)', () => {
    const { details } = scoreMomentum(snap({ macd: { hist: 0.2, histPrev: 0.2 } }), cfg);
    expect(details[1]).toEqual({ ok: -1, text: 'MACD histogram fading' });
  });
});

describe('scoreMomentum — RSI zones (methodology I.4 table, branch order)', () => {
  // Bearish MACD components isolate the RSI contribution: base = −0.4 − 0.2 = −0.6.
  const bearMacd = { line: 0, signal: 1, hist: 0.1, histPrev: 0.2 };
  const rsiOnly = (rsi: number) => scoreMomentum(snap({ rsi, macd: bearMacd }), cfg);

  it('rsi > 72 → +0.1, rsiHot, ok:0 informational', () => {
    const r = rsiOnly(80);
    expect(r.score).toBeCloseTo(-0.6 + 0.1, 12);
    expect(r.rsiHot).toBe(true);
    expect(r.rsiCold).toBe(false);
    expect(r.details[2]).toEqual({ ok: 0, text: 'RSI 80 — strong but overbought' });
  });

  it('rsi 55–72 → +0.3, ok:1', () => {
    const r = rsiOnly(61);
    expect(r.score).toBeCloseTo(-0.6 + 0.3, 12);
    expect(r.rsiHot).toBe(false);
    expect(r.details[2]).toEqual({ ok: 1, text: 'RSI 61 — bullish momentum zone' });
  });

  it('rsi < 28 → −0.1, rsiCold, ok:0 informational', () => {
    const r = rsiOnly(20);
    expect(r.score).toBeCloseTo(-0.6 - 0.1, 12);
    expect(r.rsiCold).toBe(true);
    expect(r.rsiHot).toBe(false);
    expect(r.details[2]).toEqual({ ok: 0, text: 'RSI 20 — weak but oversold' });
  });

  it('rsi 28–45 → −0.3, ok:-1', () => {
    const r = rsiOnly(35);
    expect(r.score).toBeCloseTo(-0.6 - 0.3, 12);
    expect(r.details[2]).toEqual({ ok: -1, text: 'RSI 35 — bearish momentum zone' });
  });

  it('rsi 45–55 → no vote, ok:0', () => {
    const r = rsiOnly(50);
    expect(r.score).toBeCloseTo(-0.6, 12);
    expect(r.rsiHot).toBe(false);
    expect(r.rsiCold).toBe(false);
    expect(r.details[2]).toEqual({ ok: 0, text: 'RSI 50 — neutral' });
  });

  describe('boundaries', () => {
    it('rsi = 72 is the bullish zone, NOT hot (hot is strict >)', () => {
      const r = rsiOnly(72);
      expect(r.score).toBeCloseTo(-0.6 + 0.3, 12);
      expect(r.rsiHot).toBe(false);
      expect(r.details[2]).toEqual({ ok: 1, text: 'RSI 72 — bullish momentum zone' });
    });

    it('rsi = 55 is the bullish zone (inclusive ≥)', () => {
      const r = rsiOnly(55);
      expect(r.score).toBeCloseTo(-0.6 + 0.3, 12);
      expect(r.details[2]).toEqual({ ok: 1, text: 'RSI 55 — bullish momentum zone' });
    });

    it('rsi = 45 is the bearish zone (inclusive ≤)', () => {
      const r = rsiOnly(45);
      expect(r.score).toBeCloseTo(-0.6 - 0.3, 12);
      expect(r.details[2]).toEqual({ ok: -1, text: 'RSI 45 — bearish momentum zone' });
    });

    it('rsi = 28 is the bearish zone, NOT cold (cold is strict <)', () => {
      const r = rsiOnly(28);
      expect(r.score).toBeCloseTo(-0.6 - 0.3, 12);
      expect(r.rsiCold).toBe(false);
      expect(r.details[2]).toEqual({ ok: -1, text: 'RSI 28 — bearish momentum zone' });
    });

    it('rsi = 54.9 and 45.1 are neutral (label uses toFixed(0))', () => {
      const high = rsiOnly(54.9);
      expect(high.score).toBeCloseTo(-0.6, 12);
      expect(high.details[2]).toEqual({ ok: 0, text: 'RSI 55 — neutral' });

      const low = rsiOnly(45.1);
      expect(low.score).toBeCloseTo(-0.6, 12);
      expect(low.details[2]).toEqual({ ok: 0, text: 'RSI 45 — neutral' });
    });
  });
});

describe('scoreMomentum — clamp to [−1, +1]', () => {
  // Default points sum to ±0.9 max, so the clamp only binds under an inflated
  // config (points are config, not magic numbers — the clamp is design §4.1).
  const inflated: EngineConfig = {
    ...cfg,
    families: {
      ...cfg.families,
      momentum: { ...cfg.families.momentum, macdCross: 0.8, histogram: 0.5, rsiZone: 0.5 },
    },
  };

  it('clamps a +1.8 raw sum to +1', () => {
    const r = scoreMomentum(
      snap({ rsi: 61, macd: { line: 1, signal: 0, hist: 0.2, histPrev: 0.1 } }),
      inflated,
    );
    expect(r.score).toBe(1);
  });

  it('clamps a −1.8 raw sum to −1', () => {
    const r = scoreMomentum(
      snap({ rsi: 35, macd: { line: 0, signal: 1, hist: 0.1, histPrev: 0.2 } }),
      inflated,
    );
    expect(r.score).toBe(-1);
  });

  it('never clamps with the default config (max magnitude 0.9)', () => {
    const bull = scoreMomentum(
      snap({ rsi: 61, macd: { line: 1, signal: 0, hist: 0.2, histPrev: 0.1 } }),
      cfg,
    );
    const bear = scoreMomentum(
      snap({ rsi: 35, macd: { line: 0, signal: 1, hist: 0.1, histPrev: 0.2 } }),
      cfg,
    );
    expect(bull.score).toBeCloseTo(0.9, 12);
    expect(bear.score).toBeCloseTo(-0.9, 12);
  });
});
