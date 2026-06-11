/**
 * Domain types for the Thresher engine.
 * Spec: docs/THRESHER-DESIGN.md §4–§5, §8 · docs/THRESHER-METHODOLOGY.md.
 */

export type Timeframe = 'intraday' | 'swing' | 'position';
export type Direction = 'long' | 'short' | 'none';
export type FamilyKey = 'trend' | 'momentum' | 'volume' | 'structure';
export type GateId = 'G1' | 'G2' | 'G3' | 'G4' | 'G5';

/** One OHLCV bar. `t` is epoch milliseconds; the engine never reads wall-clock time. */
export interface Bar {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

/**
 * One component's vote inside a family. The reason string is required at the type
 * level: no component may move a score without explaining itself (CLAUDE.md hard
 * rule 2). `ok`: 1 bullish · -1 bearish · 0 neutral/informational.
 */
export interface Detail {
  ok: 1 | 0 | -1;
  text: string;
}

/** A merged pivot zone (methodology I.10 step 2). Strength = merged touch count. */
export interface Zone {
  price: number;
  strength: number;
}

/** A resolved nearest level: a real zone, or the synthetic ±2.5×ATR fallback. */
export interface Level {
  price: number;
  strength: number;
  synthetic: boolean;
}

export interface MacdReading {
  line: number;
  signal: number;
  hist: number;
  /** histogram 3 bars ago (methodology I.3) */
  histPrev: number;
}

/** Everything the determination layer (families → gates) reads. Pure data. */
export interface IndicatorSnapshot {
  close: number;
  sma20: number;
  sma50: number;
  /** SMA50 ten bars ago (trend slope component, design §4.1) */
  sma50Prev: number;
  rsi: number;
  macd: MacdReading;
  atr: number;
  adx: number;
  /** OBV_t − OBV_(t−20) (methodology I.7) */
  obvDelta: number;
  /** C_t − C_(t−20), compared against obvDelta */
  priceDelta: number;
  /** mean(V, last 5) / mean(V, last 20) (methodology I.8) */
  relVol: number;
  percentB: number;
  /** nearest support below close×0.996, or synthetic fallback (methodology I.10) */
  support: Level;
  /** nearest resistance above close×1.004, or synthetic fallback */
  resistance: Level;
  /** all zones above the resistance buffer, nearest first (target preference, I.10) */
  zonesAbove: Zone[];
  /** all zones below the support buffer, nearest first */
  zonesBelow: Zone[];
}

export interface FamilyScore {
  score: number;
  details: Detail[];
}

export interface FamilyResult extends FamilyScore {
  key: FamilyKey;
  weight: number;
}

/** Directionless facts read by confidence penalties, gates, and the story. */
export interface EngineFlags {
  choppy: boolean;
  rsiHot: boolean;
  rsiCold: boolean;
  thin: boolean;
  /** earnings inside the timeframe's veto window (intraday/swing only) */
  earningsInWindow: boolean;
  /** position timeframe: earnings ahead — flagged, never vetoed (design §2.2) */
  earningsFlag: boolean;
}

export interface Penalty {
  reason: string;
  /** negative, e.g. -5 (design §8) */
  points: number;
}

export type ConfidenceBucket = 'high' | 'moderate' | 'low';

export interface Confidence {
  score: number;
  bucket: ConfidenceBucket;
  penalties: Penalty[];
}

export interface Sizing {
  riskFraction: number;
  example: { account: number; shares: number };
}

export interface Plan {
  entry: number;
  stop: number;
  stopBasis: string;
  target: number;
  targetBasis: string;
  risk: number;
  reward: number;
  riskPct: number;
  rewardPct: number;
  rr: number;
  overheadWarning: boolean;
  sizing: Sizing;
  ev: { value: number; calibrated: false };
}

export interface GateResult {
  gate: GateId;
  pass: boolean;
  text: string;
}

/** Refusals are first-class results, never errors (CLAUDE.md hard rule 4). */
export interface Refusal {
  gate: GateId;
  reason: string;
}

/** External facts the engine cannot derive from bars — always passed in (purity). */
export interface Context {
  symbol: string;
  timeframe: Timeframe;
  /** trading days until the next earnings report; null/undefined = unknown */
  tradingDaysToEarnings?: number | null;
}

export interface AnalysisResult {
  engineVersion: string;
  configHash: string;
  symbol: string;
  timeframe: Timeframe;
  price: number;
  direction: Direction;
  composite: number;
  confidence: Confidence;
  gates: GateResult[];
  /** non-null iff refusal is null: a trade is only emitted when all gates pass */
  plan: Plan | null;
  refusal: Refusal | null;
  families: FamilyResult[];
  levels: {
    support: number;
    resistance: number;
    synthetic: { support: boolean; resistance: boolean };
  };
  indicators: { rsi: number; adx: number; atr: number; relVol: number; percentB: number };
  flags: EngineFlags;
  story: string;
}
