import { describe, it, expect } from 'vitest';
import { MemoryFollowStore } from '../lib/follow-store';
import { normalizeSymbol } from '../lib/symbols';

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
