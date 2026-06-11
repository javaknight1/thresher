/**
 * Target selection — structure first, projection second.
 * Spec: docs/THRESHER-METHODOLOGY.md II.6 (and I.10's multi-touch preference)
 * · docs/THRESHER-DESIGN.md §5.3.
 *
 * Structure target: among the zones beyond entry (already nearest-first), the
 * first zone with strength ≥ `preferredZoneStrength` is preferred (I.10:
 * "zone strength ≥ 2 preferred for targets" — a settled design decision);
 * otherwise the nearest zone; otherwise the synthetic fallback Level. If that
 * level pays at least `structureMinR`, it is the target ("structure level" —
 * a price the market has actually defended). Otherwise the engine projects
 * max(projectionR × risk, projectionAtrMult × ATR) past entry and sets
 * `overheadWarning`: the projection lies BEYOND a known level that price must
 * chew through first. Targets are rounded to cents with `round2`.
 */
import type { Level, Zone } from '../types';
import type { EngineConfig } from '../config';
import { round2 } from '../util';

export interface TargetInput {
  direction: 'long' | 'short';
  entry: number;
  atr: number;
  /** |entry − stop| from buildStop */
  risk: number;
  support: Level;
  resistance: Level;
  /** all zones above the resistance buffer, nearest first */
  zonesAbove: readonly Zone[];
  /** all zones below the support buffer, nearest first */
  zonesBelow: readonly Zone[];
}

export interface TargetResult {
  target: number;
  reward: number;
  rr: number;
  basis: string;
  overheadWarning: boolean;
}

export function buildTarget(input: TargetInput, cfg: EngineConfig): TargetResult {
  const { direction, entry, atr, risk } = input;
  const { structureMinR, projectionR, projectionAtrMult, preferredZoneStrength } = cfg.target;

  // Resolve the structure candidate: preferred multi-touch zone → nearest zone
  // → synthetic fallback Level (I.10).
  const candidates = direction === 'long' ? input.zonesAbove : input.zonesBelow;
  const fallback = direction === 'long' ? input.resistance : input.support;
  const preferred = candidates.find((z) => z.strength >= preferredZoneStrength);
  const structTarget = (preferred ?? candidates[0])?.price ?? fallback.price;

  const structR =
    direction === 'long' ? (structTarget - entry) / risk : (entry - structTarget) / risk;

  let target: number;
  let basis: string;
  let overheadWarning: boolean;

  if (structR >= structureMinR) {
    target = round2(structTarget);
    basis = 'structure level';
    overheadWarning = false;
  } else {
    const projection = Math.max(projectionR * risk, projectionAtrMult * atr);
    target = round2(direction === 'long' ? entry + projection : entry - projection);
    basis = `${projectionR}R / ${projectionAtrMult}×ATR projection`;
    overheadWarning = true;
  }

  const reward = direction === 'long' ? target - entry : entry - target;
  const rr = reward / risk;
  return { target, reward, rr, basis, overheadWarning };
}
