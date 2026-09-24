/**
 * Web-layer constants (data plumbing + product policy). Engine math constants
 * live in packages/engine/src/config.ts — never here.
 */
import type { Timeframe } from '@thresher/engine';

export const WEB_CONFIG = {
  cache: {
    /** design §2.1: intraday 15 min · daily 6 h · weekly 24 h */
    ttlSeconds: { intraday: 900, swing: 21_600, position: 86_400 } as Record<Timeframe, number>,
    /** company fundamentals change ~daily — refresh every 12 h */
    profileTtlSeconds: 43_200,
  },
  rateLimit: {
    /** design §2.1: 20 analyses/hr anonymous, 200/hr signed-in (Clerk arrives M2) */
    anonPerHour: 20,
    authedPerHour: 200,
  },
  provider: {
    /** design §2.1 lookbacks: enough history for SMA200 and pivots */
    lookback: {
      intraday: { interval: '1h', days: 60 },
      swing: { interval: '1d', days: 730 },
      position: { interval: '1wk', days: 1825 },
    } as Record<Timeframe, { interval: '1h' | '1d' | '1wk'; days: number }>,
  },
  guardrails: {
    /** design §11.1, user-confirmed: keep the engine off untradeable junk */
    minPrice: 2,
    minAvgDollarVolume: 1_000_000,
    /** bars→per-day normalization: ~6.5 hourly bars per session; weekly = 1/5 */
    perDayFactor: { intraday: 6.5, swing: 1, position: 0.2 } as Record<Timeframe, number>,
    windowBars: 20,
  },
  chart: { bars: 130 },
  /** company-context panel (display-only fundamentals — never feeds the engine) */
  profile: { maxPeers: 6, maxEarningsQuarters: 4 },
  samples: ['NVDA', 'AAPL', 'TSLA', 'XOM', 'JPM', 'COIN'],
  /**
   * Scan / "top setups" (design §6.3). The engine ranks a bounded candidate
   * universe = a curated liquid base UNION today's Yahoo movers, deduped and
   * capped. MVP is on-demand + cached; `maxUniverse` is kept small to stay
   * under Cloudflare's per-invocation subrequest budget. Ranking is the doc's
   * quality rank (C/100)×RR among gate-passing setups. Bumping the universe or
   * scanning all timeframes at once is the graduation to scheduled precompute.
   */
  scan: {
    /** curated liquid base — always screened, listed first */
    curated: [
      'NVDA', 'AAPL', 'MSFT', 'AMZN', 'META', 'GOOGL',
      'TSLA', 'AMD', 'JPM', 'XOM', 'COIN', 'NFLX',
    ],
    /** Yahoo predefined screens merged in for "at this moment" relevance */
    moverScreens: ['most_actives', 'day_gainers', 'day_losers'],
    /** symbols pulled per screen before dedup/cap */
    moversPerScreen: 15,
    /** hard cap on symbols actually analyzed per scan (subrequest budget) */
    maxUniverse: 20,
    /** rows shown on the board */
    topN: 10,
    /** concurrent analyses in flight during a scan (throttle Yahoo) */
    concurrency: 5,
    /** R:R at/above which a row is flagged as an outlier to sanity-check */
    outlierRR: 6,
    /**
     * Setup Score (0–100) — the board's "how valuable is this trade" metric.
     * A relative blend of illustrative EV, signal agreement, and structure
     * (R:R), minus deductions for risk flags EV can't see. NOT a win rate or a
     * predicted return. These are versioned weights — tune deliberately.
     * (EV floor = gates.evMargin, R:R floor = gates.minRR, from the engine.)
     */
    setupScore: {
      weights: { ev: 0.45, agreement: 0.3, rr: 0.25 }, // sum to 1
      evCap: 2.5, // illustrative EV (in R) that earns full EV credit
      rrCap: 4, // R:R that earns full structure credit
      deduct: { earnings: 12, overhead: 6, outlier: 8 }, // points off for risk flags
    },
  },
  /**
   * Follows (design: demand-driven universe). Each user follows up to
   * `maxPerUser` symbols; the scan universe is the distinct union of all
   * follows (plus the curated base as a non-empty fallback), so a followed
   * stock is guaranteed to be scanned and cached. A brand-new user is seeded
   * with `defaultWatchlist` so their board isn't empty on day one.
   */
  follows: {
    maxPerUser: 5,
    defaultWatchlist: ['NVDA', 'AAPL', 'MSFT', 'TSLA', 'AMD'],
  },
  /**
   * Crypto (methodology Part IV). Spot coins in Yahoo's `BASE-USD` form. Follows
   * are UNLIMITED (no cap) and live in a separate namespace; the /crypto board
   * ranks the curated coins ∪ the user's crypto follows, capped at
   * `maxScanUniverse` per run (subrequest budget). Guardrails are 24/7-aware.
   */
  crypto: {
    /**
     * Major coins whose plain Yahoo `BASE-USD` symbol resolves (each verified to
     * return daily bars). Ordered roughly by market cap — the board scans the
     * first `maxScanUniverse`. Coins whose Yahoo symbol carries a numeric suffix
     * (ticker collisions: Uniswap=`UNI7083-USD`, PEPE=`PEPE24478-USD`,
     * SUI=`SUI20947-USD`, TAO=`TAO22974-USD`, …) are omitted: `SYMBOL_PATTERN`
     * (lib/symbols) rejects digits, so they're unsupported until that + a
     * display-name map land. Delisted/absent coins are simply skipped by the scan.
     */
    curatedCoins: [
      'BTC-USD', 'ETH-USD', 'XRP-USD', 'SOL-USD', 'DOGE-USD',
      'ADA-USD', 'TRX-USD', 'LINK-USD', 'AVAX-USD', 'XLM-USD',
      'SHIB-USD', 'DOT-USD', 'LTC-USD', 'BCH-USD', 'HBAR-USD',
      'ETC-USD', 'NEAR-USD', 'ICP-USD', 'AAVE-USD', 'ARB-USD',
      'VET-USD', 'ATOM-USD', 'RENDER-USD', 'ALGO-USD', 'FIL-USD',
      'OP-USD', 'INJ-USD', 'TIA-USD', 'SEI-USD', 'MKR-USD',
      'XTZ-USD', 'RUNE-USD', 'FLOW-USD', 'LDO-USD', 'FET-USD',
      'DYDX-USD', 'SAND-USD', 'MANA-USD', 'AXS-USD', 'CRV-USD',
      'APE-USD', 'WIF-USD', 'BONK-USD', 'JASMY-USD', 'QNT-USD',
      'CHZ-USD', 'ENS-USD', 'SNX-USD', 'JTO-USD', 'PYTH-USD',
      'SUSHI-USD', 'EGLD-USD', 'KAVA-USD', 'ROSE-USD', 'ZEC-USD',
      'DASH-USD',
    ],
    defaultWatchlist: ['BTC-USD', 'ETH-USD', 'SOL-USD'],
    samples: ['BTC-USD', 'ETH-USD', 'SOL-USD', 'XRP-USD', 'DOGE-USD'],
    /**
     * Hard cap on coins scanned per /crypto board run. Crypto makes NO earnings
     * subrequests (unlike equities), so it has headroom above the equity cap of
     * 20 while staying under the Cloudflare subrequest budget. The scheduled cron
     * warms the board off the request path (see /api/cron/scan).
     */
    maxScanUniverse: 24,
    /** universe guardrails for crypto: no price floor (sub-dollar coins are legit); 24h volume normalization */
    guardrails: {
      minPrice: 0,
      minAvgDollarVolume: 1_000_000,
      perDayFactor: { intraday: 24, swing: 1, position: 0.143 } as Record<Timeframe, number>,
    },
  },
} as const;

