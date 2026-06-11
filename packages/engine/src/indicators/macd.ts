/**
 * MACD (Moving Average Convergence Divergence).
 * Spec: docs/THRESHER-METHODOLOGY.md I.3 — binding.
 *
 *   MACD line = EMA_fast(C) − EMA_slow(C)
 *   Signal    = EMA_signalPeriod(MACD line)
 *   Histogram = MACD line − Signal
 *
 * Three EMA passes — two over closes, one over the MACD line itself. All EMAs
 * are seeded per I.2 (first value), so early outputs carry seed bias; the
 * engine's lookback windows guarantee enough history before any reading is used.
 *
 * MACD is unbounded and scale-dependent: callers only ever read relationships
 * (line above/below signal, histogram now vs. 3 bars ago), never magnitudes.
 */
import { emaSeries } from './ema';

export interface MacdSeries {
  line: number[];
  signal: number[];
  hist: number[];
}

/**
 * Full MACD series, one output per input bar (index-aligned with `closes`).
 * Periods arrive via config (DEFAULT_CONFIG.indicators.macd) — never hardcoded.
 * Pure: no I/O, no clock, no state.
 */
export function macdSeries(
  closes: readonly number[],
  fast: number,
  slow: number,
  signalPeriod: number,
): MacdSeries {
  const emaFast = emaSeries(closes, fast);
  const emaSlow = emaSeries(closes, slow);

  const line = new Array<number>(closes.length);
  for (let t = 0; t < closes.length; t++) {
    line[t] = emaFast[t]! - emaSlow[t]!;
  }

  const signal = emaSeries(line, signalPeriod);

  const hist = new Array<number>(closes.length);
  for (let t = 0; t < closes.length; t++) {
    hist[t] = line[t]! - signal[t]!;
  }

  return { line, signal, hist };
}
