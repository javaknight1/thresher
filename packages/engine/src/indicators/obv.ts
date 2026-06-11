/**
 * On-Balance Volume (methodology I.7).
 *
 *   OBV_t = OBV_(t−1) + V_t   if C_t > C_(t−1)
 *           OBV_(t−1) − V_t   if C_t < C_(t−1)
 *           OBV_(t−1)         if equal
 *
 * The OBV LEVEL is meaningless (it depends on where the series starts); the
 * engine reads only the delta over a lookback window (config: indicators.obv.deltaBars).
 */
import type { Bar } from '../types';

/** Full OBV series, one value per bar, seeded OBV_0 = 0. */
export function obvSeries(bars: readonly Bar[]): number[] {
  const out: number[] = [];
  let obv = 0;
  for (let i = 0; i < bars.length; i++) {
    if (i > 0) {
      const close = bars[i].c;
      const prevClose = bars[i - 1].c;
      if (close > prevClose) obv += bars[i].v;
      else if (close < prevClose) obv -= bars[i].v;
      // equal closes: unchanged
    }
    out.push(obv);
  }
  return out;
}

/**
 * OBV_last − OBV_(last − deltaBars), the only OBV reading the engine uses
 * (methodology I.7). The earlier index is clamped to ≥ 0 when the series is
 * shorter than the lookback. Empty input yields 0 (no flow observed).
 */
export function obvDelta(bars: readonly Bar[], deltaBars: number): number {
  const series = obvSeries(bars);
  if (series.length === 0) return 0;
  const last = series.length - 1;
  const earlier = Math.max(0, last - deltaBars);
  return series[last] - series[earlier];
}
