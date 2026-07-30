/**
 * Scan service tests — buildUniverse + runScan with the MockProvider only
 * (Yahoo is never hit in tests, CLAUDE.md). The MockProvider's getMovers
 * returns a mix that exercises every outcome: MOCKLONG emits, MOCKCHOP + the
 * generics refuse, MOCKNEW is too-new (skipped), MOCKUNKNOWN errors (skipped).
 */
import { describe, expect, it } from 'vitest';
import { MemoryBarCache } from '../lib/cache';
import { MockProvider } from '../lib/providers/mock';
import { buildUniverse, runScan } from '../lib/scan-service';
import { WEB_CONFIG } from '../lib/config';

const now = () => new Date('2024-06-01T00:00:00.000Z');

describe('buildUniverse', () => {
  it('merges curated + movers, dedups, and caps at maxUniverse', async () => {
    const universe = await buildUniverse(new MockProvider());
    expect(universe.length).toBeLessThanOrEqual(WEB_CONFIG.scan.maxUniverse);
    expect(new Set(universe).size).toBe(universe.length); // no dupes
    // Curated names lead the list.
    expect(universe[0]).toBe(WEB_CONFIG.scan.curated[0]);
    // A mover unique to getMovers is present (subject to the cap).
    expect(universe).toContain('MOCKLONG');
  });

  it('falls back to the curated universe when getMovers throws', async () => {
    const provider = new MockProvider();
    provider.getMovers = async () => {
      throw new Error('screener down');
    };
    const universe = await buildUniverse(provider);
    expect(universe).toEqual([...WEB_CONFIG.scan.curated].slice(0, WEB_CONFIG.scan.maxUniverse));
  });
});

describe('runScan', () => {
  it('ranks only gate-passing setups and collapses the rest into counts', async () => {
    const provider = new MockProvider();
    const cache = new MemoryBarCache();
    const universe = ['MOCKLONG', 'MOCKCHOP', 'MOCKNEW', 'MOCKUNKNOWN', 'GENONE'];

    const board = await runScan({ timeframe: 'swing', provider, cache, now, universe });

    expect(board.timeframe).toBe('swing');
    expect(board.asOf).toBe('2024-06-01T00:00:00.000Z');
    expect(board.universeSize).toBe(universe.length);

    // MOCKLONG emits; MOCKCHOP + GENONE refuse; MOCKNEW + MOCKUNKNOWN skip.
    expect(board.emitted).toBeGreaterThanOrEqual(1);
    expect(board.skipped).toBe(2);
    expect(board.emitted + board.refused + board.skipped).toBe(universe.length);

    // Every row is a real, gate-passing setup with actionable trade levels.
    for (const row of board.rows) {
      expect(['long', 'short']).toContain(row.direction);
      expect(row.rr).toBeGreaterThan(0);
      expect(row.qualityRank).toBeCloseTo((row.confidence / 100) * row.rr);
      expect(row.score).toBeGreaterThanOrEqual(0);
      expect(row.score).toBeLessThanOrEqual(100);
      expect(row.driver.length).toBeGreaterThan(0);
      expect(row.entry).toBeGreaterThan(0);
      expect(row.stop).toBeGreaterThan(0);
      expect(row.target).toBeGreaterThan(0);
      // long: stop < entry < target; short mirrors.
      if (row.direction === 'long') {
        expect(row.stop).toBeLessThan(row.entry);
        expect(row.target).toBeGreaterThan(row.entry);
      } else {
        expect(row.stop).toBeGreaterThan(row.entry);
        expect(row.target).toBeLessThan(row.entry);
      }
    }
    // MOCKLONG (a clean uptrend) is on the board.
    expect(board.rows.map((r) => r.symbol)).toContain('MOCKLONG');
  });

  it('sorts rows by setup score descending and caps at topN', async () => {
    const provider = new MockProvider();
    const cache = new MemoryBarCache();
    const board = await runScan({ timeframe: 'swing', provider, cache, now });

    expect(board.rows.length).toBeLessThanOrEqual(WEB_CONFIG.scan.topN);
    for (let i = 1; i < board.rows.length; i++) {
      expect(board.rows[i - 1].score).toBeGreaterThanOrEqual(board.rows[i].score);
    }
  });
});
