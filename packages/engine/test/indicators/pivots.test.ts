import { describe, expect, it } from 'vitest';
import { pivotLevels } from '../../src/indicators/pivots';
import type { Bar } from '../../src/types';
import type { EngineConfig } from '../../src/config';
import { genBars } from '../fixtures/bars';

/** Methodology I.10 defaults, spelled out so each test reads against the spec. */
const CFG: EngineConfig['indicators']['pivots'] = {
  window: 5,
  zoneMergeAtrMult: 0.5,
  nearLevelBuffer: 0.004,
  syntheticAtrMult: 2.5,
};

/**
 * Flat tape: every bar o=c=base, h=base+wick, l=base−wick. Equal highs/lows
 * everywhere means NO bar is a fractal pivot (strict inequality) until we
 * plant a spike — perfect substrate for hand-verifiable pivots.
 */
function flatBars(count: number, base = 100, wick = 0.5, vol = 1000): Bar[] {
  return Array.from({ length: count }, (_, i) => ({
    t: i,
    o: base,
    h: base + wick,
    l: base - wick,
    c: base,
    v: vol,
  }));
}

function spikeHigh(bars: Bar[], i: number, price: number, volume = bars[i].v): void {
  bars[i] = { ...bars[i], h: price, v: volume };
}

function spikeLow(bars: Bar[], i: number, price: number, volume = bars[i].v): void {
  bars[i] = { ...bars[i], l: price, v: volume };
}

describe('pivotLevels — step 1: fractal detection (methodology I.10)', () => {
  it('detects a single planted pivot high and pivot low', () => {
    const bars = flatBars(30);
    spikeHigh(bars, 10, 105);
    spikeLow(bars, 20, 95);

    const { support, resistance, zonesAbove, zonesBelow } = pivotLevels(bars, 1, CFG);

    expect(zonesAbove).toEqual([{ price: 105, strength: 1 }]);
    expect(zonesBelow).toEqual([{ price: 95, strength: 1 }]);
    expect(resistance).toEqual({ price: 105, strength: 1, synthetic: false });
    expect(support).toEqual({ price: 95, strength: 1, synthetic: false });
  });

  it('a spike within the last w bars is NOT a pivot (no right side)', () => {
    const bars = flatBars(30);
    spikeHigh(bars, 27, 105); // needs neighbors through index 32 — doesn't have them

    const { resistance, zonesAbove } = pivotLevels(bars, 1, CFG);

    expect(zonesAbove).toEqual([]);
    expect(resistance.synthetic).toBe(true);
  });

  it('a spike within the first w bars is NOT a pivot (no left side)', () => {
    const bars = flatBars(30);
    spikeLow(bars, 3, 95); // needs neighbors from index −2 — doesn't have them

    const { support, zonesBelow } = pivotLevels(bars, 1, CFG);

    expect(zonesBelow).toEqual([]);
    expect(support.synthetic).toBe(true);
  });

  it('strict inequality: equal highs inside one window ⇒ neither is a pivot', () => {
    const bars = flatBars(30);
    spikeHigh(bars, 10, 105);
    spikeHigh(bars, 13, 105); // inside bar 10's window and equal — both disqualified

    const { resistance, zonesAbove } = pivotLevels(bars, 1, CFG);

    expect(zonesAbove).toEqual([]);
    expect(resistance.synthetic).toBe(true);
  });
});

describe('pivotLevels — step 2: zone merging', () => {
  it('two pivots within 0.5×ATR merge into one zone at the volume-weighted mean', () => {
    const bars = flatBars(40);
    spikeHigh(bars, 10, 105.0, 1000);
    spikeHigh(bars, 20, 105.4, 3000); // 0.4 apart ≤ 0.5×ATR(=1) → merges

    const { zonesAbove } = pivotLevels(bars, 1, CFG);

    // VW mean = (105.0×1000 + 105.4×3000) / 4000 = 421200 / 4000 = 105.3
    expect(zonesAbove).toHaveLength(1);
    expect(zonesAbove[0].price).toBeCloseTo(105.3, 12);
    expect(zonesAbove[0].strength).toBe(2);
  });

  it('pivots farther apart than 0.5×ATR stay separate zones', () => {
    const bars = flatBars(40);
    spikeHigh(bars, 10, 105);
    spikeHigh(bars, 20, 106); // 1.0 apart > 0.5×ATR(=1)×0.5 → separate

    const { zonesAbove } = pivotLevels(bars, 1, CFG);

    expect(zonesAbove).toEqual([
      { price: 105, strength: 1 },
      { price: 106, strength: 1 },
    ]);
  });

  it('zero total cluster volume falls back to the arithmetic mean (documented guard)', () => {
    const bars = flatBars(40);
    spikeHigh(bars, 10, 105.0, 0);
    spikeHigh(bars, 20, 105.4, 0);

    const { zonesAbove } = pivotLevels(bars, 1, CFG);

    expect(zonesAbove).toHaveLength(1);
    expect(zonesAbove[0].price).toBeCloseTo(105.2, 12); // (105.0 + 105.4) / 2
    expect(zonesAbove[0].strength).toBe(2);
  });
});

