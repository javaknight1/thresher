/**
 * Relative Strength Index (Wilder) — methodology I.4 (BINDING).
 *
 * gain_t = max(C_t − C_(t−1), 0)
 * loss_t = max(C_(t−1) − C_t, 0)
 *
 * Seed (simple average over the first n changes, i.e. changes 1..n):
 *   AvgGain = (1/n) Σ gain     AvgLoss = (1/n) Σ loss
 *
 * Thereafter (Wilder smoothing):
 *   AvgGain_t = (AvgGain_(t−1) × (n−1) + gain_t) / n
 *   AvgLoss_t = (AvgLoss_(t−1) × (n−1) + loss_t) / n
 *
 * RS  = AvgGain / AvgLoss
 * RSI = 100 − 100 / (1 + RS)      (RSI = 100 when AvgLoss = 0)
 *
 * Pure function: no I/O, no clock, no config — the period arrives as a parameter
 * (config.indicators.rsi.period at the call site).
 */

/**
 * The 0–100 normalization scale is part of the I.4 formula itself
 * (RSI = 100 − 100/(1+RS)), not a tunable design constant.
 */
const RSI_SCALE = 100;

function rsiFromAverages(avgGain: number, avgLoss: number): number {
  // Doc-specified edge case: RSI = 100 when AvgLoss = 0.
  if (avgLoss === 0) return RSI_SCALE;
  const rs = avgGain / avgLoss;
  return RSI_SCALE - RSI_SCALE / (1 + rs);
}

/**
 * RSI series aligned to `closes`: `null` for indices < `period`; the first RSI
 * (at index = period) is the simple seed over changes 1..period, each later
 * value is Wilder-smoothed.
 */
export function rsiSeries(closes: readonly number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array<number | null>(closes.length).fill(null);
  if (period < 1 || closes.length <= period) return out;

  // Simple seed: average the first `period` gains/losses (changes 1..period).
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss -= change;
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = rsiFromAverages(avgGain, avgLoss);

  // Wilder smoothing for every subsequent bar.
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = rsiFromAverages(avgGain, avgLoss);
  }
  return out;
}
