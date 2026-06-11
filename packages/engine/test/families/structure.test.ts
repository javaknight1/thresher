import { describe, expect, it } from 'vitest';
import type { IndicatorSnapshot } from '../../src/types';
import type { EngineConfig } from '../../src/config';
import { DEFAULT_CONFIG } from '../../src/config';
import { scoreStructure } from '../../src/families/structure';

/** Full snapshot with neutral filler for fields the Structure family never reads. */
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

describe('scoreStructure — component 1: room asymmetry', () => {
  it('votes +0.4 when room to resistance exceeds 1.3× the cushion above support', () => {
    // room 5, cushion 3 → 5 > 3.9
    const r = scoreStructure(
      makeSnapshot({
        close: 100,
        sma20: 101,
        support: { price: 97, strength: 1, synthetic: false },
        resistance: { price: 105, strength: 1, synthetic: false },
      }),
      cfg,
    );
    // +0.4 (room) − 0.2 (below mean) = +0.2
    expect(r.score).toBeCloseTo(0.2, 10);
    expect(r.details[0]).toEqual({
      ok: 1,
      text: '$5.00 of room to resistance vs $3.00 above support',
    });
  });

  it('votes -0.4 when the cushion exceeds 1.3× the room', () => {
    // room 2, cushion 6 → 6 > 2.6
    const r = scoreStructure(
      makeSnapshot({
        close: 100,
        sma20: 99,
        support: { price: 94, strength: 1, synthetic: false },
        resistance: { price: 102, strength: 1, synthetic: false },
      }),
      cfg,
    );
    // -0.4 (room) + 0.2 (above mean) = -0.2
    expect(r.score).toBeCloseTo(-0.2, 10);
    expect(r.details[0]).toEqual({
      ok: -1,
      text: 'Resistance $2.00 away is closer than support — limited upside room',
    });
  });

  it('casts no points when roughly equidistant', () => {
    // room 5, cushion 5 → neither side exceeds 1.3× the other
    const r = scoreStructure(
      makeSnapshot({
        close: 100,
        sma20: 101,
        support: { price: 95, strength: 1, synthetic: false },
        resistance: { price: 105, strength: 1, synthetic: false },
      }),
      cfg,
    );
    // 0 (room) − 0.2 (below mean) = -0.2
    expect(r.score).toBeCloseTo(-0.2, 10);
    expect(r.details[0]).toEqual({
      ok: 0,
      text: 'Roughly equidistant between support and resistance',
    });
  });

  it('room exactly 1.3× cushion is equidistant (strict >)', () => {
    // cushion 10, room 13 = 1.3 × 10 exactly
    const r = scoreStructure(
      makeSnapshot({
        close: 100,
        support: { price: 90, strength: 1, synthetic: false },
        resistance: { price: 113, strength: 1, synthetic: false },
      }),
      cfg,
    );
    expect(r.details[0].ok).toBe(0);
    expect(r.details[0].text).toBe('Roughly equidistant between support and resistance');
  });

  it('cushion exactly 1.3× room is equidistant (strict >)', () => {
    // room 10, cushion 13 = 1.3 × 10 exactly
    const r = scoreStructure(
      makeSnapshot({
        close: 100,
        support: { price: 87, strength: 1, synthetic: false },
        resistance: { price: 110, strength: 1, synthetic: false },
      }),
      cfg,
    );
    expect(r.details[0].ok).toBe(0);
  });

  it('formats both distances to cents in the bullish detail', () => {
    // room = 89.40 − 84.60 = 4.80, cushion = 84.60 − 81.90 = 2.70 (FP-safe via toFixed)
    const r = scoreStructure(
      makeSnapshot({
        close: 84.6,
        support: { price: 81.9, strength: 2, synthetic: false },
        resistance: { price: 89.4, strength: 2, synthetic: false },
      }),
      cfg,
    );
    expect(r.details[0].text).toBe('$4.80 of room to resistance vs $2.70 above support');
  });
});

describe('scoreStructure — component 2: price vs 20-bar mean', () => {
  it('votes +0.2 above the mean', () => {
    const r = scoreStructure(makeSnapshot({ close: 100, sma20: 99 }), cfg);
    // 0 (equidistant) + 0.2 = +0.2
    expect(r.score).toBeCloseTo(0.2, 10);
    expect(r.details[1]).toEqual({ ok: 1, text: 'Trading above the 20-bar mean' });
  });

  it('votes -0.2 below the mean', () => {
    const r = scoreStructure(makeSnapshot({ close: 100, sma20: 101 }), cfg);
    expect(r.score).toBeCloseTo(-0.2, 10);
    expect(r.details[1]).toEqual({ ok: -1, text: 'Trading below the 20-bar mean' });
  });

  it('treats close exactly equal to SMA20 as below (strict >)', () => {
    const r = scoreStructure(makeSnapshot({ close: 100, sma20: 100 }), cfg);
    expect(r.details[1]).toEqual({ ok: -1, text: 'Trading below the 20-bar mean' });
  });
});

