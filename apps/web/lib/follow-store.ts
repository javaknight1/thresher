/**
 * Follow store — the source of truth for which symbols each user follows
 * (design: demand-driven universe). Supabase (Postgres) when configured, an
 * in-memory Map otherwise (zero-env / CI / e2e), mirroring lib/scan-store.
 *
 * The scan universe is the distinct union of every user's follows
 * (`allSymbols`), and notifications need the reverse lookup (`followersOf`), so
 * both are first-class store methods rather than derived client-side.
 *
 * The Supabase impl talks to PostgREST over fetch (no SDK dependency, so it
 * runs on the Cloudflare Workers runtime), authenticated with the service-role
 * key — these routes are server-only.
 */
import { Redis } from '@upstash/redis';
import { normalizeSymbol } from './symbols';
import { upstashConfigured } from './upstash';
import { globalSingleton } from './global-singleton';

export interface FollowStore {
  /** symbols this user follows (stable order: most-recently-added last) */
  list(userId: string): Promise<string[]>;
  /** add a follow (idempotent); returns true if newly added, false if it existed */
  add(userId: string, symbol: string): Promise<boolean>;
  /** remove a follow (idempotent) */
  remove(userId: string, symbol: string): Promise<void>;
  /** how many symbols this user follows (for the per-user cap) */
  count(userId: string): Promise<number>;
  /** distinct union of all follows — the scan universe */
  allSymbols(): Promise<string[]>;
  /** userIds who follow a given symbol — the notification fan-out */
  followersOf(symbol: string): Promise<string[]>;
}

/** In-memory follow store — per isolate; fine for local/personal use and tests. */
export class MemoryFollowStore implements FollowStore {
  // userId -> insertion-ordered set of symbols
  private readonly byUser = new Map<string, Set<string>>();

  async list(userId: string): Promise<string[]> {
    return [...(this.byUser.get(userId) ?? [])];
  }

  async add(userId: string, symbol: string): Promise<boolean> {
    const sym = normalizeSymbol(symbol);
    const set = this.byUser.get(userId) ?? new Set<string>();
    if (set.has(sym)) return false;
    set.add(sym);
    this.byUser.set(userId, set);
    return true;
  }

  async remove(userId: string, symbol: string): Promise<void> {
    this.byUser.get(userId)?.delete(normalizeSymbol(symbol));
  }

  async count(userId: string): Promise<number> {
    return this.byUser.get(userId)?.size ?? 0;
  }

  async allSymbols(): Promise<string[]> {
    const all = new Set<string>();
    for (const set of this.byUser.values()) for (const s of set) all.add(s);
    return [...all];
  }

  async followersOf(symbol: string): Promise<string[]> {
    const sym = normalizeSymbol(symbol);
    const users: string[] = [];
    for (const [userId, set] of this.byUser) if (set.has(sym)) users.push(userId);
    return users;
  }
}

/** Supabase (PostgREST-over-fetch) follow store. Table: `follows(user_id, symbol)`. */
export class SupabaseFollowStore implements FollowStore {
  private readonly base: string;
  private readonly key: string;

  constructor(url: string, serviceKey: string) {
    this.base = `${url.replace(/\/$/, '')}/rest/v1/follows`;
    this.key = serviceKey;
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      apikey: this.key,
      Authorization: `Bearer ${this.key}`,
      'Content-Type': 'application/json',
      ...extra,
    };
  }

  private async rows(query: string): Promise<Array<{ user_id: string; symbol: string }>> {
    const res = await fetch(`${this.base}?${query}`, { headers: this.headers() });
    if (!res.ok) throw new Error(`supabase follows read failed (${res.status})`);
    return (await res.json()) as Array<{ user_id: string; symbol: string }>;
  }

  async list(userId: string): Promise<string[]> {
    const rows = await this.rows(
      `user_id=eq.${encodeURIComponent(userId)}&select=symbol&order=created_at.asc`,
    );
    return rows.map((r) => r.symbol);
  }

  async add(userId: string, symbol: string): Promise<boolean> {
    const sym = normalizeSymbol(symbol);
    // Idempotent insert: ignore-duplicates against the (user_id, symbol) PK.
    const res = await fetch(this.base, {
      method: 'POST',
      headers: this.headers({ Prefer: 'resolution=ignore-duplicates,return=representation' }),
      body: JSON.stringify([{ user_id: userId, symbol: sym }]),
    });
    if (!res.ok) throw new Error(`supabase follows add failed (${res.status})`);
    const inserted = (await res.json()) as unknown[];
    return inserted.length > 0;
  }

  async remove(userId: string, symbol: string): Promise<void> {
    const sym = normalizeSymbol(symbol);
    const res = await fetch(
      `${this.base}?user_id=eq.${encodeURIComponent(userId)}&symbol=eq.${encodeURIComponent(sym)}`,
      { method: 'DELETE', headers: this.headers() },
    );
    if (!res.ok) throw new Error(`supabase follows remove failed (${res.status})`);
  }

  async count(userId: string): Promise<number> {
    return (await this.list(userId)).length;
  }

  async allSymbols(): Promise<string[]> {
    const rows = await this.rows(`select=symbol`);
    return [...new Set(rows.map((r) => r.symbol))];
  }

  async followersOf(symbol: string): Promise<string[]> {
    const rows = await this.rows(
      `symbol=eq.${encodeURIComponent(normalizeSymbol(symbol))}&select=user_id`,
    );
    return rows.map((r) => r.user_id);
  }
}

