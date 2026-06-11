/**
 * FROZEN interfaces between the data layer, cache layer, and API route.
 * Implementations: lib/providers/yahoo.ts, lib/providers/mock.ts, lib/cache.ts,
 * lib/ratelimit.ts. The route depends only on these shapes.
 */
import type { Bar, Timeframe } from '@thresher/engine';

export type ProviderErrorCode = 'UNKNOWN_SYMBOL' | 'UNAVAILABLE';

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  constructor(code: ProviderErrorCode, message: string) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
  }
}

export interface MarketDataProvider {
  /** OHLCV per the timeframe profile (WEB_CONFIG.provider.lookback). Throws ProviderError. */
  getBars(symbol: string, timeframe: Timeframe): Promise<Bar[]>;
  /**
   * Trading days (weekend-adjusted; holidays ignored — documented approximation)
   * until the next earnings report. null = unknown or none scheduled.
   */
  getDaysToEarnings(symbol: string, now?: Date): Promise<number | null>;
}

export interface CachedBars {
  bars: Bar[];
  /** ISO timestamp of the provider fetch */
  fetchedAt: string;
}

/** Raw cache store: Upstash Redis when configured, in-memory Map otherwise. */
export interface BarCache {
  get(symbol: string, timeframe: Timeframe): Promise<CachedBars | null>;
  set(symbol: string, timeframe: Timeframe, value: CachedBars, ttlSeconds: number): Promise<void>;
}

export interface BarsWithFreshness extends CachedBars {
  /** true when served past TTL (provider down or refresh in flight) — design §2.1 */
  stale: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** ISO timestamp when the window resets */
  resetAt: string;
}

export interface RateLimiter {
  check(identity: string, authed: boolean): Promise<RateLimitResult>;
}
