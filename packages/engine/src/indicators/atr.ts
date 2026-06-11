/**
 * Average True Range, Wilder smoothing (methodology I.5).
 *
 * TR_t  = max( H_t − L_t, |H_t − C_(t−1)|, |L_t − C_(t−1)| )   from bar index 1
 * ATR seeded as the simple mean of the first n TRs, then:
 * ATR_t = (ATR_(t−1) × (n−1) + TR_t) / n
 *
 * ATR is the engine's unit of distance — it never votes on direction, it only
 * sizes buffers, caps, and projections.
 */
import type { Bar } from '../types';

/**
 * Per-bar ATR series aligned to the input: `null` until the seed is complete.
 * TR exists from bar index 1 (it needs the previous close), so the seed — the
 * simple mean of the first `period` TRs — lands at bar index `period`, which is
 * the first non-null entry. Wilder smoothing thereafter.
 */
export function atrSeries(bars: readonly Bar[], period: number): (number | null)[] {
  if (!Number.isInteger(period) || period < 1) {
    throw new RangeError(`atrSeries: period must be a positive integer, got ${period}`);
  }

  const out: (number | null)[] = new Array<number | null>(bars.length).fill(null);
  let trSum = 0;
  let atr: number | null = null;
  for (let i = 1; i < bars.length; i++) {
    const bar = bars[i];
    const prevClose = bars[i - 1].c;
    const tr = Math.max(
      bar.h - bar.l,
      Math.abs(bar.h - prevClose),
      Math.abs(bar.l - prevClose),
    );

    if (atr === null) {
      trSum += tr;
      if (i === period) atr = trSum / period;
    } else {
      atr = (atr * (period - 1) + tr) / period;
    }
    out[i] = atr;
  }
  return out;
}
