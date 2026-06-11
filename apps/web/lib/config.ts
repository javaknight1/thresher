/**
 * Web-layer constants (data plumbing + product policy). Engine math constants
 * live in packages/engine/src/config.ts — never here.
 */
import type { Timeframe } from '@thresher/engine';

export const WEB_CONFIG = {
  cache: {
    /** design §2.1: intraday 15 min · daily 6 h · weekly 24 h */
    ttlSeconds: { intraday: 900, swing: 21_600, position: 86_400 } as Record<Timeframe, number>,
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
  samples: ['NVDA', 'AAPL', 'TSLA', 'XOM', 'JPM', 'COIN'],
} as const;
