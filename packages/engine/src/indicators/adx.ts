/**
 * Average Directional Index with +DI / −DI (Wilder).
 * Spec: docs/THRESHER-METHODOLOGY.md I.6 — binding.
 *
 * Directional movement per bar (t ≥ 1):
 *   upMove   = H_t − H_(t−1)
 *   downMove = L_(t−1) − L_t
 *   +DM = upMove   if upMove > downMove and upMove > 0,   else 0
 *   −DM = downMove if downMove > upMove and downMove > 0, else 0
 *   TR  = max( H_t − L_t, |H_t − C_(t−1)|, |L_t − C_(t−1)| )   (methodology I.5)
 *
 * Wilder-smooth TR, +DM, −DM over n
 * (seed = sum of first n; then S_t = S_(t−1) − S_(t−1)/n + x_t):
 *   +DI = 100 × S(+DM) / S(TR)
 *   −DI = 100 × S(−DM) / S(TR)
 *   DX  = 100 × |+DI − −DI| / (+DI + −DI)
 *   ADX = Wilder average of DX over n
 *         (seed = simple mean of first n DX values, then
 *          ADX_t = (ADX_(t−1) × (n−1) + DX_t) / n)
 *
 * Guards (no NaN ever): S(TR) = 0 → both DI = 0; (+DI + −DI) = 0 → DX = 0.
 *
 * Alignment: per-bar values start at bar 1, so the smoothing seed completes at
 * bar index n (first DI/DX), and the ADX seed mean completes at bar index
 * 2n − 1 (first ADX). Earlier entries are null.
 */
import type { Bar } from '../types';

export interface AdxSeries {
  adx: (number | null)[];
  plusDI: (number | null)[];
  minusDI: (number | null)[];
}

/**
 * Per-bar ADX / +DI / −DI series aligned to `bars`: `null` during warm-up
 * (+DI/−DI before index `period`, ADX before index `2 × period − 1`).
 * Pure: no I/O, no clock, no state.
 */
export function adxSeries(bars: readonly Bar[], period: number): AdxSeries {
  if (!Number.isInteger(period) || period < 1) {
    throw new RangeError(`ADX period must be a positive integer, got ${period}`);
  }

  const len = bars.length;
  const adx = new Array<number | null>(len).fill(null);
  const plusDI = new Array<number | null>(len).fill(null);
  const minusDI = new Array<number | null>(len).fill(null);

  const diStart = period; // first bar index with smoothed DI/DX
  const adxStart = 2 * period - 1; // first bar index with ADX

  let sTR = 0; // Wilder-smoothed (running-sum form) true range
  let sPlusDM = 0; // Wilder-smoothed +DM
  let sMinusDM = 0; // Wilder-smoothed −DM
  let dxSeedSum = 0; // accumulates the first `period` DX values for the ADX seed
  let prevAdx = 0; // ADX_(t−1), valid once t > adxStart

  for (let t = 1; t < len; t++) {
    const prev = bars[t - 1]!;
    const cur = bars[t]!;

    const upMove = cur.h - prev.h;
    const downMove = prev.l - cur.l;
    const plusDM = upMove > downMove && upMove > 0 ? upMove : 0;
    const minusDM = downMove > upMove && downMove > 0 ? downMove : 0;
    const tr = Math.max(cur.h - cur.l, Math.abs(cur.h - prev.c), Math.abs(cur.l - prev.c));

    if (t <= period) {
      // Seed phase: sum of the first n per-bar values (bars 1 … n).
      sTR += tr;
      sPlusDM += plusDM;
      sMinusDM += minusDM;
    } else {
      sTR = sTR - sTR / period + tr;
      sPlusDM = sPlusDM - sPlusDM / period + plusDM;
      sMinusDM = sMinusDM - sMinusDM / period + minusDM;
    }

    if (t < diStart) continue;

    const pdi = sTR === 0 ? 0 : (100 * sPlusDM) / sTR;
    const mdi = sTR === 0 ? 0 : (100 * sMinusDM) / sTR;
    plusDI[t] = pdi;
    minusDI[t] = mdi;

    const diSum = pdi + mdi;
    const dx = diSum === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / diSum;

    if (t < adxStart) {
      dxSeedSum += dx;
    } else if (t === adxStart) {
      dxSeedSum += dx;
      prevAdx = dxSeedSum / period; // seed = simple mean of first n DX values
      adx[t] = prevAdx;
    } else {
      prevAdx = (prevAdx * (period - 1) + dx) / period;
      adx[t] = prevAdx;
    }
  }

  return { adx, plusDI, minusDI };
}
