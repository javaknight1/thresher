/**
 * Relative volume (methodology I.8).
 *
 * RelVol = mean(V, last `shortBars`) / mean(V, last `longBars`)
 *
 * Measures current participation vs. the recent norm. The Volume family reads
 * the result against config thresholds (elevated > 1.2, thin < 0.8); this
 * function only computes the ratio.
 *
 * Window parameters arrive from config (`indicators.relVol`) — no constants here.
 */
import { mean } from '../util';

/**
 * Compute RelVol over the trailing windows of `volumes` (oldest → newest).
 *
 * Shorter-than-window input: each mean uses the available tail (i.e. all bars
 * present when fewer than the window length exist). When fewer than `shortBars`
 * volumes exist, both windows cover the same bars and the ratio is exactly 1.
 *
 * Guard: if the long-window mean is 0 (e.g. empty input or an all-zero volume
 * feed), return 1 — neutral: no vote and no `thin` flag downstream, rather than
 * NaN/Infinity propagating into the Volume family.
 */
export function relVol(volumes: readonly number[], shortBars: number, longBars: number): number {
  const shortMean = mean(volumes.slice(-shortBars));
  const longMean = mean(volumes.slice(-longBars));
  if (longMean === 0) return 1;
  return shortMean / longMean;
}