/**
 * User preferences (the /settings surface). DISPLAY / CONVENIENCE ONLY — prefs
 * never touch engine math (weights, thresholds, ATR multipliers, penalties);
 * those are versioned in packages/engine/src/config.ts (CLAUDE.md). Persisted in
 * Clerk `unsafeMetadata.prefs` when signed in, else localStorage (see lib/prefs).
 */
export type ThemePref = 'system' | 'light' | 'dark';
export type BoardSort = 'score' | 'quality' | 'rr' | 'confidence';
export type BoardDirection = 'all' | 'long' | 'short';
export type BoardTab = 'top' | 'following' | Timeframe;

export interface Prefs {
  /** color theme; 'system' follows prefers-color-scheme */
  theme: ThemePref;
  /** default timeframe on /analyze when the URL doesn't specify one */
  defaultTimeframe: Timeframe;
  /** position-sizer account size (raw input string; '' = unset) */
  accountSize: string;
  /** position-sizer per-trade risk % */
  riskPct: number;
  /** default Leaderboard view / filters when the URL omits them */
  boardTab: BoardTab;
  boardDirection: BoardDirection;
  boardMinRR: number;
  boardSort: BoardSort;
}

export const PREFS_STORAGE_KEY = 'thresher:prefs';

export const DEFAULT_PREFS: Prefs = {
  theme: 'system',
  defaultTimeframe: 'swing',
  accountSize: '',
  riskPct: 1,
  boardTab: 'top',
  boardDirection: 'all',
  boardMinRR: 0,
  boardSort: 'score',
};
