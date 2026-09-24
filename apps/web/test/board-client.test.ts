import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScanResponse } from '../lib/api-types';
import { fetchModeBoard, scopesForMode } from '../lib/board-client';

// Minimal board with a single row (only the fields the merge reads/copies).
function board(scope: 'equity' | 'crypto', tf: string): ScanResponse {
  const isCrypto = scope === 'crypto';
  return {
    timeframe: tf,
    asOf: isCrypto ? '2026-01-02T00:00:00Z' : '2026-01-01T00:00:00Z',
    universeSize: isCrypto ? 2 : 3,
    emitted: 1,
    refused: isCrypto ? 0 : 1,
    skipped: 0,
    rows: [{ symbol: isCrypto ? 'BTC-USD' : 'AAPL', score: isCrypto ? 90 : 80 }],
  } as unknown as ScanResponse;
}

describe('scopesForMode', () => {
  it('maps a UI mode to its wire scopes', () => {
    expect(scopesForMode('all')).toEqual(['equity', 'crypto']);
    expect(scopesForMode('equity')).toEqual(['equity']);
    expect(scopesForMode('crypto')).toEqual(['crypto']);
  });
});

describe('fetchModeBoard', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const scope = url.includes('scope=crypto') ? 'crypto' : 'equity';
        return {
          ok: true,
          status: 200,
          json: async () => board(scope, 'swing'),
        } as Response;
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('a single-scope mode returns that scope board unchanged', async () => {
    const { board: b } = await fetchModeBoard('swing', false, 'crypto');
    expect(b?.rows.map((r) => r.symbol)).toEqual(['BTC-USD']);
    expect(b?.universeSize).toBe(2);
  });

  it("'all' merges both scopes' rows and sums the counts, keeping the latest asOf", async () => {
    const { board: b } = await fetchModeBoard('swing', false, 'all');
    expect(b?.rows.map((r) => r.symbol).sort()).toEqual(['AAPL', 'BTC-USD']);
    expect(b?.universeSize).toBe(5); // 3 + 2
    expect(b?.emitted).toBe(2); // 1 + 1
    expect(b?.refused).toBe(1); // 1 + 0
    expect(b?.asOf).toBe('2026-01-02T00:00:00Z'); // latest of the two
  });
});
