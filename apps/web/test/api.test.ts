/**
 * API service tests — runAnalysis exercised directly with MockProvider +
 * MemoryBarCache. NEVER calls Yahoo (CLAUDE.md testing requirement); the
 * route is a thin HTTP shell over this service.
 *
 * Outcomes for the mock symbols are deterministic (seeded PRNG, fixed epoch),
 * so the assertions pin exact engine behavior, not just shapes.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, smaSeries } from '@thresher/engine';
import type { Bar, Timeframe } from '@thresher/engine';
import { runAnalysis } from '../lib/analyze-service';
import { MemoryBarCache } from '../lib/cache';
import { MockProvider } from '../lib/providers/mock';
import type { CompanyProfile, MarketDataProvider } from '../lib/contracts';
import { WEB_CONFIG } from '../lib/config';

/** Fixed clock: deterministic asOf/dataFreshness and cache freshness. */
const FIXED_NOW = '2026-01-01T00:00:00.000Z';
const now = (): Date => new Date(FIXED_NOW);

function run(symbol: string, timeframe: Timeframe = 'swing', provider?: MarketDataProvider) {
  return runAnalysis({
    symbol,
    timeframe,
    provider: provider ?? new MockProvider(),
    cache: new MemoryBarCache(),
    now,
  });
}

function isIso(s: string): boolean {
  return new Date(s).toISOString() === s;
}

describe('runAnalysis — MOCKLONG/swing emits a LONG (§8 field-for-field)', () => {
  it('returns every AnalyzeResponse field with the correct type', async () => {
    const res = await run('MOCKLONG');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    if ('status' in res.body) throw new Error('expected a full analysis, got partial');
    const body = res.body;

    // Exact key set of the frozen §8 contract — nothing missing, nothing extra.
    expect(Object.keys(body).sort()).toEqual(
      [
        'symbol', 'timeframe', 'asOf', 'dataFreshness', 'stale',
        'engineVersion', 'configHash', 'price', 'direction', 'composite',
        'confidence', 'gates', 'plan', 'refusal', 'families', 'levels',
        'indicators', 'flags', 'story', 'chart',
      ].sort(),
    );

    expect(body.symbol).toBe('MOCKLONG');
    expect(body.timeframe).toBe('swing');
    expect(isIso(body.asOf)).toBe(true);
    expect(body.asOf).toBe(FIXED_NOW);
    expect(isIso(body.dataFreshness)).toBe(true);
    expect(body.stale).toBe(false);
    expect(typeof body.engineVersion).toBe('string');
    expect(body.engineVersion.length).toBeGreaterThan(0);
    expect(body.configHash).toMatch(/^[0-9a-f]{6}$/);
    expect(body.price).toBeGreaterThan(0);
    expect(body.direction).toBe('long');
    expect(typeof body.composite).toBe('number');

    // confidence
    expect(typeof body.confidence.score).toBe('number');
    expect(['high', 'moderate', 'low']).toContain(body.confidence.bucket);
    expect(Array.isArray(body.confidence.penalties)).toBe(true);
    for (const p of body.confidence.penalties) {
      expect(typeof p.reason).toBe('string');
      expect(p.points).toBeLessThan(0);
    }

    // gates: all five evaluated and passing on the clean trend
    expect(body.gates).toHaveLength(5);
    expect(body.gates.map((g) => g.gate)).toEqual(['G1', 'G2', 'G3', 'G4', 'G5']);
    for (const g of body.gates) {
      expect(g.pass).toBe(true);
      expect(typeof g.text).toBe('string');
    }

    // plan (emitted → non-null, refusal null)
    expect(body.refusal).toBeNull();
    expect(body.plan).not.toBeNull();
    if (body.plan) {
      expect(body.plan.entry).toBeCloseTo(body.price);
      expect(body.plan.stop).toBeLessThan(body.plan.entry); // long
      expect(body.plan.target).toBeGreaterThan(body.plan.entry);
      expect(typeof body.plan.stopBasis).toBe('string');
      expect(body.plan.stopBasis.length).toBeGreaterThan(0);
      expect(typeof body.plan.targetBasis).toBe('string');
      expect(body.plan.riskPct).toBeGreaterThan(0);
      expect(body.plan.rewardPct).toBeGreaterThan(0);
      expect(body.plan.rr).toBeGreaterThanOrEqual(DEFAULT_CONFIG.gates.minRR);
      expect(typeof body.plan.overheadWarning).toBe('boolean');
      expect(body.plan.sizing.riskFraction).toBeGreaterThan(0);
      expect(body.plan.sizing.example.account).toBeGreaterThan(0);
      expect(Number.isInteger(body.plan.sizing.example.shares)).toBe(true);
      expect(typeof body.plan.ev.value).toBe('number');
      expect(body.plan.ev.calibrated).toBe(false);
    }

    // families: all four, every detail carries a reason string (hard rule 2)
    expect(body.families).toHaveLength(4);
    expect(body.families.map((f) => f.key).sort()).toEqual(
      ['momentum', 'structure', 'trend', 'volume'],
    );
    for (const f of body.families) {
      expect(typeof f.score).toBe('number');
      expect(f.weight).toBeGreaterThan(0);
      expect(f.details.length).toBeGreaterThan(0);
      for (const d of f.details) {
        expect([1, 0, -1]).toContain(d.ok);
        expect(d.text.length).toBeGreaterThan(0);
      }
    }

    // levels straddle the price (synthetic fallback also satisfies this:
    // it sits ±2.5×ATR away — assert unconditionally, plus the flags' types)
    expect(body.levels.support).toBeLessThan(body.price);
    expect(body.levels.resistance).toBeGreaterThan(body.price);
    expect(typeof body.levels.synthetic.support).toBe('boolean');
    expect(typeof body.levels.synthetic.resistance).toBe('boolean');

    // indicators: finite readings for all five
    for (const key of ['rsi', 'adx', 'atr', 'relVol', 'percentB'] as const) {
      expect(Number.isFinite(body.indicators[key])).toBe(true);
    }

    expect(typeof body.flags.earningsInWindow).toBe('boolean');
    expect(body.story.length).toBeGreaterThan(0);

    // chart: window of ≤ 130 bars, SMA overlays aligned to the same window
    expect(body.chart.bars.length).toBeLessThanOrEqual(WEB_CONFIG.chart.bars);
    expect(body.chart.sma20).toHaveLength(body.chart.bars.length);
    expect(body.chart.sma50).toHaveLength(body.chart.bars.length);
    for (const v of [...body.chart.sma20, ...body.chart.sma50]) {
      expect(v === null || Number.isFinite(v)).toBe(true);
    }
  });
});

