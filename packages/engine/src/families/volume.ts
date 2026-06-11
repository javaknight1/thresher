/**
 * Volume family — "is anyone behind this move?"
 *
 * Spec: design doc §4.1 (Volume table) · methodology I.7 (OBV) / I.8 (RelVol).
 *
 * Two components:
 *   1. OBV 20-bar delta cross-referenced against the 20-bar price delta —
 *      confirmation (±obvConfirm) or divergence (±obvDiverge).
 *   2. Relative volume — elevated tape (> elevatedMin) votes ±relVolVote in the
 *      direction of the 20-bar price change; thin tape (< thinMax) casts no vote
 *      but raises the `thin` flag (−5 confidence downstream, methodology II.4).
 *      Both thresholds are strict inequalities; in between, no vote.
 *
 * All point values and thresholds arrive via `cfg.families.volume` — no
 * constants here. Every component emits a Detail reason string.
 */
import type { Detail, IndicatorSnapshot } from '../types';
import type { EngineConfig } from '../config';
import { clampScore } from '../util';

export function scoreVolume(
  snap: IndicatorSnapshot,
  cfg: EngineConfig,
): { score: number; details: Detail[]; thin: boolean } {
  const v = cfg.families.volume;
  const details: Detail[] = [];
  let sum = 0;
  let thin = false;

  // 1. OBV vs price (methodology I.7): confirmation beats divergence.
  if (snap.obvDelta > 0 && snap.priceDelta > 0) {
    sum += v.obvConfirm;
    details.push({ ok: 1, text: 'OBV rising with price — accumulation' });
  } else if (snap.obvDelta < 0 && snap.priceDelta < 0) {
    sum -= v.obvConfirm;
    details.push({ ok: -1, text: 'OBV falling with price — distribution' });
  } else if (snap.obvDelta > 0) {
    sum += v.obvDiverge;
    details.push({ ok: 0, text: 'OBV diverging bullishly from price' });
  } else {
    sum -= v.obvDiverge;
    details.push({ ok: 0, text: 'OBV diverging bearishly from price' });
  }

  // 2. Relative volume (methodology I.8). Elevated participation votes in the
  // direction of the 20-bar price change (flat price defaults bullish: || 1).
  if (snap.relVol > v.elevatedMin) {
    const sign: 1 | -1 = Math.sign(snap.priceDelta || 1) < 0 ? -1 : 1;
    sum += v.relVolVote * sign;
    // Percent above the 20-bar norm, e.g. relVol 1.6 → "60%".
    const pctAbove = (snap.relVol * 100 - 100).toFixed(0);
    details.push({
      ok: sign,
      text: `Volume ${pctAbove}% above average — conviction behind the move`,
    });
  } else if (snap.relVol < v.thinMax) {
    thin = true;
    details.push({ ok: 0, text: 'Volume running thin vs. 20-bar average' });
  } else {
    details.push({ ok: 0, text: 'Volume in line with average' });
  }

  return { score: clampScore(sum), details, thin };
}
