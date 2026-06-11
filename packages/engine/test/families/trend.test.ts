import { describe, expect, it } from 'vitest';
import type { IndicatorSnapshot } from '../../src/types';
import { DEFAULT_CONFIG } from '../../src/config';
import { scoreTrend } from '../../src/families/trend';

/** Full snapshot with neutral filler for fields the Trend family never reads. */
function makeSnapshot(overrides: Partial<IndicatorSnapshot> = {}): IndicatorSnapshot {
  return {
    close: 100,
    sma20: 100,
    sma50: 100,
    sma50Prev: 100,
    rsi: 50,
    macd: { line: 0, signal: 0, hist: 0, histPrev: 0 },
    atr: 2,
    adx: 20,
    obvDelta: 0,
    priceDelta: 0,
    relVol: 1,
    percentB: 0.5,
    support: { price: 95, strength: 1, synthetic: false },
    resistance: { price: 105, strength: 1, synthetic: false },
    zonesAbove: [],
    zonesBelow: [],
    ...overrides,
  };
}

const cfg = DEFAULT_CONFIG;

describe('scoreTrend — component 1: price vs SMA50', () => {
  it('votes +0.4 with detail when close is above SMA50', () => {
    const r = scoreTrend(
      makeSnapshot({ close: 101, sma20: 99, sma50: 100, sma50Prev: 101, adx: 30 }),
      cfg,
    );
    // raw = +0.4 - 0.3 - 0.3 = -0.2, ×1.0
    expect(r.score).toBeCloseTo(-0.2, 10);
    expect(r.details[0]).toEqual({ ok: 1, text: 'Price above 50-bar SMA ($100.00)' });
  });

  it('votes -0.4 with detail when close is below SMA50', () => {
    const r = scoreTrend(
      makeSnapshot({ close: 99, sma20: 101, sma50: 100, sma50Prev: 99, adx: 30 }),
      cfg,
    );
    // raw = -0.4 + 0.3 + 0.3 = +0.2, ×1.0
    expect(r.score).toBeCloseTo(0.2, 10);
    expect(r.details[0]).toEqual({ ok: -1, text: 'Price below 50-bar SMA ($100.00)' });
  });

  it('treats close exactly equal to SMA50 as below (strict >)', () => {
    const r = scoreTrend(makeSnapshot({ close: 100, sma50: 100, adx: 30 }), cfg);
    expect(r.details[0]).toEqual({ ok: -1, text: 'Price below 50-bar SMA ($100.00)' });
  });

  it('formats the SMA50 level to cents in the detail string', () => {
    const r = scoreTrend(makeSnapshot({ close: 90, sma50: 80.4 }), cfg);
    expect(r.details[0].text).toBe('Price above 50-bar SMA ($80.40)');
  });
});

describe('scoreTrend — component 2: SMA20 vs SMA50 stack', () => {
  it('votes +0.3 when 20 SMA is above 50 SMA', () => {
    const r = scoreTrend(
      makeSnapshot({ close: 99, sma20: 101, sma50: 100, sma50Prev: 101, adx: 30 }),
      cfg,
    );
    // raw = -0.4 + 0.3 - 0.3 = -0.4, ×1.0
    expect(r.score).toBeCloseTo(-0.4, 10);
    expect(r.details[1]).toEqual({ ok: 1, text: '20 SMA above 50 SMA (bullish stack)' });
  });

  it('votes -0.3 when 20 SMA is below 50 SMA', () => {
    const r = scoreTrend(
      makeSnapshot({ close: 101, sma20: 99, sma50: 100, sma50Prev: 99, adx: 30 }),
      cfg,
    );
    // raw = +0.4 - 0.3 + 0.3 = +0.4, ×1.0
    expect(r.score).toBeCloseTo(0.4, 10);
    expect(r.details[1]).toEqual({ ok: -1, text: '20 SMA below 50 SMA (bearish stack)' });
  });

  it('treats SMA20 exactly equal to SMA50 as bearish stack (strict >)', () => {
    const r = scoreTrend(makeSnapshot({ sma20: 100, sma50: 100, adx: 30 }), cfg);
    expect(r.details[1]).toEqual({ ok: -1, text: '20 SMA below 50 SMA (bearish stack)' });
  });
});

describe('scoreTrend — component 3: SMA50 slope', () => {
  it('votes +0.3 when SMA50 is above its value 10 bars ago', () => {
    const r = scoreTrend(
      makeSnapshot({ close: 99, sma20: 99, sma50: 100, sma50Prev: 99, adx: 30 }),
      cfg,
    );
    // raw = -0.4 - 0.3 + 0.3 = -0.4, ×1.0
    expect(r.score).toBeCloseTo(-0.4, 10);
    expect(r.details[2]).toEqual({ ok: 1, text: '50 SMA sloping upward' });
  });

  it('votes -0.3 when SMA50 is below its value 10 bars ago', () => {
    const r = scoreTrend(
      makeSnapshot({ close: 101, sma20: 101, sma50: 100, sma50Prev: 101, adx: 30 }),
      cfg,
    );
    // raw = +0.4 + 0.3 - 0.3 = +0.4, ×1.0
    expect(r.score).toBeCloseTo(0.4, 10);
    expect(r.details[2]).toEqual({ ok: -1, text: '50 SMA sloping downward' });
  });

  it('treats a flat SMA50 as sloping downward (strict >)', () => {
    const r = scoreTrend(makeSnapshot({ sma50: 100, sma50Prev: 100, adx: 30 }), cfg);
    expect(r.details[2]).toEqual({ ok: -1, text: '50 SMA sloping downward' });
  });
});