describe('runAnalysis — refusals are first-class results', () => {
  it('MOCKCHOP/swing refuses with a gate and a reason, plan null', async () => {
    const res = await run('MOCKCHOP');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    if ('status' in res.body) throw new Error('expected a full analysis, got partial');
    expect(res.body.refusal).not.toBeNull();
    expect(res.body.refusal?.gate).toMatch(/^G[1-5]$/);
    expect(res.body.refusal?.reason.length).toBeGreaterThan(0);
    expect(res.body.plan).toBeNull();
    expect(res.body.direction).toBe('none');
  });
});

describe('runAnalysis — error mapping', () => {
  it('MOCKUNKNOWN maps to UNKNOWN_SYMBOL', async () => {
    const res = await run('MOCKUNKNOWN');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.error).toBe('UNKNOWN_SYMBOL');
    expect(res.error.message.length).toBeGreaterThan(0);
  });

  it('MOCKCHEAP trips the price guardrail → UNTRADEABLE_SYMBOL mentioning the floor', async () => {
    const res = await run('MOCKCHEAP');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.error).toBe('UNTRADEABLE_SYMBOL');
    expect(res.error.message).toContain(`$${WEB_CONFIG.guardrails.minPrice} floor`);
  });

  it('MOCKNEW (too few bars) returns a partial result with a chart, not a 500', async () => {
    const res = await run('MOCKNEW');
    // The engine THROWS on insufficient history; the service must convert that
    // into a first-class PARTIAL result (200) — never let it escape as a 500.
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect('status' in res.body).toBe(true);
    if (!('status' in res.body)) return;
    expect(res.body.status).toBe('insufficient_history');
    expect(res.body.symbol).toBe('MOCKNEW');
    expect(res.body.barsAvailable).toBeLessThan(res.body.barsNeeded);
    // The chart still renders on the too-new page, so bars must be present.
    expect(res.body.chart.bars.length).toBeGreaterThan(0);
    expect(res.body.price).toBeGreaterThan(0);
  });
});

