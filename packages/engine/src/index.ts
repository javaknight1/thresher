/**
 * @thresher/engine — public API.
 *
 * analyze(bars, config, context) → AnalysisResult. Pure TypeScript, zero I/O.
 * The lower-level pieces (families, composite, confidence, plan, gates) are
 * exported for tests and the backtester; the API route should only need
 * analyze + DEFAULT_CONFIG.
 */
export { analyze, determine } from './analyze';
export { buildSnapshot, minBars } from './indicators/snapshot';
export { ENGINE_VERSION, DEFAULT_CONFIG, configHash, hashConfig } from './config';
export type { EngineConfig } from './config';

export { scoreTrend } from './families/trend';
export { scoreMomentum } from './families/momentum';
export { scoreVolume } from './families/volume';
export { scoreStructure } from './families/structure';
export { compositeScore, resolveDirection } from './composite';
export { computeConfidence } from './confidence';
export { buildStop } from './plan/stop';
export { buildTarget } from './plan/target';
export { buildSizing } from './plan/sizing';
export { evaluateGates } from './gates';
export { buildStory } from './story';

export { smaSeries } from './indicators/sma';
export { emaSeries } from './indicators/ema';
export { macdSeries } from './indicators/macd';
export { rsiSeries } from './indicators/rsi';
export { atrSeries } from './indicators/atr';
export { adxSeries } from './indicators/adx';
export { obvSeries, obvDelta } from './indicators/obv';
export { relVol } from './indicators/relative-volume';
export { percentB } from './indicators/bollinger';
export { pivotLevels } from './indicators/pivots';

export type {
  AnalysisResult,
  Bar,
  Confidence,
  ConfidenceBucket,
  Context,
  Detail,
  Direction,
  EngineFlags,
  FamilyKey,
  FamilyResult,
  FamilyScore,
  GateId,
  GateResult,
  IndicatorSnapshot,
  Level,
  MacdReading,
  Penalty,
  Plan,
  Refusal,
  Sizing,
  Timeframe,
  Zone,
} from './types';
