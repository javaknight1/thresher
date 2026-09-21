/**
 * Point-in-time earnings store + capture. MemoryEarningsStore behavior and the
 * capture hook in runAnalysis (live records, historical does not). MockProvider
 * only — never Yahoo.
 */
import { describe, it, expect } from 'vitest';
import { MemoryEarningsStore, type EarningsStore } from '../lib/earnings-store';
import { runAnalysis } from '../lib/analyze-service';
import { MemoryBarCache } from '../lib/cache';
import { MockProvider } from '../lib/providers/mock';

describe('MemoryEarningsStore', () => {
  it('records distinct dates per symbol (ascending), and indexes symbols', async () => {
    const s = new MemoryEarningsStore();
    await s.record('nvda', '2024-05-01T00:00:00.000Z');
    await s.record('NVDA', '2024-05-01T00:00:00.000Z'); // duplicate (normalized) → ignored
    await s.record('NVDA', '2024-02-01T00:00:00.000Z');
    expect(await s.dates('NVDA')).toEqual([
      '2024-02-01T00:00:00.000Z',
      '2024-05-01T00:00:00.000Z',
    ]);
    expect(await s.symbols()).toEqual(['NVDA']);
  });

  it('nextAfter returns the earliest observed date strictly after the cutoff', async () => {
    const s = new MemoryEarningsStore();
    await s.record('AAPL', '2024-02-01T00:00:00.000Z');
    await s.record('AAPL', '2024-05-01T00:00:00.000Z');
    expect(await s.nextAfter('AAPL', '2024-03-01T00:00:00.000Z')).toBe('2024-05-01T00:00:00.000Z');
    expect(await s.nextAfter('AAPL', '2024-01-01T00:00:00.000Z')).toBe('2024-02-01T00:00:00.000Z');
    expect(await s.nextAfter('AAPL', '2024-06-01T00:00:00.000Z')).toBeNull();
  });
});

describe('runAnalysis — earnings capture', () => {
  const now = (): Date => new Date('2026-01-01T00:00:00.000Z');
  function run(symbol: string, store?: EarningsStore, asOf?: Date) {
    return runAnalysis({
      symbol,
      timeframe: 'swing',
      provider: new MockProvider(),
      cache: new MemoryBarCache(),
      now,
      earningsStore: store,
      asOf,
    });
  }

  it('records the observed next-earnings date on a live analysis', async () => {
    const store = new MemoryEarningsStore();
    await run('MOCKEARNINGS', store);
    const dates = await store.dates('MOCKEARNINGS');
    expect(dates.length).toBe(1);
    expect(typeof dates[0]).toBe('string');
  });

  it('captures nothing for a symbol with no earnings', async () => {
    const store = new MemoryEarningsStore();
    await run('MOCKLONG', store);
    expect(await store.symbols()).toEqual([]);
  });

  it('does NOT capture on a historical replay (no point-in-time calendar)', async () => {
    const store = new MemoryEarningsStore();
    await run('MOCKEARNINGS', store, new Date('2024-10-01T00:00:00.000Z'));
    expect(await store.symbols()).toEqual([]);
  });
});