describe('runAnalysis — earnings context (MOCKEARNINGS/swing)', () => {
  it('flags earningsInWindow; this series deterministically refuses at G1 first', async () => {
    const res = await run('MOCKEARNINGS');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    if ('status' in res.body) throw new Error('expected a full analysis, got partial');
    const body = res.body;

    // getDaysToEarnings = 1 ≤ the swing veto window → flag set.
    expect(body.flags.earningsInWindow).toBe(true);

    // The generic MOCKEARNINGS tape nets out below the ±0.22 edge threshold,
    // so gates short-circuit at G1 before the earnings gate (G5) is reached.
    // Pinned per the engine's deterministic output; if the engine ever emits
    // here instead, the earnings penalty must appear in confidence.
    if (body.refusal === null) {
      expect(
        body.confidence.penalties.some((p) => /earnings/i.test(p.reason)),
      ).toBe(true);
    } else {
      expect(body.refusal.gate).toBe('G1');
      expect(body.plan).toBeNull();
    }
    expect(body.refusal?.gate).toBe('G1'); // deterministic today — see above
  });
});

describe('runAnalysis — caching', () => {
  /** Wraps a provider, counting getBars calls. */
  class CountingProvider implements MarketDataProvider {
    getBarsCalls = 0;
    constructor(private readonly inner: MarketDataProvider) {}
    getBars(symbol: string, timeframe: Timeframe): Promise<Bar[]> {
      this.getBarsCalls += 1;
      return this.inner.getBars(symbol, timeframe);
    }
    getDaysToEarnings(symbol: string, nowDate?: Date): Promise<number | null> {
      return this.inner.getDaysToEarnings(symbol, nowDate);
    }
    getProfile(symbol: string): Promise<CompanyProfile> {
      return this.inner.getProfile(symbol);
    }
    getMovers(): Promise<string[]> {
      return this.inner.getMovers();
    }
  }

  it('second analysis with the same cache serves bars without a provider call', async () => {
    const provider = new CountingProvider(new MockProvider());
    const cache = new MemoryBarCache();
    const first = await runAnalysis({ symbol: 'MOCKLONG', timeframe: 'swing', provider, cache, now });
    const second = await runAnalysis({ symbol: 'MOCKLONG', timeframe: 'swing', provider, cache, now });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(provider.getBarsCalls).toBe(1);
    if (first.ok && second.ok) {
      expect(second.body.dataFreshness).toBe(first.body.dataFreshness);
      expect(second.body.stale).toBe(false);
    }
  });
});

describe('runAnalysis — chart alignment', () => {
  it('SMA overlays equal the full-series SMA sliced to the chart window', async () => {
    const res = await run('MOCKLONG');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const { chart } = res.body;

    // Recompute over ALL bars (the mock is deterministic), then slice — the
    // overlay must NOT be re-seeded from the visible window alone.
    const allBars = await new MockProvider().getBars('MOCKLONG', 'swing');
    const closes = allBars.map((b) => b.c);
    const { short, mid } = DEFAULT_CONFIG.indicators.sma;
    const want20 = smaSeries(closes, short).slice(-WEB_CONFIG.chart.bars);
    const want50 = smaSeries(closes, mid).slice(-WEB_CONFIG.chart.bars);

    expect(chart.bars).toEqual(allBars.slice(-WEB_CONFIG.chart.bars));
    expect(chart.sma20).toEqual(want20);
    expect(chart.sma50).toEqual(want50);

    // Spot-check: the last overlay value is the SMA of the last `period` closes.
    const last20 = closes.slice(-short).reduce((a, b) => a + b, 0) / short;
    expect(chart.sma20[chart.sma20.length - 1]).toBeCloseTo(last20, 10);
  });
});
