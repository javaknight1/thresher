import { describe, expect, it, vi } from 'vitest';
import type { Bar, Timeframe } from '@thresher/engine';
import { ProviderError } from '../lib/contracts';
import type { BarCache, CompanyProfile, MarketDataProvider } from '../lib/contracts';
import { WEB_CONFIG } from '../lib/config';
import { MemoryBarCache, getBarsWithFreshness } from '../lib/cache';

const TIMEFRAME: Timeframe = 'swing';
const TTL_MS = WEB_CONFIG.cache.ttlSeconds[TIMEFRAME] * 1_000;
const NOW = Date.parse('2026-06-10T15:00:00.000Z');

function makeBars(seed: number, count = 3): Bar[] {
  return Array.from({ length: count }, (_, i) => ({
    t: seed + i * 86_400_000,
    o: 100 + i,
    h: 101 + i,
    l: 99 + i,
    c: 100.5 + i,
    v: 1_000_000,
  }));
}

class FakeProvider implements MarketDataProvider {
  getBarsCalls = 0;

  constructor(
    private readonly result: Bar[] | ProviderError,
  ) {}

  async getBars(): Promise<Bar[]> {
    this.getBarsCalls += 1;
    if (this.result instanceof ProviderError) throw this.result;
    return this.result;
  }

  async getDaysToEarnings(): Promise<number | null> {
    return null;
  }

  async getProfile(): Promise<CompanyProfile> {
    throw new Error('getProfile not used in cache tests');
  }
}

const now = () => NOW;

describe('getBarsWithFreshness', () => {
  it('serves a fresh cache hit without calling the provider', async () => {
    const cache: BarCache = new MemoryBarCache();
    const cachedBars = makeBars(1);
    const fetchedAt = new Date(NOW - TTL_MS / 2).toISOString();
    await cache.set('NVDA', TIMEFRAME, { bars: cachedBars, fetchedAt }, 0);
    const provider = new FakeProvider(makeBars(999));

    const result = await getBarsWithFreshness(provider, cache, 'NVDA', TIMEFRAME, { now });

    expect(result).toEqual({ bars: cachedBars, fetchedAt, stale: false });
    expect(provider.getBarsCalls).toBe(0);
  });

  it('treats age exactly at the TTL boundary as fresh', async () => {
    const cache: BarCache = new MemoryBarCache();
    const fetchedAt = new Date(NOW - TTL_MS).toISOString();
    await cache.set('NVDA', TIMEFRAME, { bars: makeBars(1), fetchedAt }, 0);
    const provider = new FakeProvider(makeBars(999));

    const result = await getBarsWithFreshness(provider, cache, 'NVDA', TIMEFRAME, { now });

    expect(result.stale).toBe(false);
    expect(provider.getBarsCalls).toBe(0);
  });

  it('serves expired cache immediately as stale and refreshes in the background', async () => {
    const cache: BarCache = new MemoryBarCache();
    const oldBars = makeBars(1);
    const oldFetchedAt = new Date(NOW - TTL_MS - 1_000).toISOString();
    await cache.set('NVDA', TIMEFRAME, { bars: oldBars, fetchedAt: oldFetchedAt }, 0);
    const freshBars = makeBars(2);
    const provider = new FakeProvider(freshBars);

    const result = await getBarsWithFreshness(provider, cache, 'NVDA', TIMEFRAME, { now });

    // Stale entry returned immediately, untouched.
    expect(result).toEqual({ bars: oldBars, fetchedAt: oldFetchedAt, stale: true });

    // Background refresh fires and writes through to the cache.
    await vi.waitFor(async () => {
      const updated = await cache.get('NVDA', TIMEFRAME);
      expect(updated).toEqual({ bars: freshBars, fetchedAt: new Date(NOW).toISOString() });
    });
    expect(provider.getBarsCalls).toBe(1);
  });

  it('serves stale data without throwing when the provider is down (the §2.1 fallback)', async () => {
    const cache: BarCache = new MemoryBarCache();
    const oldBars = makeBars(1);
    const oldFetchedAt = new Date(NOW - TTL_MS - 1_000).toISOString();
    await cache.set('NVDA', TIMEFRAME, { bars: oldBars, fetchedAt: oldFetchedAt }, 0);
    const provider = new FakeProvider(new ProviderError('UNAVAILABLE', 'yahoo down'));

    const result = await getBarsWithFreshness(provider, cache, 'NVDA', TIMEFRAME, { now });

    expect(result).toEqual({ bars: oldBars, fetchedAt: oldFetchedAt, stale: true });
    // Background refresh attempted and its failure was swallowed.
    await vi.waitFor(() => expect(provider.getBarsCalls).toBe(1));
    expect(await cache.get('NVDA', TIMEFRAME)).toEqual({
      bars: oldBars,
      fetchedAt: oldFetchedAt,
    });
  });

  it('cold-fetches from the provider, caches, and returns stale:false', async () => {
    const cache: BarCache = new MemoryBarCache();
    const bars = makeBars(3);
    const provider = new FakeProvider(bars);

    const result = await getBarsWithFreshness(provider, cache, 'AAPL', TIMEFRAME, { now });

    expect(result).toEqual({ bars, fetchedAt: new Date(NOW).toISOString(), stale: false });
    expect(provider.getBarsCalls).toBe(1);
    expect(await cache.get('AAPL', TIMEFRAME)).toEqual({
      bars,
      fetchedAt: new Date(NOW).toISOString(),
    });
  });

  it('rethrows UNAVAILABLE on a cold fetch with the provider down', async () => {
    const cache: BarCache = new MemoryBarCache();
    const provider = new FakeProvider(new ProviderError('UNAVAILABLE', 'yahoo down'));

    await expect(
      getBarsWithFreshness(provider, cache, 'AAPL', TIMEFRAME, { now }),
    ).rejects.toMatchObject({ name: 'ProviderError', code: 'UNAVAILABLE' });
  });

  it('passes UNKNOWN_SYMBOL through untouched on a cold fetch', async () => {
    const cache: BarCache = new MemoryBarCache();
    const provider = new FakeProvider(new ProviderError('UNKNOWN_SYMBOL', 'no such ticker'));

    await expect(
      getBarsWithFreshness(provider, cache, 'ZZZZZZ', TIMEFRAME, { now }),
    ).rejects.toMatchObject({ name: 'ProviderError', code: 'UNKNOWN_SYMBOL' });
  });
});

describe('MemoryBarCache', () => {
  it('isolates entries by symbol and timeframe', async () => {
    const cache: BarCache = new MemoryBarCache();
    const swing = { bars: makeBars(1), fetchedAt: new Date(NOW).toISOString() };
    const position = { bars: makeBars(2), fetchedAt: new Date(NOW).toISOString() };
    await cache.set('NVDA', 'swing', swing, 0);
    await cache.set('NVDA', 'position', position, 0);

    expect(await cache.get('NVDA', 'swing')).toEqual(swing);
    expect(await cache.get('NVDA', 'position')).toEqual(position);
    expect(await cache.get('AAPL', 'swing')).toBeNull();
  });

  it('never evicts: entries remain readable past any TTL', async () => {
    const cache: BarCache = new MemoryBarCache();
    const value = { bars: makeBars(1), fetchedAt: '2020-01-01T00:00:00.000Z' };
    await cache.set('NVDA', 'swing', value, 1);
    expect(await cache.get('NVDA', 'swing')).toEqual(value);
  });
});
