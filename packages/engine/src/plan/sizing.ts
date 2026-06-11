/**
 * Position sizing (advisory).
 * Spec: docs/THRESHER-METHODOLOGY.md II.8 · docs/THRESHER-DESIGN.md §5.6.
 *
 * shares = floor((accountSize × riskFraction) / risk). Size is a function of
 * stop distance, not conviction — the engine never sizes up on confidence
 * (deliberate v1 choice; fractional-Kelly is a v2+ question). Shown as worked
 * arithmetic in the UI, never stored as advice.
 */
import type { Sizing } from '../types';
import type { EngineConfig } from '../config';

export function buildSizing(risk: number, cfg: EngineConfig): Sizing {
  const { riskFraction, exampleAccount } = cfg.sizing;
  // Defensive guard: a non-positive risk would divide by zero or go negative.
  // Upstream the stop math guarantees risk > 0, but a pure function cannot
  // assume its caller — emit 0 shares rather than NaN/Infinity.
  const shares = risk > 0 ? Math.floor((exampleAccount * riskFraction) / risk) : 0;
  return { riskFraction, example: { account: exampleAccount, shares } };
}
