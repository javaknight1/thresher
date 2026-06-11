import { describe, expect, it } from 'vitest';
import { scoreVolume } from '../../src/families/volume';
import { DEFAULT_CONFIG } from '../../src/config';
import type { IndicatorSnapshot } from '../../src/types';

/**
 * scoreVolume reads only obvDelta, priceDelta, and relVol; everything else in
 * the snapshot is inert filler so the factory typechecks against the frozen
 * IndicatorSnapshot shape.
 */
function snap(overrides: Partial<IndicatorSnapshot>): IndicatorSnapshot {
  return {
    close: 100,
    sma20: 100,
    sma50: 100,
    sma50Prev: 100,
    rsi: 50,
    macd: { line: 0, signal: 0, hist: 0, histPrev: 0 },
    atr: 1,
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

describe('scoreVolume — OBV vs price (methodology I.7, design §4.1)', () => {
  it('OBV up with price up → +0.5, accumulation confirms (ok: 1)', () => {
    const r = scoreVolume(snap({ obvDelta: 1000, priceDelta: 2.5 }), DEFAULT_CONFIG);
    expect(r.score).toBeCloseTo(0.5, 12);
    expect(r.details[0]).toEqual({ ok: 1, text: 'OBV rising with price — accumulation' });
  });

  it('OBV down with price down → -0.5, distribution confirms (ok: -1)', () => {
    const r = scoreVolume(snap({ obvDelta: -1000, priceDelta: -2.5 }), DEFAULT_CONFIG);
    expect(r.score).toBeCloseTo(-0.5, 12);
    expect(r.details[0]).toEqual({ ok: -1, text: 'OBV falling with price — distribution' });
  });

  it('OBV up against falling price → +0.2 bullish divergence (informational ok: 0)', () => {
    const r = scoreVolume(snap({ obvDelta: 1000, priceDelta: -2.5 }), DEFAULT_CONFIG);
    expect(r.score).toBeCloseTo(0.2, 12);
    expect(r.details[0]).toEqual({ ok: 0, text: 'OBV diverging bullishly from price' });
  });

  it('OBV up with flat price → +0.2 bullish divergence (up/flat row)', () => {
    const r = scoreVolume(snap({ obvDelta: 1000, priceDelta: 0 }), DEFAULT_CONFIG);
    expect(r.score).toBeCloseTo(0.2, 12);
    expect(r.details[0]).toEqual({ ok: 0, text: 'OBV diverging bullishly from price' });
  });

  it('OBV down against rising price → -0.2 bearish divergence', () => {
    const r = scoreVolume(snap({ obvDelta: -1000, priceDelta: 2.5 }), DEFAULT_CONFIG);
    expect(r.score).toBeCloseTo(-0.2, 12);
    expect(r.details[0]).toEqual({ ok: 0, text: 'OBV diverging bearishly from price' });
  });

  it('OBV flat falls through to the bearish-divergence branch', () => {
    const r = scoreVolume(snap({ obvDelta: 0, priceDelta: 2.5 }), DEFAULT_CONFIG);
    expect(r.score).toBeCloseTo(-0.2, 12);
    expect(r.details[0]).toEqual({ ok: 0, text: 'OBV diverging bearishly from price' });
  });
});

describe('scoreVolume — relative volume (methodology I.8, design §4.1)', () => {
  it('elevated tape with rising price adds +0.3 (ok: 1) with the percent in the text', () => {
    const r = scoreVolume(
      snap({ obvDelta: 1000, priceDelta: 2.5, relVol: 1.6 }),
      DEFAULT_CONFIG,
    );
    expect(r.score).toBeCloseTo(0.5 + 0.3, 12);
    expect(r.thin).toBe(false);
    expect(r.details[1]).toEqual({
      ok: 1,
      text: 'Volume 60% above average — conviction behind the move',
    });
  });

  it('elevated tape with falling price flips the vote to -0.3 (ok: -1)', () => {
    const r = scoreVolume(
      snap({ obvDelta: -1000, priceDelta: -2.5, relVol: 1.27 }),
      DEFAULT_CONFIG,
    );
    expect(r.score).toBeCloseTo(-0.5 - 0.3, 12);
    expect(r.thin).toBe(false);
    expect(r.details[1]).toEqual({
      ok: -1,
      text: 'Volume 27% above average — conviction behind the move',
    });
  });

  it('elevated tape with a flat 20-bar price change defaults the vote bullish (|| 1)', () => {
    const r = scoreVolume(snap({ obvDelta: 1000, priceDelta: 0, relVol: 1.5 }), DEFAULT_CONFIG);
    expect(r.score).toBeCloseTo(0.2 + 0.3, 12);
    expect(r.details[1]).toEqual({
      ok: 1,
      text: 'Volume 50% above average — conviction behind the move',
    });
  });

  it('thin tape (< 0.8) sets the thin flag with zero points', () => {
    const r = scoreVolume(
      snap({ obvDelta: -1000, priceDelta: -2.5, relVol: 0.5 }),
      DEFAULT_CONFIG,
    );
    expect(r.score).toBeCloseTo(-0.5, 12);
    expect(r.thin).toBe(true);
    expect(r.details[1]).toEqual({ ok: 0, text: 'Volume running thin vs. 20-bar average' });
  });

  it('normal tape (0.8–1.2) casts no vote and does not flag thin', () => {
    const r = scoreVolume(snap({ obvDelta: 1000, priceDelta: 2.5, relVol: 1.0 }), DEFAULT_CONFIG);
    expect(r.score).toBeCloseTo(0.5, 12);
    expect(r.thin).toBe(false);
    expect(r.details[1]).toEqual({ ok: 0, text: 'Volume in line with average' });
  });

  it('boundary: relVol exactly 1.2 is NOT elevated (strict inequality) — no vote', () => {
    const r = scoreVolume(snap({ obvDelta: 1000, priceDelta: 2.5, relVol: 1.2 }), DEFAULT_CONFIG);
    expect(r.score).toBeCloseTo(0.5, 12);
    expect(r.thin).toBe(false);
    expect(r.details[1]).toEqual({ ok: 0, text: 'Volume in line with average' });
  });

  it('boundary: relVol exactly 0.8 is NOT thin (strict inequality)', () => {
    const r = scoreVolume(snap({ obvDelta: 1000, priceDelta: 2.5, relVol: 0.8 }), DEFAULT_CONFIG);
    expect(r.score).toBeCloseTo(0.5, 12);
    expect(r.thin).toBe(false);
    expect(r.details[1]).toEqual({ ok: 0, text: 'Volume in line with average' });
  });

  it('always emits exactly two details — one per component', () => {
    for (const relVol of [0.5, 0.8, 1.0, 1.2, 1.6]) {
      const r = scoreVolume(snap({ obvDelta: 1000, priceDelta: 2.5, relVol }), DEFAULT_CONFIG);
      expect(r.details).toHaveLength(2);
      for (const d of r.details) expect(d.text.length).toBeGreaterThan(0);
    }
  });
});

describe('scoreVolume — worked example II.9 (MANDATORY fixture)', () => {
  it('QQXR swing: OBV confirms +0.5 · RelVol 0.76 → thin flag, 0 pts → score +0.50', () => {
    // Methodology II.9: OBV Δ20 > 0 with price Δ20 > 0 · RelVol 0.76.
    // Volume family row: "OBV confirms +0.5 · RelVol 0.76 → thin flag, 0 pts → +0.50".
    const r = scoreVolume(
      snap({ obvDelta: 1, priceDelta: 1, relVol: 0.76 }),
      DEFAULT_CONFIG,
    );
    expect(r.score).toBe(0.5);
    expect(r.thin).toBe(true);
    expect(r.details).toHaveLength(2);
    expect(r.details[0]).toEqual({ ok: 1, text: 'OBV rising with price — accumulation' });
    expect(r.details[1]).toEqual({ ok: 0, text: 'Volume running thin vs. 20-bar average' });
  });
});
