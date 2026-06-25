/**
 * Profile service — the testable core of GET /api/v1/profile.
 *
 * Like analyze-service, the route owns HTTP and delegates here. This wires the
 * profile cache into the provider and returns the display-only company context.
 * Tests drive it with the MockProvider; Yahoo is never exercised in tests.
 */
import type { ProfileResponse, ApiError } from './api-types';
import { ProviderError } from './contracts';
import type { MarketDataProvider, ProfileCache } from './contracts';
import { getProfileWithFreshness } from './profile-cache';
import { WEB_CONFIG } from './config';

export interface RunProfileInput {
  symbol: string;
  provider: MarketDataProvider;
  cache: ProfileCache;
  /** injectable clock for deterministic tests; defaults to wall-clock */
  now?: () => Date;
}

export type RunProfileResult =
  | { ok: true; body: ProfileResponse }
  | { ok: false; error: ApiError };

export async function runProfile(input: RunProfileInput): Promise<RunProfileResult> {
  const { provider, cache } = input;
  const symbol = input.symbol.toUpperCase();
  const now = input.now ?? (() => new Date());

  try {
    const fresh = await getProfileWithFreshness(
      provider,
      cache,
      symbol,
      WEB_CONFIG.cache.profileTtlSeconds,
      { now: () => now().getTime() },
    );
    return {
      ok: true,
      body: { profile: fresh.profile, fetchedAt: fresh.fetchedAt, stale: fresh.stale },
    };
  } catch (err) {
    if (err instanceof ProviderError && err.code === 'UNKNOWN_SYMBOL') {
      return { ok: false, error: { error: 'UNKNOWN_SYMBOL', message: err.message } };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { error: 'DATA_UNAVAILABLE', message } };
  }
}
