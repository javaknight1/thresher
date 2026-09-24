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
  const { riskFraction, exampleAccount, unitStep, unitLabel } = cfg.sizing;
  // Defensive guard: a non-positive risk (or step) would divide by zero or go
  // negative. Upstream the stop math guarantees risk > 0, but a pure function
  // cannot assume its caller — emit 0 units rather than NaN/Infinity.
  const raw = risk > 0 ? (exampleAccount * riskFraction) / risk : 0;
  // Quantize DOWN to the tradable step: whole shares (step 1) for equity, a small
  // fraction for crypto so a high-priced coin doesn't floor to 0 (methodology IV).
  const units = unitStep > 0 ? Math.floor(raw / unitStep) * unitStep : 0;
  return { riskFraction, unitLabel, example: { account: exampleAccount, units } };
}