describe('scoreTrend — ADX multiplier boundaries', () => {
  // Fully bullish snapshot: raw = +1.0, so score isolates the multiplier.
  const bullish = { close: 101, sma20: 100.5, sma50: 100, sma50Prev: 99 };

  it('adx 25 → ×1.0, established trend, not choppy', () => {
    const r = scoreTrend(makeSnapshot({ ...bullish, adx: 25 }), cfg);
    expect(r.score).toBeCloseTo(1.0, 10);
    expect(r.choppy).toBe(false);
    expect(r.details[3]).toEqual({ ok: 1, text: 'ADX 25 — established trend' });
  });

  it('adx 24.99 → ×0.8, developing trend, not choppy', () => {
    const r = scoreTrend(makeSnapshot({ ...bullish, adx: 24.99 }), cfg);
    expect(r.score).toBeCloseTo(0.8, 10);
    expect(r.choppy).toBe(false);
    expect(r.details[3]).toEqual({ ok: 0, text: 'ADX 25 — developing trend' });
  });

  it('adx 18 → ×0.8, developing trend, not choppy', () => {
    const r = scoreTrend(makeSnapshot({ ...bullish, adx: 18 }), cfg);
    expect(r.score).toBeCloseTo(0.8, 10);
    expect(r.choppy).toBe(false);
    expect(r.details[3]).toEqual({ ok: 0, text: 'ADX 18 — developing trend' });
  });

  it('adx 17.99 → ×0.5 and sets choppy', () => {
    const r = scoreTrend(makeSnapshot({ ...bullish, adx: 17.99 }), cfg);
    expect(r.score).toBeCloseTo(0.5, 10);
    expect(r.choppy).toBe(true);
    expect(r.details[3]).toEqual({ ok: -1, text: 'ADX 18 — choppy, low trend conviction' });
  });

  it('discounts a fully bearish raw sum symmetrically (raw -1.0 × 0.5 = -0.5)', () => {
    const r = scoreTrend(
      makeSnapshot({ close: 99, sma20: 99, sma50: 100, sma50Prev: 101, adx: 10 }),
      cfg,
    );
    expect(r.score).toBeCloseTo(-0.5, 10);
    expect(r.choppy).toBe(true);
    expect(r.details[3]).toEqual({ ok: -1, text: 'ADX 10 — choppy, low trend conviction' });
  });
});

describe('scoreTrend — clamp', () => {
  it('raw 1.0 × 1.0 stays exactly 1.0 (clamp ceiling)', () => {
    const r = scoreTrend(
      makeSnapshot({ close: 101, sma20: 100.5, sma50: 100, sma50Prev: 99, adx: 40 }),
      cfg,
    );
    expect(r.score).toBe(1.0);
  });

  it('raw -1.0 × 1.0 stays exactly -1.0 (clamp floor)', () => {
    const r = scoreTrend(
      makeSnapshot({ close: 99, sma20: 99.5, sma50: 100, sma50Prev: 101, adx: 40 }),
      cfg,
    );
    expect(r.score).toBe(-1.0);
  });
});

describe('scoreTrend — methodology II.9 worked example (mandatory fixture)', () => {
  it('QQXR swing: raw +1.0 ×0.8 (ADX 24, developing) = +0.80, not choppy, 4 details', () => {
    const snap = makeSnapshot({
      close: 84.6,
      sma20: 82.9,
      sma50: 80.4,
      sma50Prev: 79.8,
      adx: 24,
    });
    const r = scoreTrend(snap, cfg);
    expect(r.score).toBeCloseTo(0.8, 10);
    expect(r.choppy).toBe(false);
    expect(r.details).toHaveLength(4);
    expect(r.details).toEqual([
      { ok: 1, text: 'Price above 50-bar SMA ($80.40)' },
      { ok: 1, text: '20 SMA above 50 SMA (bullish stack)' },
      { ok: 1, text: '50 SMA sloping upward' },
      { ok: 0, text: 'ADX 24 — developing trend' },
    ]);
  });

  it('counterfactual ADX 15: same setup discounts to 1.0 × 0.5 = +0.50 and sets choppy', () => {
    const snap = makeSnapshot({
      close: 84.6,
      sma20: 82.9,
      sma50: 80.4,
      sma50Prev: 79.8,
      adx: 15,
    });
    const r = scoreTrend(snap, cfg);
    expect(r.score).toBeCloseTo(0.5, 10);
    expect(r.choppy).toBe(true);
    expect(r.details[3]).toEqual({ ok: -1, text: 'ADX 15 — choppy, low trend conviction' });
  });
});

describe('scoreTrend — invariants', () => {
  it('always emits exactly 4 details (3 components + ADX) and a score in [-1, 1]', () => {
    const cases = [
      makeSnapshot(),
      makeSnapshot({ close: 500, sma20: 400, sma50: 300, sma50Prev: 200, adx: 99 }),
      makeSnapshot({ close: 1, sma20: 2, sma50: 3, sma50Prev: 4, adx: 0 }),
    ];
    for (const snap of cases) {
      const r = scoreTrend(snap, cfg);
      expect(r.details).toHaveLength(4);
      expect(r.score).toBeGreaterThanOrEqual(-1);
      expect(r.score).toBeLessThanOrEqual(1);
      for (const d of r.details) expect(d.text.length).toBeGreaterThan(0);
    }
  });
});
