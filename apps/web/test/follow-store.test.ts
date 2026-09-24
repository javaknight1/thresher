import { describe, it, expect } from 'vitest';
import type { Redis } from '@upstash/redis';
import { MemoryFollowStore, UpstashFollowStore } from '../lib/follow-store';
import { normalizeSymbol } from '../lib/symbols';

/** Minimal in-memory fake of the Upstash set commands used by the store. */
class FakeRedis {
  private sets = new Map<string, Set<string>>();
  private s(k: string): Set<string> {
    let set = this.sets.get(k);
    if (!set) this.sets.set(k, (set = new Set()));
    return set;
  }
  async sadd(k: string, ...m: string[]) {
    const set = this.s(k);
    let n = 0;
    for (const x of m) {
      if (!set.has(x)) {
        set.add(x);
        n++;
      }
    }
    return n;
  }
  async srem(k: string, ...m: string[]) {
    const set = this.s(k);
    let n = 0;
    for (const x of m) if (set.delete(x)) n++;
    return n;
  }
  async smembers(k: string) {
    return [...this.s(k)];
  }
  async scard(k: string) {
    return this.s(k).size;
  }
}

describe('normalizeSymbol', () => {
  it('uppercases and trims', () => {
    expect(normalizeSymbol('  nvda ')).toBe('NVDA');
    expect(normalizeSymbol('brk.b')).toBe('BRK.B');
  });
});

describe('MemoryFollowStore', () => {
  it('adds, lists, counts, and dedupes per user', async () => {
    const s = new MemoryFollowStore();
    expect(await s.add('u1', 'nvda')).toBe(true);
    expect(await s.add('u1', 'AAPL')).toBe(true);
    expect(await s.add('u1', 'nvda')).toBe(false); // duplicate (normalized)
    expect(await s.list('u1')).toEqual(['NVDA', 'AAPL']);
    expect(await s.count('u1')).toBe(2);
  });

  it('removes idempotently', async () => {
    const s = new MemoryFollowStore();
    await s.add('u1', 'NVDA');
    await s.remove('u1', 'nvda');
    await s.remove('u1', 'NVDA'); // no-op
    expect(await s.list('u1')).toEqual([]);
    expect(await s.count('u1')).toBe(0);
  });

  it('keeps users isolated', async () => {
    const s = new MemoryFollowStore();
    await s.add('u1', 'NVDA');
    await s.add('u2', 'TSLA');
    expect(await s.list('u1')).toEqual(['NVDA']);
    expect(await s.list('u2')).toEqual(['TSLA']);
  });

  it('allSymbols is the distinct union across users', async () => {
    const s = new MemoryFollowStore();
    await s.add('u1', 'NVDA');
    await s.add('u2', 'NVDA'); // shared → cached once
    await s.add('u2', 'TSLA');
    expect(new Set(await s.allSymbols())).toEqual(new Set(['NVDA', 'TSLA']));
  });

  it('followersOf returns every user following a symbol', async () => {
    const s = new MemoryFollowStore();
    await s.add('u1', 'NVDA');
    await s.add('u2', 'NVDA');
    await s.add('u3', 'TSLA');
    expect(new Set(await s.followersOf('nvda'))).toEqual(new Set(['u1', 'u2']));
    expect(await s.followersOf('AMD')).toEqual([]);
  });
});

describe('UpstashFollowStore', () => {
  const make = () => new UpstashFollowStore(new FakeRedis() as unknown as Redis);

  it('APPENDS on repeated adds (the multi-isolate replace bug regression)', async () => {
    const s = make();
    await s.add('u1', 'nvda');
    await s.add('u1', 'aapl'); // must NOT replace NVDA
    expect(await s.list('u1')).toEqual(['AAPL', 'NVDA']); // sorted, both present
    expect(await s.count('u1')).toBe(2);
  });

  it('removes, keeps the universe pruned, and fans out followers', async () => {
    const s = make();
    await s.add('u1', 'NVDA');
    await s.add('u2', 'NVDA');
    await s.add('u1', 'TSLA');
    expect(new Set(await s.allSymbols())).toEqual(new Set(['NVDA', 'TSLA']));
    expect(new Set(await s.followersOf('NVDA'))).toEqual(new Set(['u1', 'u2']));

    await s.remove('u1', 'NVDA'); // u2 still follows NVDA → stays in universe
    expect(new Set(await s.allSymbols())).toEqual(new Set(['NVDA', 'TSLA']));
    await s.remove('u2', 'NVDA'); // now nobody → drops from universe
    expect(new Set(await s.allSymbols())).toEqual(new Set(['TSLA']));
    expect(await s.list('u1')).toEqual(['TSLA']);
  });

  it('namespaces (follows vs cryptofollows) share Redis but isolate keys', async () => {
    const redis = new FakeRedis() as unknown as Redis;
    const equity = new UpstashFollowStore(redis, 'follows');
    const crypto = new UpstashFollowStore(redis, 'cryptofollows');
    await equity.add('u1', 'AAPL');
    await crypto.add('u1', 'BTC-USD');
    expect(await equity.list('u1')).toEqual(['AAPL']);
    expect(await crypto.list('u1')).toEqual(['BTC-USD']);
    expect(await equity.allSymbols()).toEqual(['AAPL']);
    expect(await crypto.allSymbols()).toEqual(['BTC-USD']);
  });
});
