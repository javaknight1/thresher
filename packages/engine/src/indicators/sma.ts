/**
 * Simple Moving Average (methodology I.1).
 *
 * SMA_n(t) = (1/n) × Σ C_(t−i) for i = 0 … n−1 — sum the last n values,
 * divide by n. Computed as a rolling window (add the newest value, drop the
 * oldest) for O(1) per bar.
 */

/**
 * Per-bar SMA series aligned to the input: `null` until index `period − 1`
 * (the window is not yet full), the n-bar simple average thereafter.
 */
export function smaSeries(values: readonly number[], period: number): (number | null)[] {
  if (!Number.isInteger(period) || period < 1) {
    throw new RangeError(`smaSeries: period must be a positive integer, got ${period}`);
  }

  const out: (number | null)[] = new Array<number | null>(values.length);
  let windowSum = 0;
  for (let i = 0; i < values.length; i++) {
    windowSum += values[i];
    if (i >= period) windowSum -= values[i - period];
    out[i] = i >= period - 1 ? windowSum / period : null;
  }
  return out;
}
