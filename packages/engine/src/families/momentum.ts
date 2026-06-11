/**
 * Momentum family — is the move being pushed right now?
 * Spec: docs/THRESHER-DESIGN.md §4.1 (Momentum table),
 * docs/THRESHER-METHODOLOGY.md I.3 (MACD relationships only, never magnitudes),
 * I.4 (zone-based, trend-following RSI — extremes flag instead of reversing).
 *
 * Three component votes: MACD line vs signal, histogram vs `histCompareBars`
 * bars ago, and the RSI zone. RSI extremes (> hotMax / < coldMin) keep a small
 * same-direction vote and set `rsiHot`/`rsiCold` for the confidence penalty —
 * they never reverse the vote (methodology I.4). Clamped to [−1, +1].
 */
import type { Detail, IndicatorSnapshot } from '../types';
import type { EngineConfig } from '../config';
import { clampScore } from '../util';

export function scoreMomentum(
  snap: IndicatorSnapshot,
  cfg: EngineConfig,
): { score: number; details: Detail[]; rsiHot: boolean; rsiCold: boolean } {
  const { macdCross, histogram, rsiZone, rsiExtreme, rsi: r } = cfg.families.momentum;
  const details: Detail[] = [];
  let raw = 0;
  let rsiHot = false;
  let rsiCold = false;

  // Component 1: MACD line vs signal (relationship only — I.3).
  if (snap.macd.line > snap.macd.signal) {
    raw += macdCross;
    details.push({ ok: 1, text: 'MACD above signal line' });
  } else {
    raw -= macdCross;
    details.push({ ok: -1, text: 'MACD below signal line' });
  }

  // Component 2: histogram vs `histCompareBars` bars ago (expanding / fading).
  if (snap.macd.hist > snap.macd.histPrev) {
    raw += histogram;
    details.push({ ok: 1, text: 'MACD histogram expanding upward' });
  } else {
    raw -= histogram;
    details.push({ ok: -1, text: 'MACD histogram fading' });
  }

  // Component 3: RSI zone (I.4 table) — extremes evaluated first, strict
  // inequalities, so the zone boundaries (hotMax, coldMin) stay zone votes.
  const rsiLabel = snap.rsi.toFixed(0);
  if (snap.rsi > r.hotMax) {
    raw += rsiExtreme;
    rsiHot = true;
    details.push({ ok: 0, text: `RSI ${rsiLabel} — strong but overbought` });
  } else if (snap.rsi >= r.bullMin) {
    raw += rsiZone;
    details.push({ ok: 1, text: `RSI ${rsiLabel} — bullish momentum zone` });
  } else if (snap.rsi < r.coldMin) {
    raw -= rsiExtreme;
    rsiCold = true;
    details.push({ ok: 0, text: `RSI ${rsiLabel} — weak but oversold` });
  } else if (snap.rsi <= r.bearMax) {
    raw -= rsiZone;
    details.push({ ok: -1, text: `RSI ${rsiLabel} — bearish momentum zone` });
  } else {
    details.push({ ok: 0, text: `RSI ${rsiLabel} — neutral` });
  }

  return { score: clampScore(raw), details, rsiHot, rsiCold };
}
