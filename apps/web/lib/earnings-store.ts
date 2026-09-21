/**
 * Point-in-time earnings store — an APPEND-ONLY log of observed next-earnings
 * dates, captured on every live analysis (on-demand + the scan cron). Unlike the
 * bar cache (which overwrites), this accumulates: over weeks it becomes a real
 * point-in-time earnings calendar, so a historical replay / backtest inside the
 * captured window can apply gate G5 faithfully instead of "earnings unknown".
 *
 * It is forward-only by design — we can only record what we observe from now on;
 * the free feed has no clean historical announcement calendar to backfill.
 *
 * Upstash (durable, shared across Cloudflare isolates) when configured, else an
 * in-memory Map (local/CI). Keys:
 *   thresher:earnings:{symbol}  — set of observed next-earnings dates (ISO)
 *   thresher:earnings:symbols   — the index of symbols with observations
 */
import { Redis } from '@upstash/redis';
import { normalizeSymbol } from './symbols';
import { upstashConfigured } from './upstash';
import { globalSingleton } from './global-singleton';

export interface EarningsStore {
  /** Record that, as observed now, `symbol`'s next earnings is on `dateIso`. Idempotent. */
  record(symbol: string, dateIso: string): Promise<void>;
  /** Distinct observed next-earnings dates for a symbol (ISO, ascending). */
  dates(symbol: string): Promise<string[]>;
  /** The earliest observed earnings date strictly after `afterIso`, or null. */
  nextAfter(symbol: string, afterIso: string): Promise<string | null>;
  /** Symbols with any recorded observations. */
  symbols(): Promise<string[]>;
}

/** Ascending, and strictly after `afterIso`. Shared by both impls. */
function firstAfter(dates: string[], afterIso: string): string | null {
  const cutoff = Date.parse(afterIso);
  const future = dates
    .filter((d) => Date.parse(d) > cutoff)
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  return future[0] ?? null;
}

/** In-memory store — per isolate; fine for local/personal use and tests. */
export class MemoryEarningsStore implements EarningsStore {
  private readonly bySymbol = new Map<string, Set<string>>();

  async record(symbol: string, dateIso: string): Promise<void> {
    const sym = normalizeSymbol(symbol);
    const set = this.bySymbol.get(sym) ?? new Set<string>();
    set.add(dateIso);
    this.bySymbol.set(sym, set);
  }

  async dates(symbol: string): Promise<string[]> {
    const set = this.bySymbol.get(normalizeSymbol(symbol));
    return set ? [...set].sort((a, b) => Date.parse(a) - Date.parse(b)) : [];
  }

  async nextAfter(symbol: string, afterIso: string): Promise<string | null> {
    return firstAfter(await this.dates(symbol), afterIso);
  }

  async symbols(): Promise<string[]> {
    return [...this.bySymbol.keys()].sort();
  }
}

/** Upstash (Redis) store — durable and shared across Cloudflare isolates. */
export class UpstashEarningsStore implements EarningsStore {
  private readonly redis: Redis;

  constructor(redis?: Redis) {
    this.redis = redis ?? Redis.fromEnv();
  }

  private symbolKey(symbol: string): string {
    return `thresher:earnings:${symbol}`;
  }
  private readonly indexKey = 'thresher:earnings:symbols';

  async record(symbol: string, dateIso: string): Promise<void> {
    const sym = normalizeSymbol(symbol);
    await this.redis.sadd(this.symbolKey(sym), dateIso);
    await this.redis.sadd(this.indexKey, sym);
  }

  async dates(symbol: string): Promise<string[]> {
    const members = (await this.redis.smembers(this.symbolKey(normalizeSymbol(symbol)))) as string[];
    return members.sort((a, b) => Date.parse(a) - Date.parse(b));
  }

  async nextAfter(symbol: string, afterIso: string): Promise<string | null> {
    return firstAfter(await this.dates(symbol), afterIso);
  }

  async symbols(): Promise<string[]> {
    return ((await this.redis.smembers(this.indexKey)) as string[]).sort();
  }
}

/** Upstash when configured, in-memory global singleton otherwise. */
export function createEarningsStore(): EarningsStore {
  if (upstashConfigured()) return new UpstashEarningsStore();
  return globalSingleton('thresher:earnings-store', () => new MemoryEarningsStore());
}
