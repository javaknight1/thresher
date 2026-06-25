/**
 * MockProvider — deterministic synthetic OHLCV for tests, Playwright, and
 * offline development. No network, no Date.now() in bar generation: every
 * series is a pure function of (symbol, timeframe) via a seeded mulberry32
 * PRNG and a fixed epoch start.
 *
 * Special symbols:
 *   MOCKLONG     clean rising trend — the engine emits a LONG on swing
 *   MOCKCHOP     directionless chop — the engine REFUSES on swing
 *   MOCKUNKNOWN  throws ProviderError('UNKNOWN_SYMBOL')
 *   MOCKCHEAP    trades around $1 — trips the price guardrail
 *   MOCKEARNINGS generic series; getDaysToEarnings returns 1
 *   anything else → seeded generic series (passes guardrails)
 */
import type { Bar, Timeframe } from '@thresher/engine';
import {
  ProviderError,
  type CompanyProfile,
  type EarningsQuarter,
  type MarketDataProvider,
} from '../contracts';
import { WEB_CONFIG } from '../config';

/** Engine needs ≥130 bars (minBarsFactor × MACD slow); 300 gives headroom. */
const BAR_COUNT = 300;
/** Fixed epoch so series never depend on wall-clock time. */
const EPOCH_START = Date.UTC(2024, 0, 1);
const BAR_MS: Record<Timeframe, number> = {
  intraday: 3_600_000, // 1h
  swing: 86_400_000, // 1d
  position: 604_800_000, // 1wk
};

/** Shape parameters for one synthetic series (log-price space). */
interface SeriesSpec {
  /** baseline price the series anchors to */
  base: number;
  /** multiplicative drift per bar (log return) */
  drift: number;
  /** uniform noise amplitude per bar (log return) */
  noise: number;
  /** pull strength toward the drifting baseline (keeps paths bounded) */
  meanRevert: number;
  /** optional oscillation of the baseline (chop) */
  wave?: { amp: number; periodBars: number };
  /** mean shares per bar */
  volumeBase: number;
  /** extra volume on up bars (lets OBV confirm trends) */
  upVolumeBias: number;
}

const SPECS: Record<string, SeriesSpec> = {
  // Steady drift, modest noise, volume-confirmed: trend/momentum/volume all
  // agree, RSI stays in the bullish-but-not-hot zone → gates pass, LONG.
  // Tuned against the real engine (swing): S≈+0.69, C≈87, all four families
  // agree, RSI ≈ 69 (below the hot zone) → clean emitted LONG.
  MOCKLONG: {
    base: 60,
    drift: 0.0025,
    noise: 0.01,
    meanRevert: 0.1,
    volumeBase: 2_000_000,
    upVolumeBias: 0.25,
  },
  // Flat baseline oscillating ±3% with heavy noise: ADX collapses, SMAs
  // braid, composite lands inside the neutral band → refusal.
  MOCKCHOP: {
    base: 45,
    drift: 0,
    noise: 0.012,
    meanRevert: 0.3,
    wave: { amp: 0.03, periodBars: 17 },
    volumeBase: 2_000_000,
    upVolumeBias: 0,
  },
  // ~$1 tape: trips the minPrice guardrail regardless of volume.
  MOCKCHEAP: {
    base: 1,
    drift: 0,
    noise: 0.01,
    meanRevert: 0.3,
    wave: { amp: 0.02, periodBars: 23 },
    volumeBase: 500_000,
    upVolumeBias: 0,
  },
};

/** Generic fallback: flat-ish mean-reverting tape around a hash-derived base. */
function genericSpec(seed: number): SeriesSpec {
  const GENERIC_BASE_MIN = 20;
  const GENERIC_BASE_SPAN = 180;
  return {
    base: GENERIC_BASE_MIN + (seed % GENERIC_BASE_SPAN),
    drift: 0,
    noise: 0.01,
    meanRevert: 0.2,
    wave: { amp: 0.04, periodBars: 29 },
    volumeBase: 1_500_000,
    upVolumeBias: 0.1,
  };
}

/** FNV-1a string hash → 32-bit seed. */
function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 PRNG — tiny, deterministic, good enough for synthetic tape. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateBars(symbol: string, timeframe: Timeframe): Bar[] {
  const seed = fnv1a(`${symbol}:${timeframe}`);
  const spec = SPECS[symbol] ?? genericSpec(seed);
  const rand = mulberry32(seed);
  const barMs = BAR_MS[timeframe];
  const logBase = Math.log(spec.base);

  const bars: Bar[] = [];
  let logP = logBase;
  let prevClose = spec.base;
  for (let i = 0; i < BAR_COUNT; i++) {
    const wave = spec.wave
      ? spec.wave.amp * Math.sin((2 * Math.PI * i) / spec.wave.periodBars)
      : 0;
    const baseline = logBase + spec.drift * i + wave;
    const shock = (rand() * 2 - 1) * spec.noise;
    logP += spec.drift + shock + spec.meanRevert * (baseline - logP);

    const c = Math.exp(logP);
    const o = prevClose;
    const wickUp = rand() * spec.noise;
    const wickDown = rand() * spec.noise;
    const h = Math.max(o, c) * (1 + wickUp);
    const l = Math.min(o, c) * (1 - wickDown);
    const up = c >= o;
    const v = Math.round(
      spec.volumeBase * (0.7 + 0.6 * rand()) * (up ? 1 + spec.upVolumeBias : 1),
    );

    bars.push({ t: EPOCH_START + i * barMs, o, h, l, c, v });
    prevClose = c;
  }
  return bars;
}

