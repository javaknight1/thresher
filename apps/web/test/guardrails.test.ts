import { describe, expect, it } from 'vitest';
import type { Bar } from '@thresher/engine';
import { checkGuardrails } from '../lib/guardrails';
import { countTradingDays } from '../lib/providers/yahoo';
import { WEB_CONFIG } from '../lib/config';

/** Flat synthetic bars: `count` bars at `close` with `volume` shares each. */
function flatBars(count: number, close: number, volume: number): Bar[] {
  return Array.from({ length: count }, (_, i) => ({
    t: Date.UTC(2024, 0, 1) + i * 86_400_000,
    o: close,
    h: close,
    l: close,
    c: close,
    v: volume,
  }));
}

const { minPrice, minAvgDollarVolume, perDayFactor, windowBars } = WEB_CONFIG.guardrails;

describe('checkGuardrails', () => {
  it('rejects a price below the floor with a human-readable reason', () => {
    const result = checkGuardrails(flatBars(40, 1.2, 10_000_000), 'swing');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('$1.20');
      expect(result.reason).toContain(`$${minPrice} floor`);
    }
  });

  it('passes a price exactly at the floor (boundary)', () => {
    // volume large enough that only the price check is in play
    const volume = minAvgDollarVolume / minPrice; // dollar volume exactly at floor
    const result = checkGuardrails(flatBars(40, minPrice, volume), 'swing');
    expect(result).toEqual({ ok: true });
  });

  it('rejects thin dollar volume with a human-readable reason', () => {
    // $10 × 50k shares = $500K/day < $1M floor on daily bars
    const result = checkGuardrails(flatBars(40, 10, 50_000), 'swing');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('$500K');
      expect(result.reason).toContain('floor');
    }
  });

  it('passes dollar volume exactly at the floor (boundary)', () => {
    const volume = minAvgDollarVolume / 10; // $10 close × this = exactly the floor
    const result = checkGuardrails(flatBars(40, 10, volume), 'swing');
    expect(result).toEqual({ ok: true });
  });

  it('passes a liquid large-cap style series on every timeframe', () => {
    for (const tf of ['intraday', 'swing', 'position'] as const) {
      expect(checkGuardrails(flatBars(300, 150, 5_000_000), tf)).toEqual({ ok: true });
    }
  });

  it('normalizes intraday hourly bars to per-day dollar volume', () => {
    // mean bar dollar volume $200K × 6.5 bars/session = $1.3M/day → passes,
    // even though a single hourly bar is far below the floor.
    const perBar = 200_000 / 10;
    expect(checkGuardrails(flatBars(40, 10, perBar), 'intraday')).toEqual({ ok: true });
    expect(perDayFactor.intraday).toBeGreaterThan(1);
  });

  it('normalizes weekly bars down — a weekly bar must carry ~5 days of volume', () => {
    // $4M per weekly bar × 0.2 = $800K/day → rejected.
    const result = checkGuardrails(flatBars(40, 10, 400_000), 'position');
    expect(result.ok).toBe(false);
  });

  it('only looks at the last windowBars bars', () => {
    // Old bars are dead, but the recent window is liquid → passes.
    const dead = flatBars(100, 10, 0);
    const live = flatBars(windowBars, 10, 1_000_000).map((b, i) => ({
      ...b,
      t: dead[dead.length - 1].t + (i + 1) * 86_400_000,
    }));
    expect(checkGuardrails([...dead, ...live], 'swing')).toEqual({ ok: true });
  });

  it('rejects an empty bar series', () => {
    const result = checkGuardrails([], 'swing');
    expect(result.ok).toBe(false);
  });
});

/**
 * countTradingDays is the YahooProvider's only unit-testable piece — the
 * provider itself is never exercised in tests (no network). Weekday counting
 * only; holidays are a documented approximation.
 */
describe('countTradingDays', () => {
  it('counts consecutive weekdays (Mon → Fri = 4)', () => {
    expect(countTradingDays(new Date('2026-06-08T14:00:00Z'), new Date('2026-06-12T12:00:00Z'))).toBe(4);
  });

  it('skips weekends (Fri → Mon = 1)', () => {
    expect(countTradingDays(new Date('2026-06-12T00:00:00Z'), new Date('2026-06-15T00:00:00Z'))).toBe(1);
  });

  it('counts a full week Mon → next Mon as 5', () => {
    expect(countTradingDays(new Date('2026-06-08T00:00:00Z'), new Date('2026-06-15T00:00:00Z'))).toBe(5);
  });

  it('returns 0 for the same calendar day regardless of time', () => {
    expect(countTradingDays(new Date('2026-06-10T01:00:00Z'), new Date('2026-06-10T23:00:00Z'))).toBe(0);
  });

  it('returns 0 when the target is in the past', () => {
    expect(countTradingDays(new Date('2026-06-10T00:00:00Z'), new Date('2026-06-01T00:00:00Z'))).toBe(0);
  });

  it('does not count weekend endpoints (Wed → Sat = 2: Thu, Fri)', () => {
    expect(countTradingDays(new Date('2026-06-10T00:00:00Z'), new Date('2026-06-13T00:00:00Z'))).toBe(2);
  });

  it('counts from a weekend start (Sat → Mon = 1)', () => {
    expect(countTradingDays(new Date('2026-06-13T00:00:00Z'), new Date('2026-06-15T00:00:00Z'))).toBe(1);
  });
});
