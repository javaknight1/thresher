/**
 * Crypto analysis path — runAnalysis picks CRYPTO_CONFIG for a coin, sizes
 * fractionally, and never runs the earnings path. MockProvider only.
 */
import { describe, it, expect } from 'vitest';
import { cryptoConfigHash } from '@thresher/engine';
import { runAnalysis } from '../lib/analyze-service';
import { MemoryBarCache } from '../lib/cache';
import { MockProvider } from '../lib/providers/mock';

const now = (): Date => new Date('2026-01-01T00:00:00.000Z');
function run(symbol: string) {
  return runAnalysis({
    symbol,
    timeframe: 'swing',
    provider: new MockProvider(),
    cache: new MemoryBarCache(),
    now,
  });
}

describe('runAnalysis — crypto', () => {
  it('stamps the crypto config hash for a coin', async () => {
    const res = await run('BTC-USD');
    expect(res.ok).toBe(true);
    if (!res.ok || 'status' in res.body) throw new Error('expected a full analysis');
    expect(res.body.configHash).toBe(cryptoConfigHash);
  });

  it('never flags earnings for a coin (G5 off, no earnings lookup)', async () => {
    const res = await run('BTC-USD');
    if (!res.ok || 'status' in res.body) throw new Error('expected a full analysis');
    expect(res.body.flags.earningsInWindow).toBe(false);
  });

  it('sizes a high-priced coin fractionally (no floor to 0 units)', async () => {
    const res = await run('BTC-USD');
    if (!res.ok || 'status' in res.body) throw new Error('expected a full analysis');
    if (res.body.plan) {
      expect(res.body.plan.sizing.unitLabel).toBe('units');
      expect(res.body.plan.sizing.example.units).toBeGreaterThan(0);
    }
  });

  it('an equity still uses the equity config', async () => {
    const res = await run('MOCKLONG');
    if (!res.ok || 'status' in res.body) throw new Error('expected a full analysis');
    expect(res.body.configHash).not.toBe(cryptoConfigHash);
  });
});
