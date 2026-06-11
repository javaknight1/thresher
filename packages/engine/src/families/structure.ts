/**
 * Structure family — does the map of levels leave room?
 * Spec: docs/THRESHER-DESIGN.md §4.1 (Structure table),
 * docs/THRESHER-METHODOLOGY.md I.9 (%B extremes) and I.10 (pivot S/R).
 *
 * Three components: room asymmetry vs the nearest pivot levels (±0.40),
 * price vs the 20-bar mean (±0.20), and Bollinger %B extremes (±0.20 —
 * extremes only; mid-band casts no vote because the price-vs-mean component
 * covers the middle ground, methodology I.9). Clamped to [−1, +1].
 */
import type { Detail, IndicatorSnapshot } from '../types';
import type { EngineConfig } from '../config';
import { clampScore, fmtPrice } from '../util';

export function scoreStructure(
  snap: IndicatorSnapshot,
  cfg: EngineConfig,
): { score: number; details: Detail[] } {
  const { room: roomPts, vsMean, percentBExtreme, roomRatio, pbHigh, pbLow } =
    cfg.families.structure;
  const details: Detail[] = [];
  let raw = 0;

  // Component 1: room asymmetry (methodology I.10 — room-asymmetry vote).
  const room = snap.resistance.price - snap.close;
  const cushion = snap.close - snap.support.price;
  if (room > roomRatio * cushion) {
    raw += roomPts;
    details.push({
      ok: 1,
      text: `${fmtPrice(room)} of room to resistance vs ${fmtPrice(cushion)} above support`,
    });
  } else if (cushion > roomRatio * room) {
    raw -= roomPts;
    details.push({
      ok: -1,
      text: `Resistance ${fmtPrice(room)} away is closer than support — limited upside room`,
    });
  } else {
    details.push({ ok: 0, text: 'Roughly equidistant between support and resistance' });
  }

  // Component 2: price vs the 20-bar mean.
  if (snap.close > snap.sma20) {
    raw += vsMean;
    details.push({ ok: 1, text: 'Trading above the 20-bar mean' });
  } else {
    raw -= vsMean;
    details.push({ ok: -1, text: 'Trading below the 20-bar mean' });
  }

  // Component 3: %B extremes only (methodology I.9). Strict inequalities; the
  // mid-band casts no vote and emits no detail — component 2 covers it.
  if (snap.percentB > pbHigh) {
    raw -= percentBExtreme;
    details.push({ ok: -1, text: 'Pressing the upper Bollinger band — stretched' });
  } else if (snap.percentB < pbLow) {
    raw += percentBExtreme;
    details.push({ ok: 0, text: 'Pinned to the lower Bollinger band — washed out' });
  }

  return { score: clampScore(raw), details };
}
