/**
 * Setup Score (0–100) — the board's "how valuable is this trade" metric.
 *
 * A relative quality blend of illustrative EV, signal agreement, and structure
 * (R:R), minus deductions for risk flags the EV math can't see (earnings inside
 * the veto window, an overhead-resistance warning, an implausible/outlier R:R).
 *
 * Honesty: this is a RELATIVE ranking score, NOT a win rate or a predicted
 * return. Illustrative EV itself is uncalibrated (it uses agreement as a stand-
 * in probability), so this inherits that caveat. Weights/caps are versioned in
 * WEB_CONFIG.scan.setupScore; the EV/R:R floors come from the engine gates.
 */
import { DEFAULT_CONFIG } from '@thresher/engine';
import { WEB_CONFIG } from './config';

export interface SetupScoreInput {
  /** illustrative EV in R (plan.ev.value) */
  ev: number;
  /** signal agreement / confidence, 0–100 */
  confidence: number;
  /** reward:risk of the plan */
  rr: number;
  earningsInWindow: boolean;
  overheadWarning: boolean;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function setupScore(input: SetupScoreInput): number {
  const cfg = WEB_CONFIG.scan.setupScore;
  const evMin = DEFAULT_CONFIG.gates.evMargin; // a passing trade has EV ≥ this
  const rrMin = DEFAULT_CONFIG.gates.minRR;

  const evNorm = clamp01((input.ev - evMin) / (cfg.evCap - evMin));
  const rrNorm = clamp01((input.rr - rrMin) / (cfg.rrCap - rrMin));
  const agreeNorm = clamp01(input.confidence / 100);

  const base =
    100 *
    (cfg.weights.ev * evNorm + cfg.weights.agreement * agreeNorm + cfg.weights.rr * rrNorm);

  let deduction = 0;
  if (input.earningsInWindow) deduction += cfg.deduct.earnings;
  if (input.overheadWarning) deduction += cfg.deduct.overhead;
  if (input.rr >= WEB_CONFIG.scan.outlierRR) deduction += cfg.deduct.outlier;

  return Math.max(0, Math.min(100, Math.round(base - deduction)));
}
