/**
 * Integration tests for /api/v1/follows against the real handlers. Auth is off
 * in the test env (no Clerk key), so identity falls back to the request IP —
 * each test uses a distinct x-forwarded-for so the shared in-memory store keeps
 * cases isolated. Never touches Supabase or Yahoo.
 */
import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST, DELETE } from '../app/api/v1/follows/route';
import { WEB_CONFIG } from '../lib/config';

function req(method: string, ip: string, body?: unknown, scope?: 'crypto'): NextRequest {
  const url = scope ? 'http://localhost/api/v1/follows?scope=crypto' : 'http://localhost/api/v1/follows';
  return new NextRequest(url, {
    method,
    headers: { 'x-forwarded-for': ip, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('/api/v1/follows', () => {
  it('adds, lists, and removes a follow', async () => {
    const ip = '10.0.0.1';
    let res = await POST(req('POST', ip, { symbol: 'nvda' }));
    expect(res.status).toBe(201);
    expect((await res.json()).symbols).toEqual(['NVDA']); // normalized

    res = await GET(req('GET', ip));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.symbols).toEqual(['NVDA']);
    expect(body.max).toBe(WEB_CONFIG.follows.maxPerUser);

    res = await DELETE(req('DELETE', ip, { symbol: 'NVDA' }));
    expect((await res.json()).symbols).toEqual([]);
  });

  it('rejects an invalid symbol with 400', async () => {
    const res = await POST(req('POST', '10.0.0.2', { symbol: '123' }));
    expect(res.status).toBe(400);
  });

  it('is idempotent on duplicate add', async () => {
    const ip = '10.0.0.3';
    await POST(req('POST', ip, { symbol: 'AAPL' }));
    const res = await POST(req('POST', ip, { symbol: 'AAPL' }));
    expect(res.status).toBe(201);
    expect((await res.json()).symbols).toEqual(['AAPL']);
  });

  it('enforces the per-user cap with 422', async () => {
    const ip = '10.0.0.4';
    const max = WEB_CONFIG.follows.maxPerUser;
    for (let i = 0; i < max; i++) {
      const sym = `F${String.fromCharCode(65 + i)}`; // FA..(max valid letters)
      const res = await POST(req('POST', ip, { symbol: sym }));
      expect(res.status).toBe(201);
    }
    const over = await POST(req('POST', ip, { symbol: 'ZZ' }));
    expect(over.status).toBe(422);
    expect((await over.json()).error).toBe('FOLLOW_LIMIT');

    // Re-following an existing symbol at the cap still succeeds (idempotent).
    const dupe = await POST(req('POST', ip, { symbol: 'FA' }));
    expect(dupe.status).toBe(201);
  });
});

describe('/api/v1/follows?scope=crypto (unlimited)', () => {
  it('has no cap (max null) and accepts more than the equity limit', async () => {
    const ip = '10.9.0.1';
    const coins = ['BTC-USD', 'ETH-USD', 'SOL-USD', 'XRP-USD', 'DOGE-USD', 'ADA-USD', 'AVAX-USD'];
    for (const c of coins) {
      const res = await POST(req('POST', ip, { symbol: c }, 'crypto'));
      expect(res.status).toBe(201); // never 422, even past the equity cap of 5
    }
    const body = await (await GET(req('GET', ip, undefined, 'crypto'))).json();
    expect(body.max).toBeNull();
    expect(body.symbols.length).toBe(coins.length);
  });

  it('is isolated from the equity scope', async () => {
    const ip = '10.9.0.2';
    await POST(req('POST', ip, { symbol: 'AAPL' })); // equity
    await POST(req('POST', ip, { symbol: 'BTC-USD' }, 'crypto')); // crypto
    const eq = await (await GET(req('GET', ip))).json();
    const cr = await (await GET(req('GET', ip, undefined, 'crypto'))).json();
    expect(eq.symbols).toEqual(['AAPL']);
    expect(cr.symbols).toEqual(['BTC-USD']);
  });
});
