/**
 * FROZEN interfaces between the data layer, cache layer, and API route.
 * Implementations: lib/providers/yahoo.ts, lib/providers/mock.ts, lib/cache.ts,
 * lib/ratelimit.ts. The route depends only on these shapes.
 */
import type { Bar, Timeframe } from '@thresher/engine';

export type ProviderErrorCode = 'UNKNOWN_SYMBOL' | 'UNAVAILABLE';

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  constructor(code: ProviderErrorCode, message: string) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
  }
}

export interface MarketDataProvider {
  /** OHLCV per the timeframe profile (WEB_CONFIG.provider.lookback). Throws ProviderError. */
  getBars(symbol: string, timeframe: Timeframe): Promise<Bar[]>;
  /**
   * Trading days (weekend-adjusted; holidays ignored — documented approximation)
   * until the next earnings report. null = unknown or none scheduled.
   */
  getDaysToEarnings(symbol: string, now?: Date): Promise<number | null>;
  /**
   * Company identity + fundamentals for the display-only context panel. This
   * data NEVER reaches the engine (the score is pure TA, methodology II.10).
   * Throws ProviderError('UNKNOWN_SYMBOL') for a symbol that does not exist;
   * individual missing fields are returned as null, never thrown.
   */
  getProfile(symbol: string): Promise<CompanyProfile>;
  /**
   * Candidate symbols for the Scan board — today's movers from the provider's
   * predefined screens (most active / gainers / losers). Best-effort: returns
   * whatever it can (possibly empty) and never throws; the scan falls back to
   * the curated universe alone. These are only CANDIDATES — every symbol still
   * goes through the full pure engine before it can appear on the board.
   */
  getMovers(): Promise<string[]>;
}

/** One past quarter's earnings: reported vs. expected (Yahoo earningsHistory). */
export interface EarningsQuarter {
  /** ISO date of the quarter end, or null when undated */
  quarter: string | null;
  epsActual: number | null;
  epsEstimate: number | null;
  /** decimal ratio (Yahoo's native unit), e.g. 0.042 = EPS beat the estimate by 4.2% */
  surprisePercent: number | null;
}

/** Sell-side analyst consensus (Yahoo financialData). null fields when uncovered. */
export interface AnalystView {
  targetMean: number | null;
  targetHigh: number | null;
  targetLow: number | null;
  /** raw recommendationKey, e.g. "buy" / "hold" / "underperform" */
  recommendation: string | null;
  numberOfAnalysts: number | null;
}

/**
 * Display-only company context. Fundamentals are external facts (price/volume
 * is the engine's only diet); this panel is deliberately separate from the
 * trade signal and carries no /methodology deep-links.
 */
export interface CompanyProfile {
  symbol: string;
  /** longName ?? shortName */
  name: string | null;
  exchange: string | null;
  sector: string | null;
  industry: string | null;
  /** one-paragraph business summary (assetProfile.longBusinessSummary) */
  description: string | null;
  website: string | null;
  currency: string | null;
  marketCap: number | null;
  fundamentals: {
    trailingPE: number | null;
    forwardPE: number | null;
    trailingEps: number | null;
    forwardEps: number | null;
    beta: number | null;
    /** decimal ratio, e.g. 0.012 = 1.2% */
    dividendYield: number | null;
    pegRatio: number | null;
    priceToBook: number | null;
    fiftyTwoWeekHigh: number | null;
    fiftyTwoWeekLow: number | null;
    averageVolume: number | null;
    sharesOutstanding: number | null;
  };
  /** next scheduled earnings date (ISO) + recent reported quarters */
  earnings: {
    nextDate: string | null;
    history: EarningsQuarter[];
  };
  /** null when the symbol has no analyst coverage */
  analyst: AnalystView | null;
  /** related/comparable tickers (Yahoo recommendationsBySymbol); may be empty */
  peers: string[];
}

/** Profile + when we fetched it (the cache layer stamps this, mirroring CachedBars). */
export interface CachedProfile {
  profile: CompanyProfile;
  /** ISO timestamp of the provider fetch */
  fetchedAt: string;
}

/** Profile cache store: Upstash Redis when configured, in-memory Map otherwise. */
export interface ProfileCache {
  get(symbol: string): Promise<CachedProfile | null>;
  set(symbol: string, value: CachedProfile, ttlSeconds: number): Promise<void>;
}

export interface ProfileWithFreshness extends CachedProfile {
  /** true when served past TTL (provider down or refresh in flight) */
  stale: boolean;
}

export interface CachedBars {
  bars: Bar[];
  /** ISO timestamp of the provider fetch */
  fetchedAt: string;
}

/** Raw cache store: Upstash Redis when configured, in-memory Map otherwise. */
export interface BarCache {
  get(symbol: string, timeframe: Timeframe): Promise<CachedBars | null>;
  set(symbol: string, timeframe: Timeframe, value: CachedBars, ttlSeconds: number): Promise<void>;
}

export interface BarsWithFreshness extends CachedBars {
  /** true when served past TTL (provider down or refresh in flight) — design §2.1 */
  stale: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** ISO timestamp when the window resets */
  resetAt: string;
}

export interface RateLimiter {
  check(identity: string, authed: boolean): Promise<RateLimitResult>;
}