describe('pivotLevels — step 3: near-level buffer', () => {
  it('a level just above close (within 0.4%) is excluded from zonesAbove', () => {
    const bars = flatBars(30, 100, 0.1); // narrow wicks so a 100.3 spike is a strict max
    spikeHigh(bars, 10, 100.3); // 100.3 < 100 × 1.004 = 100.4 → price is sitting on it
    spikeHigh(bars, 20, 103);

    const { resistance, zonesAbove, zonesBelow } = pivotLevels(bars, 1, CFG);

    expect(zonesAbove).toEqual([{ price: 103, strength: 1 }]);
    expect(zonesBelow).toEqual([]); // 100.3 is not below 100 × 0.996 either
    expect(resistance).toEqual({ price: 103, strength: 1, synthetic: false });
  });

  it('a level just below close (within 0.4%) is excluded from zonesBelow', () => {
    const bars = flatBars(30, 100, 0.1);
    spikeLow(bars, 10, 99.7); // 99.7 > 100 × 0.996 = 99.6 → sitting on it
    spikeLow(bars, 20, 97);

    const { support, zonesBelow } = pivotLevels(bars, 1, CFG);

    expect(zonesBelow).toEqual([{ price: 97, strength: 1 }]);
    expect(support).toEqual({ price: 97, strength: 1, synthetic: false });
  });
});

describe('pivotLevels — step 4: synthetic fallback', () => {
  it('no zones in range → close ± 2.5×ATR, synthetic: true, strength 0', () => {
    const bars = flatBars(30); // flat tape: zero pivots anywhere
    const atr = 2;

    const { support, resistance, zonesAbove, zonesBelow } = pivotLevels(bars, atr, CFG);

    expect(zonesAbove).toEqual([]);
    expect(zonesBelow).toEqual([]);
    expect(resistance).toEqual({ price: 100 + 2.5 * atr, strength: 0, synthetic: true });
    expect(support).toEqual({ price: 100 - 2.5 * atr, strength: 0, synthetic: true });
  });

  it('fallback applies per side: real support below, synthetic resistance above', () => {
    const bars = flatBars(30);
    spikeLow(bars, 12, 95);

    const { support, resistance } = pivotLevels(bars, 1, CFG);

    expect(support).toEqual({ price: 95, strength: 1, synthetic: false });
    expect(resistance).toEqual({ price: 100 + 2.5, strength: 0, synthetic: true });
  });
});

describe('pivotLevels — ordering (nearest first on both sides)', () => {
  it('zonesAbove ascending, zonesBelow descending; support/resistance are the nearest', () => {
    const bars = flatBars(60);
    spikeHigh(bars, 10, 107);
    spikeHigh(bars, 20, 103);
    spikeLow(bars, 30, 93);
    spikeLow(bars, 40, 97);

    const { support, resistance, zonesAbove, zonesBelow } = pivotLevels(bars, 1, CFG);

    expect(zonesAbove.map((z) => z.price)).toEqual([103, 107]);
    expect(zonesBelow.map((z) => z.price)).toEqual([97, 93]);
    expect(resistance.price).toBe(103);
    expect(support.price).toBe(97);
  });
});

describe('pivotLevels — invariants on deterministic synthetic tape', () => {
  it('selection, buffer, and ordering invariants hold on genBars output', () => {
    for (const seed of ['pivots-a', 'pivots-b', 'pivots-c']) {
      const bars = genBars(seed, 250);
      const close = bars[bars.length - 1].c;
      const atr = close * 0.02; // plausible fixed ATR; pivots only scale by it

      const { support, resistance, zonesAbove, zonesBelow } = pivotLevels(bars, atr, CFG);

      for (const z of zonesAbove) expect(z.price).toBeGreaterThan(close * 1.004);
      for (const z of zonesBelow) expect(z.price).toBeLessThan(close * 0.996);
      for (let i = 1; i < zonesAbove.length; i++) {
        expect(zonesAbove[i].price).toBeGreaterThan(zonesAbove[i - 1].price);
      }
      for (let i = 1; i < zonesBelow.length; i++) {
        expect(zonesBelow[i].price).toBeLessThan(zonesBelow[i - 1].price);
      }
      if (zonesAbove.length > 0) {
        expect(resistance).toEqual({ ...zonesAbove[0], synthetic: false });
      } else {
        expect(resistance).toEqual({ price: close + 2.5 * atr, strength: 0, synthetic: true });
      }
      if (zonesBelow.length > 0) {
        expect(support).toEqual({ ...zonesBelow[0], synthetic: false });
      } else {
        expect(support).toEqual({ price: close - 2.5 * atr, strength: 0, synthetic: true });
      }
      for (const z of [...zonesAbove, ...zonesBelow]) {
        expect(z.strength).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('same seed ⇒ identical result (purity)', () => {
    const a = pivotLevels(genBars('pivots-det', 250), 2, CFG);
    const b = pivotLevels(genBars('pivots-det', 250), 2, CFG);
    expect(b).toEqual(a);
  });
});

describe('pivotLevels — input validation', () => {
  it('rejects empty bars (no close to anchor selection)', () => {
    expect(() => pivotLevels([], 1, CFG)).toThrow(RangeError);
  });

  it('rejects non-positive and non-integer windows', () => {
    const bars = flatBars(30);
    expect(() => pivotLevels(bars, 1, { ...CFG, window: 0 })).toThrow(RangeError);
    expect(() => pivotLevels(bars, 1, { ...CFG, window: 2.5 })).toThrow(RangeError);
  });
});
