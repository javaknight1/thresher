/**
 * Point-in-time analysis (asOf) — runAnalysis replays a past instant using only
 * bars up to it (no lookahead) and disables the earnings veto. MockProvider +
 * MemoryBarCache only; Yahoo is never called (CLAUDE.md).
 *
 * The mock series is 300 daily bars from 2024-01-01 (fixed epoch), so an asOf of
 * 2024-10-01 sits deep in the window with far more than the ~130 bars the engine
 * needs, and strictly before the live window's last bar (~2024-10-26).
 */
import { describe, expect, it } from 'vitest';
import type { Timeframe } from '@thresher/engine';
import { runAnalysis } from '../lib/analyze-service';
import { MemoryBarCache } from '../lib/cache';
import { MockProvider } from '../lib/providers/mock';

const now = (): Date => new Date('2026-01-01T00:00:00.000Z');

function run(symbol: string, opts: { timeframe?: Timeframe; asOf?: Date } = {}) {
  return runAnalysis({
    symbol,
    timeframe: opts.timeframe ?? 'swing',
    provider: new MockProvider(),
    cache: new MemoryBarCache(),
    now,
    asOf: opts.asOf,
  });
}

const AS_OF = new Date('2024-10-01T00:00:00.000Z');

describe('runAnalysis — point-in-time (asOf)', () => {
  it('replays as of a past instant: historical flag set, asOf echoed, no lookahead', async () => {
    const res = await run('MOCKLONG', { asOf: AS_OF });
    expect(res.ok).toBe(true);
    if (!res.ok || 'status' in res.body) throw new Error('expected a full analysis');
    const body = res.body;

    expect(body.historical).toBe(true);
    expect(body.asOf).toBe(AS_OF.toISOString());
    // No bar after the as-of instant reached the engine.
    expect(Date.parse(body.dataFreshness)).toBeLessThanOrEqual(AS_OF.getTime());
    // Still a real, complete analysis.
    expect(['long', 'short', 'none']).toContain(body.direction);
  });

  it('a live analysis carries no historical flag and sees fresher bars', async () => {
    const live = await run('MOCKLONG');
    const hist = await run('MOCKLONG', { asOf: AS_OF });
    if (!live.ok || 'status' in live.body) throw new Error('expected a full analysis');
    if (!hist.ok || 'status' in hist.body) throw new Error('expected a full analysis');

    expect(live.body.historical).toBeUndefined();
    // The live window ends after the historical slice.
    expect(Date.parse(live.body.dataFreshness)).toBeGreaterThan(
      Date.parse(hist.body.dataFreshness),
    );
  });

  it('disables the earnings veto for historical dates', async () => {
    // MOCKEARNINGS reports 1 trading day to earnings (inside the swing veto window).
    const live = await run('MOCKEARNINGS');
    const hist = await run('MOCKEARNINGS', { asOf: AS_OF });
    if (!live.ok || 'status' in live.body) throw new Error('expected a full analysis');
    if (!hist.ok || 'status' in hist.body) throw new Error('expected a full analysis');

    expect(live.body.flags.earningsInWindow).toBe(true);
    expect(hist.body.flags.earningsInWindow).toBe(false);
  });
});
