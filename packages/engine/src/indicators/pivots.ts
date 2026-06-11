/**
 * Pivot support/resistance zones, fractal method (methodology I.10).
 *
 * 1. Fractal detection (window w): bar i is a pivot HIGH if H_i > H_j for ALL
 *    j in [i−w, i+w], j ≠ i (strict >; mirror with < for lows). Bars without a
 *    full window on either side can never be pivots — fresh structure is
 *    unconfirmed by design, not by accident.
 * 2. Zone merging: all pivot levels (highs and lows together) sorted ascending,
 *    then a greedy single pass — a level joins the current cluster while it is
 *    within zoneMergeAtrMult × ATR of the cluster's running volume-weighted
 *    mean. Zone price = volume-weighted mean; strength = merged touch count.
 * 3. Nearest-level selection vs last close, with a nearLevelBuffer that
 *    excludes levels price is sitting on.
 * 4. Fallback: synthetic level at close ± syntheticAtrMult × ATR when no real
 *    zone exists in range, flagged `synthetic: true` with strength 0.
 */
import type { Bar, Level, Zone } from '../types';
import type { EngineConfig } from '../config';
import { mean } from '../util';

type PivotConfig = EngineConfig['indicators']['pivots'];

/** A raw pivot touch before merging: the extreme price and that bar's volume. */
interface PivotTouch {
  price: number;
  volume: number;
}

/**
 * Step 1 — fractal detection. Only bars with `window` full neighbors on BOTH
 * sides are candidates; comparisons are strict, so any equal high/low inside
 * the window disqualifies the bar.
 */
function detectPivots(bars: readonly Bar[], window: number): PivotTouch[] {
  const touches: PivotTouch[] = [];
  for (let i = window; i < bars.length - window; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - window; j <= i + window; j++) {
      if (j === i) continue;
      if (bars[i].h <= bars[j].h) isHigh = false;
      if (bars[i].l >= bars[j].l) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) touches.push({ price: bars[i].h, volume: bars[i].v });
    if (isLow) touches.push({ price: bars[i].l, volume: bars[i].v });
  }
  return touches;
}

/**
 * Volume-weighted mean of a cluster's touches. Documented guard: if the
 * cluster's total volume is 0 (degenerate data), fall back to the arithmetic
 * mean rather than dividing by zero.
 */
function clusterMean(cluster: readonly PivotTouch[]): number {
  let volSum = 0;
  let weighted = 0;
  for (const t of cluster) {
    volSum += t.volume;
    weighted += t.price * t.volume;
  }
  if (volSum === 0) return mean(cluster.map((t) => t.price));
  return weighted / volSum;
}

/**
 * Step 2 — greedy single-pass merge over ascending levels: a level joins the
 * current cluster if it is within mergeDistance of the cluster's running
 * volume-weighted mean; otherwise the cluster closes and a new one starts.
 */
function mergeZones(touches: readonly PivotTouch[], mergeDistance: number): Zone[] {
  if (touches.length === 0) return [];
  const sorted = [...touches].sort((a, b) => a.price - b.price);

  const zones: Zone[] = [];
  let cluster: PivotTouch[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const touch = sorted[i];
    if (Math.abs(touch.price - clusterMean(cluster)) <= mergeDistance) {
      cluster.push(touch);
    } else {
      zones.push({ price: clusterMean(cluster), strength: cluster.length });
      cluster = [touch];
    }
  }
  zones.push({ price: clusterMean(cluster), strength: cluster.length });
  return zones;
}

/**
 * Pivot S/R map for the bar series (methodology I.10, all four steps).
 * `atr` sizes both the merge distance and the synthetic fallback; selection is
 * relative to the last bar's close.
 */
export function pivotLevels(
  bars: readonly Bar[],
  atr: number,
  cfg: PivotConfig,
): { support: Level; resistance: Level; zonesAbove: Zone[]; zonesBelow: Zone[] } {
  if (bars.length === 0) {
    throw new RangeError('pivotLevels: at least one bar is required (close anchor)');
  }
  if (!Number.isInteger(cfg.window) || cfg.window < 1) {
    throw new RangeError(`pivotLevels: window must be a positive integer, got ${cfg.window}`);
  }

  const close = bars[bars.length - 1].c;
  const zones = mergeZones(detectPivots(bars, cfg.window), cfg.zoneMergeAtrMult * atr);

  // Step 3 — buffer excludes levels price is sitting on. Zones arrive sorted
  // ascending from the merge pass: above keeps that order (nearest first),
  // below reverses (nearest first = highest first).
  const zonesAbove = zones.filter((z) => z.price > close * (1 + cfg.nearLevelBuffer));
  const zonesBelow = zones
    .filter((z) => z.price < close * (1 - cfg.nearLevelBuffer))
    .reverse();

  // Step 4 — real nearest zone, or the synthetic ±syntheticAtrMult×ATR fallback.
  const support: Level =
    zonesBelow.length > 0
      ? { ...zonesBelow[0], synthetic: false }
      : { price: close - cfg.syntheticAtrMult * atr, strength: 0, synthetic: true };
  const resistance: Level =
    zonesAbove.length > 0
      ? { ...zonesAbove[0], synthetic: false }
      : { price: close + cfg.syntheticAtrMult * atr, strength: 0, synthetic: true };

  return { support, resistance, zonesAbove, zonesBelow };
}
