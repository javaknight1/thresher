/**
 * Refusal gates G1–G5 (methodology II.7, design §5.5).
 *
 * Evaluated strictly in order; the response names the FIRST failure and its
 * reason string, and later gates are not evaluated. Refusals are first-class
 * results, never errors (CLAUDE.md hard rule 4). All thresholds come from
 * `cfg` — zero magic numbers here.
 */
import type { Direction, GateResult, Refusal, Timeframe } from './types';
import type { EngineConfig } from './config';

export interface GateInput {
  composite: number;
  direction: Direction;
  confidence: number;
  /** reward:risk of the candidate plan; null when no plan exists */
  rr: number | null;
  timeframe: Timeframe;
  /** trading days until the next earnings report; null/undefined = unknown */
  tradingDaysToEarnings?: number | null;
}

export interface GatesOutcome {
  gates: GateResult[];
  refusal: Refusal | null;
}

/** Sign-aware fixed-decimal formatting, e.g. "+0.745" / "-0.130". */
function signed(x: number, digits: number): string {
  return `${x >= 0 ? '+' : ''}${x.toFixed(digits)}`;
}

/**
 * Run all five refusal gates in order, stopping at the first failure.
 * `gates` contains one GateResult per gate actually evaluated; `refusal`
 * carries the failing gate and its reason string (or null if all pass).
 */
export function evaluateGates(input: GateInput, cfg: EngineConfig): GatesOutcome {
  const { composite, direction, confidence, rr, timeframe, tradingDaysToEarnings } = input;
  const { threshold } = cfg.direction;
  const { minConfidence, minRR, evMargin } = cfg.gates;

  const gates: GateResult[] = [];
  const refuse = (g: GateResult): GatesOutcome => ({
    gates,
    refusal: { gate: g.gate, reason: g.text },
  });

  // ── G1 EDGE: direction ≠ none (|S| ≥ threshold resolved upstream) ────────
  const g1: GateResult =
    direction === 'none'
      ? {
          gate: 'G1',
          pass: false,
          text: `no edge — signal families net out near zero (|composite| ${Math.abs(
            composite,
          ).toFixed(3)} < ${threshold})`,
        }
      : {
          gate: 'G1',
          pass: true,
          text: `edge: composite ${signed(composite, 3)} ${
            direction === 'long' ? `≥ +${threshold}` : `≤ -${threshold}`
          } → ${direction.toUpperCase()}`,
        };
  gates.push(g1);
  if (!g1.pass) return refuse(g1);

  // ── G2 CONVICTION: confidence ≥ floor ─────────────────────────────────────
  const g2: GateResult =
    confidence >= minConfidence
      ? { gate: 'G2', pass: true, text: `conviction: confidence ${confidence} ≥ ${minConfidence}` }
      : {
          gate: 'G2',
          pass: false,
          text: `conviction floor — confidence ${confidence} < ${minConfidence}`,
        };
  gates.push(g2);
  if (!g2.pass) return refuse(g2);

  // ── G3 STRUCTURE: RR ≥ floor ──────────────────────────────────────────────
  // rr can only be null when no plan exists, which cannot happen once G1
  // passed (direction ≠ none) — handled defensively as a failure, not a throw.
  const g3: GateResult =
    rr === null
      ? { gate: 'G3', pass: false, text: 'no plan available' }
      : rr >= minRR
        ? { gate: 'G3', pass: true, text: `structure: ${rr.toFixed(2)}:1 ≥ ${minRR}:1` }
        : {
            gate: 'G3',
            pass: false,
            text: `structure only offers ${rr.toFixed(2)}:1 — below the ${minRR}:1 floor`,
          };
  gates.push(g3);
  if (!g3.pass || rr === null) return refuse(g3);

  // ── G4 EXPECTED VALUE: p×RR − (1−p) ≥ margin, p = C/100 (methodology II.7) ─
  const p = confidence / 100;
  const ev = p * rr - (1 - p);
  let g4: GateResult;
  if (ev >= evMargin) {
    g4 = {
      gate: 'G4',
      pass: true,
      text: `expected value: ${p.toFixed(2)}×${rr.toFixed(2)} − ${(1 - p).toFixed(2)} = ${signed(
        ev,
        2,
      )}R ≥ +${evMargin}R`,
    };
  } else {
    // RR_min(C) = (margin + (1 − p)) / p — the doc's rearranged G4 formula.
    const rrMin = (evMargin + 1 - p) / p;
    g4 = {
      gate: 'G4',
      pass: false,
      text: `expected value ${signed(ev, 2)}R below the +${evMargin}R margin — confidence ${confidence} needs ≥ ${rrMin.toFixed(2)}:1`,
    };
  }
  gates.push(g4);
  if (!g4.pass) return refuse(g4);

  // ── G5 EVENT: earnings veto window per timeframe (design §2.2, §5.5) ──────
  const window = cfg.earningsVetoTradingDays[timeframe];
  const days = tradingDaysToEarnings;
  let g5: GateResult;
  if (window === null) {
    // Flag-only timeframe: earnings ahead are surfaced, never vetoed.
    g5 = {
      gate: 'G5',
      pass: true,
      text:
        typeof days === 'number' && days >= 0
          ? `earnings flagged, not vetoed (${timeframe} timeframe)`
          : `no earnings veto (${timeframe} timeframe)`,
    };
  } else if (days === null || days === undefined) {
    g5 = { gate: 'G5', pass: true, text: 'earnings date unknown — no veto' };
  } else if (days >= 0 && days <= window) {
    g5 = {
      gate: 'G5',
      pass: false,
      text: `earnings in ${days} trading days — inside the ${window}-day veto window`,
    };
  } else {
    g5 = { gate: 'G5', pass: true, text: `no earnings inside the ${window}-day veto window` };
  }
  gates.push(g5);
  if (!g5.pass) return refuse(g5);

  return { gates, refusal: null };
}
