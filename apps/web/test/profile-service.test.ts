/**
 * Profile service tests — runProfile exercised directly with MockProvider +
 * MemoryProfileCache. NEVER calls Yahoo (CLAUDE.md). The mock profile is a pure
 * function of the symbol, so these pin exact deterministic output.
 */
import { describe, expect, it, vi } from 'vitest';
import { runProfile } from '../lib/profile-service';
import { MemoryProfileCache } from '../lib/profile-cache';
import { MockProvider } from '../lib/providers/mock';
import { WEB_CONFIG } from '../lib/config';

const FIXED_NOW = '2026-01-01T00:00:00.000Z';
const now = (): Date => new Date(FIXED_NOW);

function run(symbol: string, provider = new MockProvider(), cache = new MemoryProfileCache()) {
  return runProfile({ symbol, provider, cache, now });
}

describe('runProfile — company context', () => {
  it('returns a fully-populated profile for a known symbol', async () => {
    const res = await run('MOCKLONG');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const { profile, fetchedAt, stale } = res.body;

    expect(profile.symbol).toBe('MOCKLONG');
    expect(profile.name).toContain('MOCKLONG');
    expect(profile.sector).toBeTruthy();
    expect(profile.industry).toBeTruthy();
    expect(profile.description).toBeTruthy();
    expect(fetchedAt).toBe(FIXED_NOW);
    expect(stale).toBe(false);

    // Fundamentals present and finite.
    for (const v of Object.values(profile.fundamentals)) {
      expect(v === null || Number.isFinite(v)).toBe(true);
    }
    expect(profile.fundamentals.trailingPE).toBeGreaterThan(0);

    // Earnings history capped at the configured number of quarters, most recent first.
    expect(profile.earnings.history.length).toBe(WEB_CONFIG.profile.maxEarningsQuarters);
    expect(profile.earnings.nextDate).not.toBeNull();

    // Analyst + peers present.
    expect(profile.analyst?.recommendation).toBe('buy');
    expect(profile.peers.length).toBeLessThanOrEqual(WEB_CONFIG.profile.maxPeers);
    expect(profile.peers.length).toBeGreaterThan(0);
  });

  it('is deterministic — same symbol, identical profile', async () => {
    const a = await run('TESTSYM');
    const b = await run('TESTSYM');
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.body.profile).toEqual(b.body.profile);
  });

  it('MOCKEARNINGS reports a near-term next earnings date', async () => {
    const res = await run('MOCKEARNINGS');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.profile.earnings.nextDate).not.toBeNull();
  });

  it('maps an unknown symbol to UNKNOWN_SYMBOL (404 territory)', async () => {
    const res = await run('MOCKUNKNOWN');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.error).toBe('UNKNOWN_SYMBOL');
  });

  it('serves from cache on the second call (provider hit once)', async () => {
    const provider = new MockProvider();
    const spy = vi.spyOn(provider, 'getProfile');
    const cache = new MemoryProfileCache();

    await runProfile({ symbol: 'CACHEME', provider, cache, now });
    await runProfile({ symbol: 'CACHEME', provider, cache, now });

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('uppercases the symbol before lookup', async () => {
    const res = await run('mocklong');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.body.profile.symbol).toBe('MOCKLONG');
  });
});
