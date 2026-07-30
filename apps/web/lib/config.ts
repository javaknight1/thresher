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
} as const;
