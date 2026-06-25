/**
 * Company-profile cache + freshness layer. Mirrors lib/cache.ts (bars) but for
 * the display-only fundamentals panel: fundamentals change slowly, so the TTL
 * is long (WEB_CONFIG.cache.profileTtlSeconds) and a stale profile is happily
 * served while a fresh one loads in the background.
 */
import { Redis } from '@upstash/redis';
import type {
  CachedProfile,
  MarketDataProvider,
  ProfileCache,
  ProfileWithFreshness,
} from './contracts';
import { PHYSICAL_TTL_FACTOR } from './cache';

const MS_PER_SECOND = 1_000;

/** Cache key for a profile: `profile:{symbol}`. */
function profileKey(symbol: string): string {
  return `profile:${symbol}`;
}

/** In-memory profile cache (zero-env personal use). Never evicts; tiny keyspace. */
export class MemoryProfileCache implements ProfileCache {
  private readonly store = new Map<string, CachedProfile>();

  async get(symbol: string): Promise<CachedProfile | null> {
    return this.store.get(profileKey(symbol)) ?? null;
  }

  // ttlSeconds intentionally unused: in-memory cache never evicts.
  async set(symbol: string, value: CachedProfile): Promise<void> {
    this.store.set(profileKey(symbol), value);
  }
}

/** Upstash Redis profile cache. Physical TTL outlives the logical one for stale fallback. */
export class UpstashProfileCache implements ProfileCache {
  private readonly redis: Redis;

  constructor(redis?: Redis) {
    this.redis = redis ?? Redis.fromEnv();
  }

  async get(symbol: string): Promise<CachedProfile | null> {
    const raw = await this.redis.get<CachedProfile | string>(profileKey(symbol));
    if (raw === null || raw === undefined) return null;
    return typeof raw === 'string' ? (JSON.parse(raw) as CachedProfile) : raw;
  }

  async set(symbol: string, value: CachedProfile, ttlSeconds: number): Promise<void> {
    await this.redis.set(profileKey(symbol), JSON.stringify(value), {
      ex: ttlSeconds * PHYSICAL_TTL_FACTOR,
    });
  }
}

/** Upstash when both env vars are configured, in-memory otherwise. */
export function createProfileCache(): ProfileCache {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return new UpstashProfileCache();
  }
  return new MemoryProfileCache();
}

async function fetchAndStore(
  provider: MarketDataProvider,
  cache: ProfileCache,
  symbol: string,
  ttlSeconds: number,
  now: () => number,
): Promise<CachedProfile> {
  const profile = await provider.getProfile(symbol);
  const value: CachedProfile = { profile, fetchedAt: new Date(now()).toISOString() };
  await cache.set(symbol, value, ttlSeconds).catch(() => undefined);
  return value;
}

/**
 * Serve-fresh / serve-stale-and-refresh / cold-fetch — same shape as
 * getBarsWithFreshness. A ProviderError on a cold fetch propagates to the route
 * (UNKNOWN_SYMBOL → 404, UNAVAILABLE → 503); with a stale entry present, the
 * provider being down just serves stale instead of failing.
 */
export async function getProfileWithFreshness(
  provider: MarketDataProvider,
  cache: ProfileCache,
  symbol: string,
  ttlSeconds: number,
  opts?: { now?: () => number },
): Promise<ProfileWithFreshness> {
  const now = opts?.now ?? Date.now;

  const cached = await cache.get(symbol);
  if (cached) {
    const ageSeconds = (now() - Date.parse(cached.fetchedAt)) / MS_PER_SECOND;
    if (ageSeconds <= ttlSeconds) {
      return { ...cached, stale: false };
    }
    void fetchAndStore(provider, cache, symbol, ttlSeconds, now).catch(() => undefined);
    return { ...cached, stale: true };
  }

  const value = await fetchAndStore(provider, cache, symbol, ttlSeconds, now);
  return { ...value, stale: false };
}