describe('scoreStructure — component 3: %B extremes', () => {
  it('%B above 0.98 → -0.2, stretched', () => {
    const r = scoreStructure(makeSnapshot({ percentB: 0.99, sma20: 99 }), cfg);
    // 0 + 0.2 (above mean) − 0.2 (%B) = 0
    expect(r.score).toBeCloseTo(0, 10);
    expect(r.details).toHaveLength(3);
    expect(r.details[2]).toEqual({
      ok: -1,
      text: 'Pressing the upper Bollinger band — stretched',
    });
  });

  it('%B below 0.02 → +0.2, washed out, informational ok:0', () => {
    const r = scoreStructure(makeSnapshot({ percentB: 0.01, sma20: 101 }), cfg);
    // 0 − 0.2 (below mean) + 0.2 (%B) = 0
    expect(r.score).toBeCloseTo(0, 10);
    expect(r.details).toHaveLength(3);
    expect(r.details[2]).toEqual({
      ok: 0,
      text: 'Pinned to the lower Bollinger band — washed out',
    });
  });

  it('%B exactly 0.98 casts no vote and emits no detail (strict >)', () => {
    const r = scoreStructure(makeSnapshot({ percentB: 0.98, sma20: 99 }), cfg);
    expect(r.score).toBeCloseTo(0.2, 10);
    expect(r.details).toHaveLength(2);
  });

  it('%B exactly 0.02 casts no vote and emits no detail (strict <)', () => {
    const r = scoreStructure(makeSnapshot({ percentB: 0.02, sma20: 99 }), cfg);
    expect(r.score).toBeCloseTo(0.2, 10);
    expect(r.details).toHaveLength(2);
  });

  it('mid-band %B emits no detail — exactly 2 details', () => {
    const r = scoreStructure(makeSnapshot({ percentB: 0.5 }), cfg);
    expect(r.details).toHaveLength(2);
  });
});

describe('scoreStructure — clamp', () => {
  // Default component points sum to at most ±0.8, so clamping is exercised with
  // inflated config points (cfg is a parameter; literals here are test fixtures).
  const bigCfg: EngineConfig = {
    ...DEFAULT_CONFIG,
    families: {
      ...DEFAULT_CONFIG.families,
      structure: { ...DEFAULT_CONFIG.families.structure, room: 0.9, vsMean: 0.5 },
    },
  };

  it('clamps a 1.6 raw sum to +1', () => {
    // room bullish +0.9, above mean +0.5, %B washed out +0.2 → 1.6 → 1
    const r = scoreStructure(
      makeSnapshot({
        close: 100,
        sma20: 99,
        percentB: 0.01,
        support: { price: 97, strength: 1, synthetic: false },
        resistance: { price: 105, strength: 1, synthetic: false },
      }),
      bigCfg,
    );
    expect(r.score).toBe(1);
  });

  it('clamps a -1.6 raw sum to -1', () => {
    // room bearish -0.9, below mean -0.5, %B stretched -0.2 → -1.6 → -1
    const r = scoreStructure(
      makeSnapshot({
        close: 100,
        sma20: 101,
        percentB: 0.99,
        support: { price: 94, strength: 1, synthetic: false },
        resistance: { price: 102, strength: 1, synthetic: false },
      }),
      bigCfg,
    );
    expect(r.score).toBe(-1);
  });
});

describe('scoreStructure — methodology II.9 worked example (mandatory fixture)', () => {
  it('QQXR swing: room 4.80 > 1.3×2.70 (+0.4) · above mean (+0.2) · %B 0.74 mid (0) = +0.60, 2 details', () => {
    const snap = makeSnapshot({
      close: 84.6,
      sma20: 82.9,
      percentB: 0.74,
      support: { price: 81.9, strength: 2, synthetic: false },
      resistance: { price: 89.4, strength: 2, synthetic: false },
    });
    const r = scoreStructure(snap, cfg);
    expect(r.score).toBeCloseTo(0.6, 12);
    expect(r.details).toHaveLength(2);
    expect(r.details).toEqual([
      { ok: 1, text: '$4.80 of room to resistance vs $2.70 above support' },
      { ok: 1, text: 'Trading above the 20-bar mean' },
    ]);
  });
});

describe('scoreStructure — invariants', () => {
  it('always emits 2 or 3 details with non-empty reasons and a score in [-1, 1]', () => {
    const cases = [
      makeSnapshot(),
      makeSnapshot({ percentB: 1.4, close: 500, sma20: 400 }),
      makeSnapshot({ percentB: -0.3, close: 1, sma20: 2 }),
      makeSnapshot({
        close: 100,
        support: { price: 95, strength: 3, synthetic: true },
        resistance: { price: 130, strength: 1, synthetic: true },
      }),
    ];
    for (const snap of cases) {
      const r = scoreStructure(snap, cfg);
      expect(r.details.length).toBeGreaterThanOrEqual(2);
      expect(r.details.length).toBeLessThanOrEqual(3);
      expect(r.score).toBeGreaterThanOrEqual(-1);
      expect(r.score).toBeLessThanOrEqual(1);
      for (const d of r.details) expect(d.text.length).toBeGreaterThan(0);
    }
  });
});