/**
 * Follow-store namespaces. `follows` is the equity set (capped, existing keys —
 * do NOT change them); `cryptofollows` is the isolated, uncapped crypto set.
 */
export type FollowNamespace = 'follows' | 'cryptofollows';
const NS_KEYS: Record<FollowNamespace, { user: string; followers: string; universe: string }> = {
  follows: { user: 'follows', followers: 'followers', universe: 'thresher:follows:symbols' },
  cryptofollows: {
    user: 'cryptofollows',
    followers: 'cryptofollowers',
    universe: 'thresher:cryptofollows:symbols',
  },
};

/**
 * Upstash (Redis) follow store, namespaced. For `follows` the keys are exactly
 * the historical `thresher:follows:{userId}` / `thresher:followers:{symbol}` /
 * `thresher:follows:symbols` (backward-compatible); `cryptofollows` uses a
 * parallel `thresher:cryptofollows*` keyspace. Durable + shared across isolates.
 */
export class UpstashFollowStore implements FollowStore {
  private readonly redis: Redis;
  private readonly keys: { user: string; followers: string; universe: string };

  constructor(redis?: Redis, ns: FollowNamespace = 'follows') {
    this.redis = redis ?? Redis.fromEnv();
    this.keys = NS_KEYS[ns];
  }

  private userKey(userId: string): string {
    return `thresher:${this.keys.user}:${userId}`;
  }
  private followersKey(symbol: string): string {
    return `thresher:${this.keys.followers}:${symbol}`;
  }
  private get universeKey(): string {
    return this.keys.universe;
  }

  async list(userId: string): Promise<string[]> {
    const members = (await this.redis.smembers(this.userKey(userId))) as string[];
    return members.sort(); // sets are unordered — stable alphabetical for the UI
  }

  async add(userId: string, symbol: string): Promise<boolean> {
    const sym = normalizeSymbol(symbol);
    const added = await this.redis.sadd(this.userKey(userId), sym);
    await this.redis.sadd(this.followersKey(sym), userId);
    await this.redis.sadd(this.universeKey, sym);
    return added > 0;
  }

  async remove(userId: string, symbol: string): Promise<void> {
    const sym = normalizeSymbol(symbol);
    await this.redis.srem(this.userKey(userId), sym);
    await this.redis.srem(this.followersKey(sym), userId);
    // Drop the symbol from the scan universe once nobody follows it.
    if ((await this.redis.scard(this.followersKey(sym))) === 0) {
      await this.redis.srem(this.universeKey, sym);
    }
  }

  async count(userId: string): Promise<number> {
    return this.redis.scard(this.userKey(userId));
  }

  async allSymbols(): Promise<string[]> {
    return (await this.redis.smembers(this.universeKey)) as string[];
  }

  async followersOf(symbol: string): Promise<string[]> {
    return (await this.redis.smembers(this.followersKey(normalizeSymbol(symbol)))) as string[];
  }
}

/**
 * Store selection, most-durable first:
 *   Supabase (if configured) → Upstash (if configured) → in-memory.
 * The in-memory fallback is a global singleton (survives dev HMR, shared across
 * routes) but is per-isolate in production — fine for local/CI, not for a
 * deployed multi-isolate Worker, which is why Upstash sits ahead of it.
 */
export function createFollowStore(ns: FollowNamespace = 'follows'): FollowStore {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // Supabase currently backs only the equity `follows` namespace; crypto follows
  // fall through to Upstash/memory until the Postgres schema gains an asset class.
  if (ns === 'follows' && url && serviceKey) return new SupabaseFollowStore(url, serviceKey);
  if (upstashConfigured()) return new UpstashFollowStore(undefined, ns);
  return globalSingleton(`thresher:follow-store:${ns}`, () => new MemoryFollowStore());
}
