/**
 * Exponential Moving Average.
 * Spec: docs/THRESHER-METHODOLOGY.md I.2 — binding.
 *
 *   k     = 2 / (n + 1)
 *   EMA_t = C_t × k + EMA_(t−1) × (1 − k)
 *   EMA_0 = C_0                         (seeded with the first value, NOT an SMA)
 *
 * The seed biases early values; per the doc, EMA-derived signals are only
 * trusted after ≥ 5×n bars, which the design-doc lookbacks guarantee.
 */

/**
 * Full EMA series for `values`, one output per input, index 0 = values[0].
 * Pure: no I/O, no clock, no state.
 */
export function emaSeries(values: readonly number[], period: number): number[] {
  if (!Number.isInteger(period) || period < 1) {
    throw new RangeError(`EMA period must be a positive integer, got ${period}`);
  }
  if (values.length === 0) return [];

  const k = 2 / (period + 1);
  const out = new Array<number>(values.length);
  out[0] = values[0]!;
  for (let t = 1; t < values.length; t++) {
    out[t] = values[t]! * k + out[t - 1]! * (1 - k);
  }
  return out;
}
