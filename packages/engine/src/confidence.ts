/**
 * Confidence: base from |composite|, minus an itemized penalty registry.
 * Spec: docs/THRESHER-METHODOLOGY.md II.4 · docs/THRESHER-DESIGN.md §5.1.
 *
 * Penalties subtract (never multiply) so each one's cost stays legible in
 * points — that is the transparency contract. Every penalty carries its
 * human-readable reason string.
 */
import type { Confidence, ConfidenceBucket, Direction, FamilyKey, Penalty } from './types';
import type { EngineConfig } from './config';
import { clamp } from './util';

export interface ConfidenceInput {
  composite: number;
  direction: Direction;
  families: ReadonlyArray<{ key: FamilyKey; score: number }>;
  flags: {
    choppy: boolean;
    rsiHot: boolean;
    rsiCold: boolean;
    thin: boolean;
    earningsInWindow: boolean;
  };
}

function capitalize(key: FamilyKey): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/** A family dissents when |score| strictly exceeds the threshold with sign opposing the trade. */
function dissents(score: number, direction: Direction, threshold: number): boolean {
  if (Math.abs(score) <= threshold) return false;
  const opposing = direction === 'long' ? -1 : 1;
  return Math.sign(score) === opposing;
}

export function computeConfidence(input: ConfidenceInput, cfg: EngineConfig): Confidence {
  const c = cfg.confidence;
  const base = Math.min(c.cap, c.base + Math.abs(input.composite) * c.slope);

  const penalties: Penalty[] = [];
  // Penalties apply only when a direction exists (settled design decision):
  // with no trade direction, confidence is the base alone.
  if (input.direction !== 'none') {
    if (input.flags.choppy) {
      penalties.push({
        reason: `ADX below ${cfg.families.adx.developingMin} — choppy tape`,
        points: -c.penalties.choppy,
      });
    }
    for (const family of input.families) {
      if (dissents(family.score, input.direction, c.dissentThreshold)) {
        penalties.push({
          reason: `${capitalize(family.key)} family disagrees with the trade`,
          points: -c.penalties.dissent,
        });
      }
    }
    if (input.direction === 'long' && input.flags.rsiHot) {
      penalties.push({
        reason: 'RSI overbought against a fresh long',
        points: -c.penalties.rsiExtreme,
      });
    }
    if (input.direction === 'short' && input.flags.rsiCold) {
      penalties.push({
        reason: 'RSI oversold against a fresh short',
        points: -c.penalties.rsiExtreme,
      });
    }
    if (input.flags.thin) {
      penalties.push({
        reason: 'Thin volume — weak participation',
        points: -c.penalties.thin,
      });
    }
    if (input.flags.earningsInWindow) {
      penalties.push({
        reason: 'Earnings within the veto window',
        points: -c.penalties.earnings,
      });
    }
  }

  let total = 0;
  for (const p of penalties) total += p.points;
  const score = clamp(Math.round(base + total), c.floor, c.cap);

  const bucket: ConfidenceBucket =
    score >= c.buckets.highMin ? 'high' : score >= c.buckets.moderateMin ? 'moderate' : 'low';

  return { score, bucket, penalties };
}
