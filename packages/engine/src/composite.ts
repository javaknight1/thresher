/**
 * Composite score and direction resolution.
 * Spec: docs/THRESHER-METHODOLOGY.md II.2–II.3 · docs/THRESHER-DESIGN.md §4.3.
 */
import type { Direction } from './types';
import type { EngineConfig } from './config';

/** S = Σ over families (weight_f × score_f), S ∈ [−1, +1] (methodology II.2). */
export function compositeScore(
  families: ReadonlyArray<{ score: number; weight: number }>,
): number {
  let s = 0;
  for (const f of families) s += f.weight * f.score;
  return s;
}

/**
 * LONG if S ≥ +threshold · SHORT if S ≤ −threshold · else NONE (methodology II.3).
 * The threshold is symmetric: the engine has no long bias.
 */
export function resolveDirection(composite: number, cfg: EngineConfig): Direction {
  const threshold = cfg.direction.threshold;
  if (composite >= threshold) return 'long';
  if (composite <= -threshold) return 'short';
  return 'none';
}
