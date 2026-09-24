/**
 * Shared store for the computed Scan board (design §6.3). Upstash Redis when
 * configured, in-memory Map otherwise (zero-env fallback). This is what makes
 * the board consistent in production: without it the board lives in one Worker
 * isolate's memory and every other isolate recomputes it. It is also the hook
 * the morning-precompute cron will write to.
 */
import { Redis } from '@upstash/redis';
import type { Timeframe } from '@thresher/engine';
import type { ScanResponse } from './api-types';
import { upstashConfigured } from './upstash';
import { globalSingleton } from './global-singleton';

/** Physical (Redis) TTL = logical TTL × this, so a stale board survives for
 *  serve-stale fallback (mirrors the bar cache). */
const PHYSICAL_TTL_FACTOR = 4;

export interface StoredBoard {
  value: ScanResponse;
  /** epoch ms when the board was computed */
  storedAt: number;
}

export interface ScanStore {
  get(timeframe: Timeframe): Promise<StoredBoard | null>;
  set(timeframe: Timeframe, value: ScanResponse, ttlSeconds: number): Promise<void>;
}

export type BoardScope = 'equity' | 'crypto';

function key(timeframe: Timeframe, scope: BoardScope): string {
  return scope === 'crypto' ? `thresher:scan:crypto:${timeframe}` : `thresher:scan:${timeframe}`;
}

/** In-memory board store — per isolate; fine for local/personal use. */
export class MemoryScanStore implements ScanStore {
  private readonly store = new Map<Timeframe, StoredBoard>();
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  async get(timeframe: Timeframe): Promise<StoredBoard | null> {
    return this.store.get(timeframe) ?? null;
  }

  // ttlSeconds (3rd interface arg) intentionally omitted — never evicts;
  // freshness is decided by the caller against storedAt (mirrors MemoryBarCache).
  async set(timeframe: Timeframe, value: ScanResponse): Promise<void> {
    this.store.set(timeframe, { value, storedAt: this.now() });
  }
}

/** Upstash Redis board store (REST client — edge/workerd-compatible). */
export class UpstashScanStore implements ScanStore {
  private readonly redis: Redis;
  private readonly scope: BoardScope;

  constructor(redis?: Redis, scope: BoardScope = 'equity') {
    this.redis = redis ?? Redis.fromEnv();
    this.scope = scope;
  }

  async get(timeframe: Timeframe): Promise<StoredBoard | null> {
    const raw = await this.redis.get<StoredBoard | string>(key(timeframe, this.scope));
    if (raw === null || raw === undefined) return null;
    return typeof raw === 'string' ? (JSON.parse(raw) as StoredBoard) : raw;
  }

  async set(timeframe: Timeframe, value: ScanResponse, ttlSeconds: number): Promise<void> {
    const payload: StoredBoard = { value, storedAt: Date.now() };
    await this.redis.set(key(timeframe, this.scope), JSON.stringify(payload), {
      ex: ttlSeconds * PHYSICAL_TTL_FACTOR,
    });
  }
}

/**
 * Upstash when configured, in-memory otherwise. `scope` keys equity vs crypto
 * boards separately (equity keys unchanged: `thresher:scan:{tf}`).
 */
export function createScanStore(scope: BoardScope = 'equity'): ScanStore {
  if (upstashConfigured()) {
    return new UpstashScanStore(undefined, scope);
  }
  return globalSingleton(`thresher:scan-store:${scope}`, () => new MemoryScanStore());
}
