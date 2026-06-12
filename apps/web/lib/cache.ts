/**
 * Bar cache + stale-while-revalidate freshness layer — design §2.1.
 *
 * Two `BarCache` implementations (in-memory Map, Upstash Redis) behind
 * `createBarCache()`, plus `getBarsWithFreshness()` which implements the
 * serve-fresh / serve-stale-and-refresh / cold-fetch flow the API route uses.
 */
import { Redis } from '@upstash/redis';
import type { Timeframe } from '@thresher/engine';
import type {
  BarCache,
  BarsWithFreshness,
  CachedBars,
  MarketDataProvider,
} from './contracts';
import { WEB_CONFIG } from './config';

/**
 * Physical (Redis) TTL = logical TTL × this factor, so expired-but-recent data
 * survives in Redis and can be served stale when the provider is down
 * (design §2.1: stale fallback beats failing).
 */
export const PHYSICAL_TTL_FACTOR = 4;

const MS_PER_SECOND = 1_000;

/**
 * Cache key per design §2.1: `ohlcv:{symbol}:{interval}`. The interval is the
 * timeframe's bar interval from WEB_CONFIG.provider.lookback (1h / 1d / 1wk),
 * so e.g. `ohlcv:NVDA:1d` for the swing timeframe.
 */
function cacheKey(symbol: string, timeframe: Timeframe): string {
  const { interval } = WEB_CONFIG.provider.lookback[timeframe];
  return `ohlcv:${symbol}:${interval}`;
}

/**
 * In-memory cache for local/personal use (zero env vars required).
 *
 * Note: entries are NEVER evicted — `get()` returns the entry regardless of
 * age, and `set()` ignores the ttlSeconds argument. Freshness (fresh vs stale)
 * is decided entirely by `getBarsWithFreshness()` against the logical TTL.
 * Unbounded growth is acceptable for a personal-use process; the keyspace is
 * tiny (symbols × 3 intervals).
 */
export class MemoryBarCache implements BarCache {
  private readonly store = new Map<string, { value: CachedBars; storedAt: number }>();

  async get(symbol: string, timeframe: Timeframe): Promise<CachedBars | null> {
    const entry = this.store.get(cacheKey(symbol, timeframe));
    return entry ? entry.value : null;
  }

  // ttlSeconds (4th arg of BarCache.set) intentionally omitted: never evicts.
  async set(symbol: string, timeframe: Timeframe, value: CachedBars): Promise<void> {
    this.store.set(cacheKey(symbol, timeframe), { value, storedAt: Date.now() });
  }
}

/**
 * Upstash Redis cache (REST client — Edge-compatible). Values are stored as
 * JSON strings. The physical Redis TTL is PHYSICAL_TTL_FACTOR × the logical
 * ttlSeconds so stale data remains available for provider-down fallback.
 */
export class UpstashBarCache implements BarCache {
  private readonly redis: Redis;

  constructor(redis?: Redis) {
    this.redis = redis ?? Redis.fromEnv();
  }

  async get(symbol: string, timeframe: Timeframe): Promise<CachedBars | null> {
    const raw = await this.redis.get<CachedBars | string>(cacheKey(symbol, timeframe));
    if (raw === null || raw === undefined) return null;
    // The Upstash client auto-deserializes JSON; tolerate both shapes.
    return typeof raw === 'string' ? (JSON.parse(raw) as CachedBars) : raw;
  }

  async set(
    symbol: string,
    timeframe: Timeframe,
    value: CachedBars,
    ttlSeconds: number,
  ): Promise<void> {
    await this.redis.set(cacheKey(symbol, timeframe), JSON.stringify(value), {
      ex: ttlSeconds * PHYSICAL_TTL_FACTOR,
    });
  }
}

/** Upstash when both env vars are configured, in-memory otherwise (zero-env fallback). */
export function createBarCache(): BarCache {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return new UpstashBarCache();
  }
  return new MemoryBarCache();
}

/** Fetch from the provider and write through to the cache. */
async function fetchAndStore(
  provider: MarketDataProvider,
  cache: BarCache,
  symbol: string,
  timeframe: Timeframe,
  now: () => number,
): Promise<CachedBars> {
  const bars = await provider.getBars(symbol, timeframe);
  const value: CachedBars = { bars, fetchedAt: new Date(now()).toISOString() };
  // A cache write failure must not fail the analysis — swallow and let the
  // next request retry the write.
  await cache
    .set(symbol, timeframe, value, WEB_CONFIG.cache.ttlSeconds[timeframe])
    .catch(() => undefined);
  return value;
}

/**
 * Stale-while-revalidate per design §2.1:
 *
 * 1. Cached and age ≤ TTL → serve it, `stale: false`. No provider call.
 * 2. Cached but expired → serve it IMMEDIATELY with `stale: true` and kick off
 *    a fire-and-forget background refresh (errors swallowed). This is also the
 *    provider-down-with-stale-cache path: the user gets data plus the
 *    "data as of {timestamp}" warning instead of a failure.
 *    Edge-runtime caveat: on Cloudflare the background refresh may be cut
 *    short when the response completes; if so, the next request simply serves
 *    stale again and retries — correctness is unaffected.
 * 3. No cache → await the provider. Success → cache + `stale: false`.
 *    ProviderError propagates to the route (UNKNOWN_SYMBOL → 404,
 *    UNAVAILABLE → 503).
 *
 * `opts.now` is injectable for deterministic tests.
 */
export async function getBarsWithFreshness(
  provider: MarketDataProvider,
  cache: BarCache,
  symbol: string,
  timeframe: Timeframe,
  opts?: { now?: () => number },
): Promise<BarsWithFreshness> {
  const now = opts?.now ?? Date.now;
  const ttlSeconds = WEB_CONFIG.cache.ttlSeconds[timeframe];

  const cached = await cache.get(symbol, timeframe);
  if (cached) {
    const ageSeconds = (now() - Date.parse(cached.fetchedAt)) / MS_PER_SECOND;
    if (ageSeconds <= ttlSeconds) {
      return { ...cached, stale: false };
    }
    // Expired: serve stale now, refresh in the background (fire-and-forget).
    void fetchAndStore(provider, cache, symbol, timeframe, now).catch(() => undefined);
    return { ...cached, stale: true };
  }

  // Cold: nothing to fall back on — ProviderError intentionally propagates.
  const value = await fetchAndStore(provider, cache, symbol, timeframe, now);
  return { ...value, stale: false };
}
