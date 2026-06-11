/**
 * Bollinger %B (methodology I.9).
 *
 * Mid   = SMA_n(C)
 * σ     = POPULATION stdev of the last n closes (divide by n, not n−1)
 *       = √( (1/n) Σ (C_i − Mid)² )
 * Upper = Mid + stdevMult·σ      Lower = Mid − stdevMult·σ
 * %B    = (C − Lower) / (Upper − Lower)
 *
 * %B = 1.0 at the upper band, 0.0 at the lower, 0.5 at the mean; it can exceed
 * [0, 1] when price pierces a band.
 *
 * Window parameters arrive from config (`indicators.bollinger`) — no constants here.
 */
import { mean } from '../util';

/**
 * %B of the LAST bar, computed over the trailing `period` closes
 * (oldest → newest).
 *
 * Shorter-than-period input: the window is the available tail (same convention
 * as relVol, I.8).
 *
 * Guard (documented): when the band has zero width — σ = 0 (all closes in the
 * window equal, including a single-bar window) or stdevMult = 0 — %B is 0/0.
 * Return 0.5, the value %B takes at the mean, so the Structure family casts no
 * extreme vote. Empty input likewise returns 0.5.
 */
export function percentB(closes: readonly number[], period: number, stdevMult: number): number {
  if (!Number.isInteger(period) || period < 1) {
    throw new RangeError(`percentB: period must be a positive integer, got ${period}`);
  }
  if (closes.length === 0) return 0.5;

  const window = closes.slice(-period);
  const mid = mean(window);
  let sqDevSum = 0;
  for (const c of window) sqDevSum += (c - mid) ** 2;
  const sigma = Math.sqrt(sqDevSum / window.length);

  const upper = mid + stdevMult * sigma;
  const lower = mid - stdevMult * sigma;
  if (upper === lower) return 0.5;

  const close = closes[closes.length - 1];
  return (close - lower) / (upper - lower);
}
