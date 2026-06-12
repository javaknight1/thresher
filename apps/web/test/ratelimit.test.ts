import { describe, expect, it } from 'vitest';
import { WEB_CONFIG } from '../lib/config';
import { MemoryRateLimiter } from '../lib/ratelimit';

const HOUR_MS = 3_600_000;
const T0 = Date.parse('2026-06-10T15:00:00.000Z');

function makeClock(start = T0) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe('MemoryRateLimiter', () => {
  it('allows up to the anonymous limit with decreasing remaining', async () => {
    const clock = makeClock();
    const limiter = new MemoryRateLimiter(clock.now);
    const limit = WEB_CONFIG.rateLimit.anonPerHour;

    for (let i = 1; i <= limit; i++) {
      const result = await limiter.check('ip-1', false);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(limit - i);
    }
  });

  it('blocks at limit+1 with the correct resetAt', async () => {
    const clock = makeClock();
    const limiter = new MemoryRateLimiter(clock.now);
    const limit = WEB_CONFIG.rateLimit.anonPerHour;

    for (let i = 0; i < limit; i++) {
      await limiter.check('ip-1', false);
    }
    const blocked = await limiter.check('ip-1', false);

    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.resetAt).toBe(new Date(T0 + HOUR_MS).toISOString());
  });

  it('resets the window after an hour', async () => {
    const clock = makeClock();
    const limiter = new MemoryRateLimiter(clock.now);
    const limit = WEB_CONFIG.rateLimit.anonPerHour;

    for (let i = 0; i < limit; i++) {
      await limiter.check('ip-1', false);
    }
    expect((await limiter.check('ip-1', false)).allowed).toBe(false);

    clock.advance(HOUR_MS);
    const afterReset = await limiter.check('ip-1', false);

    expect(afterReset.allowed).toBe(true);
    expect(afterReset.remaining).toBe(limit - 1);
    // New window anchored at the new clock time.
    expect(afterReset.resetAt).toBe(new Date(T0 + 2 * HOUR_MS).toISOString());
  });

  it('gives authed identities the higher limit', async () => {
    const clock = makeClock();
    const limiter = new MemoryRateLimiter(clock.now);
    const authedLimit = WEB_CONFIG.rateLimit.authedPerHour;
    expect(authedLimit).toBeGreaterThan(WEB_CONFIG.rateLimit.anonPerHour);

    for (let i = 1; i <= authedLimit; i++) {
      const result = await limiter.check('user-1', true);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(authedLimit - i);
    }
    expect((await limiter.check('user-1', true)).allowed).toBe(false);
  });

  it('tracks identities and tiers independently', async () => {
    const clock = makeClock();
    const limiter = new MemoryRateLimiter(clock.now);
    const limit = WEB_CONFIG.rateLimit.anonPerHour;

    for (let i = 0; i < limit; i++) {
      await limiter.check('ip-1', false);
    }
    expect((await limiter.check('ip-1', false)).allowed).toBe(false);
    // Different identity unaffected.
    expect((await limiter.check('ip-2', false)).allowed).toBe(true);
    // Same identity on the authed tier has its own budget.
    expect((await limiter.check('ip-1', true)).allowed).toBe(true);
  });
});
