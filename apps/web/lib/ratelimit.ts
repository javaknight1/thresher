/**
 * Rate limiting — design §2.1: 20 analyses/hr anonymous, 200/hr signed-in.
 * Limits come from WEB_CONFIG.rateLimit. Upstash sliding window when Redis is
 * configured, in-memory fixed window otherwise (zero-env fallback).
 */
import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';
import type { RateLimiter, RateLimitResult } from './contracts';
import { WEB_CONFIG } from './config';

/** Both limits in WEB_CONFIG.rateLimit are per hour (design §2.1). */
const WINDOW_MS = 3_600_000;
const WINDOW_DURATION = '1 h' as const;

function limitFor(authed: boolean): number {
  return authed ? WEB_CONFIG.rateLimit.authedPerHour : WEB_CONFIG.rateLimit.anonPerHour;
}

/**
 * Fixed-window in-memory limiter for local/personal use. Windows are keyed by
 * `{tier}:{identity}` so an identity's anonymous and authed budgets are
 * independent. Stale windows are lazily replaced on the next check; the map is
 * not otherwise evicted (fine for a personal-use process).
 *
 * The clock is injectable for deterministic tests.
 */
export class MemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, { count: number; windowStart: number }>();
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  async check(identity: string, authed: boolean): Promise<RateLimitResult> {
    const limit = limitFor(authed);
    const key = `${authed ? 'authed' : 'anon'}:${identity}`;
    const t = this.now();

    let entry = this.windows.get(key);
    if (!entry || t - entry.windowStart >= WINDOW_MS) {
      entry = { count: 0, windowStart: t };
      this.windows.set(key, entry);
    }

    const resetAt = new Date(entry.windowStart + WINDOW_MS).toISOString();
    if (entry.count >= limit) {
      return { allowed: false, remaining: 0, resetAt };
    }
    entry.count += 1;
    return { allowed: true, remaining: limit - entry.count, resetAt };
  }
}

/**
 * Upstash sliding-window limiter. Separate limiters (and key prefixes) per
 * tier, so keys are `thresher:rl:{tier}:{identity}` in Redis.
 */
export class UpstashRateLimiter implements RateLimiter {
  private readonly anon: Ratelimit;
  private readonly authed: Ratelimit;

  constructor(redis?: Redis) {
    const client = redis ?? Redis.fromEnv();
    this.anon = new Ratelimit({
      redis: client,
      limiter: Ratelimit.slidingWindow(WEB_CONFIG.rateLimit.anonPerHour, WINDOW_DURATION),
      prefix: 'thresher:rl:anon',
    });
    this.authed = new Ratelimit({
      redis: client,
      limiter: Ratelimit.slidingWindow(WEB_CONFIG.rateLimit.authedPerHour, WINDOW_DURATION),
      prefix: 'thresher:rl:authed',
    });
  }

  async check(identity: string, authed: boolean): Promise<RateLimitResult> {
    const limiter = authed ? this.authed : this.anon;
    const { success, remaining, reset } = await limiter.limit(identity);
    return {
      allowed: success,
      remaining,
      resetAt: new Date(reset).toISOString(),
    };
  }
}

/** Upstash when both env vars are configured, in-memory otherwise (zero-env fallback). */
export function createRateLimiter(): RateLimiter {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return new UpstashRateLimiter();
  }
  return new MemoryRateLimiter();
}
