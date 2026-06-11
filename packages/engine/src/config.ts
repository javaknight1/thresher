/**
 * ALL engine constants live here (CLAUDE.md hard rule 3): weights, thresholds,
 * ATR multipliers, penalty points, pivot params. Zero magic numbers in logic files.
 *
 * Every value is a versioned design decision from docs/THRESHER-METHODOLOGY.md and
 * docs/THRESHER-DESIGN.md §4–§5 — never change one without an explicit doc change.
 */
import type { FamilyKey, Timeframe } from './types';

export const ENGINE_VERSION = '1.0.0';

export interface EngineConfig {
  indicators: {
    sma: { short: number; mid: number; long: number };
    /** SMA50 slope compares current value vs this many bars ago (design §4.1) */
    smaSlopeLookback: number;
    macd: { fast: number; slow: number; signal: number; histCompareBars: number };
    rsi: { period: number };
    atr: { period: number };
    adx: { period: number };
    obv: { deltaBars: number };
    relVol: { shortBars: number; longBars: number };
    bollinger: { period: number; stdevMult: number };
    pivots: {
      window: number;
      zoneMergeAtrMult: number;
      nearLevelBuffer: number;
      syntheticAtrMult: number;
    };
    /** price delta lookback compared against the OBV delta (methodology I.7) */
    priceDeltaBars: number;
    /** EMA-derived signals need ≥ this × the slow EMA period of history (methodology I.2) */
    minBarsFactor: number;
  };
  families: {
    trend: { priceVsSma50: number; smaStack: number; smaSlope: number };
    adx: {
      establishedMin: number;
      developingMin: number;
      establishedMult: number;
      developingMult: number;
      choppyMult: number;
    };
    momentum: {
      macdCross: number;
      histogram: number;
      rsiZone: number;
      rsiExtreme: number;
      rsi: { bullMin: number; hotMax: number; bearMax: number; coldMin: number };
    };
    volume: {
      obvConfirm: number;
      obvDiverge: number;
      relVolVote: number;
      elevatedMin: number;
      thinMax: number;
    };
    structure: {
      room: number;
      vsMean: number;
      percentBExtreme: number;
      roomRatio: number;
      pbHigh: number;
      pbLow: number;
    };
  };
  weights: Record<Timeframe, Record<FamilyKey, number>>;
  direction: { threshold: number };
  confidence: {
    base: number;
    slope: number;
    cap: number;
    floor: number;
    /** a family dissents when |score| exceeds this with sign opposing the trade */
    dissentThreshold: number;
    /** stored positive; emitted as negative points (methodology II.4) */
    penalties: { choppy: number; dissent: number; rsiExtreme: number; thin: number; earnings: number };
    buckets: { highMin: number; moderateMin: number };
  };
  stop: { bufferAtr: number; capAtr: number; floorAtr: number };
  target: {
    structureMinR: number;
    projectionR: number;
    projectionAtrMult: number;
    /** zones with at least this many touches are preferred targets (methodology I.10) */
    preferredZoneStrength: number;
  };
  gates: { minConfidence: number; minRR: number; evMargin: number };
  /** families with |score| at or above this are named as story drivers */
  story: { driverThreshold: number };
  /** trading-day veto windows per timeframe; null = flag only, never veto (design §2.2) */
  earningsVetoTradingDays: Record<Timeframe, number | null>;
  sizing: { riskFraction: number; exampleAccount: number };
}

export const DEFAULT_CONFIG: EngineConfig = {
  indicators: {
    sma: { short: 20, mid: 50, long: 200 },
    smaSlopeLookback: 10,
    macd: { fast: 12, slow: 26, signal: 9, histCompareBars: 3 },
    rsi: { period: 14 },
    atr: { period: 14 },
    adx: { period: 14 },
    obv: { deltaBars: 20 },
    relVol: { shortBars: 5, longBars: 20 },
    bollinger: { period: 20, stdevMult: 2 },
    pivots: {
      window: 5,
      zoneMergeAtrMult: 0.5,
      nearLevelBuffer: 0.004,
      syntheticAtrMult: 2.5,
    },
    priceDeltaBars: 20,
    minBarsFactor: 5,
  },
  families: {
    trend: { priceVsSma50: 0.4, smaStack: 0.3, smaSlope: 0.3 },
    adx: {
      establishedMin: 25,
      developingMin: 18,
      establishedMult: 1.0,
      developingMult: 0.8,
      choppyMult: 0.5,
    },
    momentum: {
      macdCross: 0.4,
      histogram: 0.2,
      rsiZone: 0.3,
      rsiExtreme: 0.1,
      rsi: { bullMin: 55, hotMax: 72, bearMax: 45, coldMin: 28 },
    },
    volume: {
      obvConfirm: 0.5,
      obvDiverge: 0.2,
      relVolVote: 0.3,
      elevatedMin: 1.2,
      thinMax: 0.8,
    },
    structure: {
      room: 0.4,
      vsMean: 0.2,
      percentBExtreme: 0.2,
      roomRatio: 1.3,
      pbHigh: 0.98,
      pbLow: 0.02,
    },
  },
  weights: {
    intraday: { trend: 0.3, momentum: 0.35, volume: 0.2, structure: 0.15 },
    swing: { trend: 0.35, momentum: 0.3, volume: 0.15, structure: 0.2 },
    position: { trend: 0.45, momentum: 0.2, volume: 0.1, structure: 0.25 },
  },
  direction: { threshold: 0.22 },
  confidence: {
    base: 35,
    slope: 75,
    cap: 95,
    floor: 5,
    dissentThreshold: 0.15,
    penalties: { choppy: 12, dissent: 8, rsiExtreme: 8, thin: 5, earnings: 10 },
    buckets: { highMin: 70, moderateMin: 45 },
  },
  stop: { bufferAtr: 0.45, capAtr: 2.2, floorAtr: 0.8 },
  target: {
    structureMinR: 1.4,
    projectionR: 2,
    projectionAtrMult: 2.5,
    preferredZoneStrength: 2,
  },
  gates: { minConfidence: 35, minRR: 1.2, evMargin: 0.25 },
  story: { driverThreshold: 0.3 },
  earningsVetoTradingDays: { intraday: 1, swing: 3, position: null },
  sizing: { riskFraction: 0.01, exampleAccount: 25000 },
};

function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic 6-hex-char hash of a config, recorded with every stored analysis. */
export function hashConfig(config: EngineConfig): string {
  return fnv1a(JSON.stringify(config)).toString(16).padStart(8, '0').slice(0, 6);
}

export const configHash = hashConfig(DEFAULT_CONFIG);
