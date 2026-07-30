import { describe, expect, it } from 'vitest';
import type { ScanResponse } from '../lib/api-types';
import { MemoryScanStore, createScanStore } from '../lib/scan-store';

const board: ScanResponse = {
  timeframe: 'swing',
  asOf: '2024-06-01T00:00:00.000Z',
  universeSize: 5,
  emitted: 1,
  refused: 3,
  skipped: 1,
  rows: [],
};

describe('MemoryScanStore', () => {
  it('round-trips a board and stamps storedAt from the injected clock', async () => {
    const store = new MemoryScanStore(() => 1000);
    expect(await store.get('swing')).toBeNull();
    await store.set('swing', board);
    const got = await store.get('swing');
    expect(got?.value).toEqual(board);
    expect(got?.storedAt).toBe(1000);
  });

  it('is keyed per timeframe', async () => {
    const store = new MemoryScanStore();
    await store.set('swing', board);
    expect(await store.get('intraday')).toBeNull();
  });
});

describe('createScanStore', () => {
  it('falls back to the in-memory store when Upstash is not configured', () => {
    const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } = process.env;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    try {
      expect(createScanStore()).toBeInstanceOf(MemoryScanStore);
    } finally {
      if (UPSTASH_REDIS_REST_URL) process.env.UPSTASH_REDIS_REST_URL = UPSTASH_REDIS_REST_URL;
      if (UPSTASH_REDIS_REST_TOKEN) process.env.UPSTASH_REDIS_REST_TOKEN = UPSTASH_REDIS_REST_TOKEN;
    }
  });
});
