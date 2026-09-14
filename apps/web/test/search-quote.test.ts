import { describe, it, expect } from 'vitest';
import { MockProvider } from '../lib/providers/mock';

describe('MockProvider.search (autocomplete)', () => {
  const p = new MockProvider();

  it('matches a company name substring → ticker (e.g. "nvid" → NVDA)', async () => {
    const results = await p.search('nvid');
    expect(results.map((r) => r.symbol)).toContain('NVDA');
    const nvda = results.find((r) => r.symbol === 'NVDA');
    expect(nvda?.name).toBe('NVIDIA Corporation');
  });

  it('matches a ticker prefix', async () => {
    const results = await p.search('AAP');
    expect(results.map((r) => r.symbol)).toContain('AAPL');
  });

  it('returns [] for an empty query and caps results', async () => {
    expect(await p.search('')).toEqual([]);
    const many = await p.search('a'); // broad match
    expect(many.length).toBeLessThanOrEqual(8);
  });
});

describe('MockProvider.getQuotes (batch snapshot)', () => {
  const p = new MockProvider();

  it('returns a price + day change + name per symbol, deterministically', async () => {
    const quotes = await p.getQuotes(['NVDA', 'AAPL']);
    expect(quotes.map((q) => q.symbol)).toEqual(['NVDA', 'AAPL']);
    for (const q of quotes) {
      expect(q.price).toBeGreaterThan(0);
      expect(q.changePct).toBeGreaterThanOrEqual(-8);
      expect(q.changePct).toBeLessThanOrEqual(8);
      expect(q.name).toBeTruthy();
    }
    // deterministic
    expect(await p.getQuotes(['NVDA'])).toEqual([quotes[0]]);
  });

  it('omits unknown symbols rather than throwing', async () => {
    const quotes = await p.getQuotes(['MOCKUNKNOWN', 'NVDA']);
    expect(quotes.map((q) => q.symbol)).toEqual(['NVDA']);
  });
});