/** Deterministic sector/industry assignment so the mock panel looks plausible. */
const MOCK_SECTORS: ReadonlyArray<{ sector: string; industry: string }> = [
  { sector: 'Technology', industry: 'Semiconductors' },
  { sector: 'Financial Services', industry: 'Banks—Diversified' },
  { sector: 'Energy', industry: 'Oil & Gas Integrated' },
  { sector: 'Consumer Cyclical', industry: 'Auto Manufacturers' },
  { sector: 'Healthcare', industry: 'Drug Manufacturers' },
];

/** Fixed reference date for deterministic mock earnings (no Date.now). */
const MOCK_NOW = Date.UTC(2024, 5, 1);
const QUARTER_MS = 91 * 86_400_000;

/**
 * Deterministic synthetic company profile — a pure function of the symbol, so
 * the mock panel renders identically in tests and Playwright. No network, no
 * clock (the cache layer stamps fetchedAt).
 */
function generateProfile(symbol: string): CompanyProfile {
  const seed = fnv1a(`${symbol}:profile`);
  const rand = mulberry32(seed);
  const spec = SPECS[symbol] ?? genericSpec(seed);
  const { sector, industry } = MOCK_SECTORS[seed % MOCK_SECTORS.length];
  const price = spec.base;
  const eps = +(price / (12 + rand() * 25)).toFixed(2);

  const history: EarningsQuarter[] = Array.from(
    { length: WEB_CONFIG.profile.maxEarningsQuarters },
    (_, i) => {
      const estimate = +(eps * (0.85 + rand() * 0.2)).toFixed(2);
      const actual = +(estimate * (0.9 + rand() * 0.25)).toFixed(2);
      // Decimal ratio, matching Yahoo's surprisePercent unit (0.05 = +5%).
      const surprise = estimate !== 0 ? +((actual - estimate) / estimate).toFixed(4) : null;
      return {
        quarter: new Date(MOCK_NOW - (i + 1) * QUARTER_MS).toISOString(),
        epsActual: actual,
        epsEstimate: estimate,
        surprisePercent: surprise,
      };
    },
  );

  const isEarnings = symbol === 'MOCKEARNINGS';
  const peers = Array.from({ length: WEB_CONFIG.profile.maxPeers }, (_, i) => `PEER${i + 1}`);

  return {
    symbol,
    name: `${symbol} Industries, Inc.`,
    exchange: 'NasdaqGS',
    sector,
    industry,
    description: `${symbol} Industries, Inc. is a synthetic company generated for offline development and testing. It operates in the ${sector.toLowerCase()} sector (${industry}). Figures shown here are deterministic mock data, not real fundamentals.`,
    website: `https://example.com/${symbol.toLowerCase()}`,
    currency: 'USD',
    marketCap: Math.round(price * spec.volumeBase * 50),
    fundamentals: {
      trailingPE: +(12 + rand() * 25).toFixed(1),
      forwardPE: +(10 + rand() * 20).toFixed(1),
      trailingEps: eps,
      forwardEps: +(eps * (1 + rand() * 0.3)).toFixed(2),
      beta: +(0.6 + rand() * 1.4).toFixed(2),
      dividendYield: +(rand() * 0.03).toFixed(4),
      pegRatio: +(0.8 + rand() * 2).toFixed(2),
      priceToBook: +(1 + rand() * 8).toFixed(2),
      fiftyTwoWeekHigh: +(price * (1.1 + rand() * 0.4)).toFixed(2),
      fiftyTwoWeekLow: +(price * (0.5 + rand() * 0.3)).toFixed(2),
      averageVolume: Math.round(spec.volumeBase * (0.8 + rand() * 0.6)),
      sharesOutstanding: Math.round(spec.volumeBase * 50),
    },
    earnings: {
      nextDate: new Date(MOCK_NOW + (isEarnings ? 86_400_000 : QUARTER_MS)).toISOString(),
      history,
    },
    analyst: {
      targetMean: +(price * 1.15).toFixed(2),
      targetHigh: +(price * 1.4).toFixed(2),
      targetLow: +(price * 0.85).toFixed(2),
      recommendation: 'buy',
      numberOfAnalysts: 8 + (seed % 20),
    },
    peers,
  };
}

export class MockProvider implements MarketDataProvider {
  async getBars(symbol: string, timeframe: Timeframe): Promise<Bar[]> {
    const sym = symbol.toUpperCase();
    if (sym === 'MOCKUNKNOWN') {
      throw new ProviderError('UNKNOWN_SYMBOL', `unknown symbol "${symbol}"`);
    }
    return generateBars(sym, timeframe);
  }

  async getDaysToEarnings(symbol: string): Promise<number | null> {
    return symbol.toUpperCase() === 'MOCKEARNINGS' ? 1 : null;
  }

  async getProfile(symbol: string): Promise<CompanyProfile> {
    const sym = symbol.toUpperCase();
    if (sym === 'MOCKUNKNOWN') {
      throw new ProviderError('UNKNOWN_SYMBOL', `unknown symbol "${symbol}"`);
    }
    return generateProfile(sym);
  }
}
