/**
 * Redis introspection for the /internal ops console — thin helpers over the
 * Upstash client (PING / DBSIZE / SCAN / TYPE / TTL / size / DEL). Read helpers
 * degrade to empty/null when Upstash isn't configured (in-memory mode has no
 * server to introspect); the store-level views still work in both modes.
 *
 * SERVER-ONLY. Never import into a client component.
 */
import { Redis } from '@upstash/redis';
import { upstashConfigured } from '../upstash';

/** Known key prefixes, for bucketing + the integrity/orphan checks. */
export const KEY_PREFIXES: ReadonlyArray<{ prefix: string; label: string }> = [
  { prefix: 'ohlcv:', label: 'bars cache' },
  { prefix: 'thresher:follows:', label: 'follows' },
  { prefix: 'thresher:followers:', label: 'followers' },
  { prefix: 'thresher:earnings:', label: 'earnings' },
  { prefix: 'thresher:scan:', label: 'scan boards' },
  { prefix: 'thresher:ratelimit', label: 'rate limit' },
];

export function redisConfigured(): boolean {
  return upstashConfigured();
}

function client(): Redis | null {
  return upstashConfigured() ? Redis.fromEnv() : null;
}

/** PING with round-trip latency. { ok:false } when unconfigured or unreachable. */
export async function ping(): Promise<{ ok: boolean; ms: number | null }> {
  const r = client();
  if (!r) return { ok: false, ms: null };
  const start = Date.now();
  try {
    await r.ping();
    return { ok: true, ms: Date.now() - start };
  } catch {
    return { ok: false, ms: null };
  }
}

/** Total keys (DBSIZE), or null when unconfigured/unavailable. */
export async function dbsize(): Promise<number | null> {
  const r = client();
  if (!r) return null;
  try {
    return await r.dbsize();
  } catch {
    return null;
  }
}

/** SCAN every key matching `match` (bounded by `cap` — the keyspace is tiny). */
export async function scanKeys(match = '*', cap = 1000): Promise<string[]> {
  const r = client();
  if (!r) return [];
  const keys: string[] = [];
  let cursor = '0';
  try {
    do {
      const [next, batch] = (await r.scan(cursor, { match, count: 250 })) as [string, string[]];
      keys.push(...batch);
      cursor = String(next);
    } while (cursor !== '0' && keys.length < cap);
  } catch {
    /* best-effort */
  }
  return keys.slice(0, cap);
}

export interface KeyInfo {
  key: string;
  type: string | null;
  /** seconds to live: -1 = no expiry, -2 = missing, null = unknown */
  ttl: number | null;
  /** approx value size in bytes (strings), or member count (sets) */
  bytes: number | null;
  members: number | null;
}

/** TYPE + TTL + a size estimate for one key. */
export async function keyInfo(key: string): Promise<KeyInfo> {
  const r = client();
  const base: KeyInfo = { key, type: null, ttl: null, bytes: null, members: null };
  if (!r) return base;
  try {
    const type = (await r.type(key)) as string;
    const ttl = (await r.ttl(key)) as number;
    let bytes: number | null = null;
    let members: number | null = null;
    if (type === 'string') {
      const v = await r.get(key);
      bytes = v == null ? 0 : (typeof v === 'string' ? v : JSON.stringify(v)).length;
    } else if (type === 'set') {
      members = (await r.scard(key)) as number;
    }
    return { key, type, ttl, bytes, members };
  } catch {
    return base;
  }
}

/** Raw value of a string key (pretty-printed JSON when parseable), else null. */
export async function getRaw(key: string): Promise<string | null> {
  const r = client();
  if (!r) return null;
  try {
    const v = await r.get(key);
    if (v == null) return null;
    return typeof v === 'string' ? v : JSON.stringify(v, null, 2);
  } catch {
    return null;
  }
}

/** Delete keys. Returns the number removed. */
export async function del(keys: string[]): Promise<number> {
  const r = client();
  if (!r || keys.length === 0) return 0;
  try {
    return await r.del(...keys);
  } catch {
    return 0;
  }
}

/** Remove members from a set. Returns the number removed. */
export async function srem(key: string, members: string[]): Promise<number> {
  const r = client();
  if (!r || members.length === 0) return 0;
  try {
    return await r.srem(key, ...members);
  } catch {
    return 0;
  }
}

/** Bucket a key list by the known prefixes; leftovers are "orphans". */
export function bucketByPrefix(keys: string[]): {
  counts: Record<string, number>;
  orphans: string[];
} {
  const counts: Record<string, number> = {};
  for (const { prefix } of KEY_PREFIXES) counts[prefix] = 0;
  const orphans: string[] = [];
  for (const k of keys) {
    const match = KEY_PREFIXES.find((p) => k.startsWith(p.prefix));
    if (match) counts[match.prefix] += 1;
    else orphans.push(k);
  }
  return { counts, orphans };
}
