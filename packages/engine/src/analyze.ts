/**
 * The engine entry point. analyze(bars, config, context) → AnalysisResult.
 * Pure: no I/O, no clock, no environment — time and external facts (earnings)
 * arrive via parameters. This is the exact code the backtester replays.
 *
 * Pipeline (methodology overview): indicators → families → composite →
 * direction → confidence → plan → gates → story. No step reaches backward.
 */
import type {
  AnalysisResult,
  Bar,
  Context,
  EngineFlags,
  FamilyResult,
  IndicatorSnapshot,
  Plan,
} from './types';
import { ENGINE_VERSION, hashConfig, type EngineConfig } from './config';
import { buildSnapshot } from './indicators/snapshot';
import { scoreTrend } from './families/trend';
import { scoreMomentum } from './families/momentum';
import { scoreVolume } from './families/volume';
import { scoreStructure } from './families/structure';
import { compositeScore, resolveDirection } from './composite';
import { computeConfidence } from './confidence';
import { buildStop } from './plan/stop';
import { buildTarget } from './plan/target';
import { buildSizing } from './plan/sizing';
import { evaluateGates } from './gates';
import { buildStory } from './story';

export function analyze(bars: readonly Bar[], cfg: EngineConfig, ctx: Context): AnalysisResult {
  return determine(buildSnapshot(bars, cfg), cfg, ctx);
}

/**
 * Determination layer: indicator readings → trade story. Exposed separately so
 * the worked-example fixture (methodology II.9) can drive it with the doc's
 * published readings directly.
 */
export function determine(snap: IndicatorSnapshot, cfg: EngineConfig, ctx: Context): AnalysisResult {
  const weights = cfg.weights[ctx.timeframe];

  const trend = scoreTrend(snap, cfg);
  const momentum = scoreMomentum(snap, cfg);
  const volume = scoreVolume(snap, cfg);
  const structure = scoreStructure(snap, cfg);

  const families: FamilyResult[] = [
    { key: 'trend', score: trend.score, weight: weights.trend, details: trend.details },
    { key: 'momentum', score: momentum.score, weight: weights.momentum, details: momentum.details },
    { key: 'volume', score: volume.score, weight: weights.volume, details: volume.details },
    { key: 'structure', score: structure.score, weight: weights.structure, details: structure.details },
  ];

  const composite = compositeScore(families);
  const direction = resolveDirection(composite, cfg);

  const vetoWindow = cfg.earningsVetoTradingDays[ctx.timeframe];
  const daysToEarnings = ctx.tradingDaysToEarnings ?? null;
  const earningsKnown = daysToEarnings !== null && daysToEarnings >= 0;
  const flags: EngineFlags = {
    choppy: trend.choppy,
    rsiHot: momentum.rsiHot,
    rsiCold: momentum.rsiCold,
    thin: volume.thin,
    earningsInWindow: vetoWindow !== null && earningsKnown && daysToEarnings <= vetoWindow,
    earningsFlag: vetoWindow === null && earningsKnown,
  };

  const confidence = computeConfidence({ composite, direction, families, flags }, cfg);

  let planParts: { stop: ReturnType<typeof buildStop>; target: ReturnType<typeof buildTarget> } | null = null;
  if (direction !== 'none') {
    const stop = buildStop(
      { direction, entry: snap.close, atr: snap.atr, support: snap.support, resistance: snap.resistance },
      cfg,
    );
    const target = buildTarget(
      {
        direction,
        entry: snap.close,
        atr: snap.atr,
        risk: stop.risk,
        support: snap.support,
        resistance: snap.resistance,
        zonesAbove: snap.zonesAbove,
        zonesBelow: snap.zonesBelow,
      },
      cfg,
    );
    planParts = { stop, target };
  }

  const { gates, refusal } = evaluateGates(
    {
      composite,
      direction,
      confidence: confidence.score,
      rr: planParts ? planParts.target.rr : null,
      timeframe: ctx.timeframe,
      tradingDaysToEarnings: daysToEarnings,
    },
    cfg,
  );

  // A trade plan is only emitted when every gate passes (design §5.5).
  let plan: Plan | null = null;
  if (refusal === null && planParts !== null) {
    const { stop, target } = planParts;
    const entry = snap.close;
    const riskPct = (stop.risk / entry) * 100;
    const rewardPct = (target.reward / entry) * 100;
    const p = confidence.score / 100;
    plan = {
      entry,
      stop: stop.stop,
      stopBasis: stop.basis,
      target: target.target,
      targetBasis: target.basis,
      risk: stop.risk,
      reward: target.reward,
      riskPct,
      rewardPct,
      rr: target.rr,
      overheadWarning: target.overheadWarning,
      sizing: buildSizing(stop.risk, cfg),
      ev: { value: p * rewardPct - (1 - p) * riskPct, calibrated: false },
    };
  }

  const levels = {
    support: snap.support.price,
    resistance: snap.resistance.price,
    synthetic: { support: snap.support.synthetic, resistance: snap.resistance.synthetic },
  };

  const story = buildStory(
    {
      symbol: ctx.symbol,
      timeframe: ctx.timeframe,
      direction,
      families,
      confidence,
      plan,
      refusal,
      levels: { support: levels.support, resistance: levels.resistance },
      flags,
    },
    cfg,
  );

  return {
    engineVersion: ENGINE_VERSION,
    configHash: hashConfig(cfg),
    symbol: ctx.symbol,
    timeframe: ctx.timeframe,
    price: snap.close,
    direction,
    composite,
    confidence,
    gates,
    plan,
    refusal,
    families,
    levels,
    indicators: {
      rsi: snap.rsi,
      adx: snap.adx,
      atr: snap.atr,
      relVol: snap.relVol,
      percentB: snap.percentB,
    },
    flags,
    story,
  };
}
