/**
 * Trend family — is there a directional regime, and how clean is it?
 * Spec: docs/THRESHER-DESIGN.md §4.1 (Trend table + ADX multiplier),
 * docs/THRESHER-METHODOLOGY.md I.6 (ADX quality multiplier table).
 *
 * Three component votes (price vs SMA50, SMA stack, SMA50 slope), then the raw
 * sum is discounted by an ADX quality multiplier — ADX never generates
 * direction, it only discounts (methodology I.6). Clamped to [−1, +1].
 */
import type { Detail, IndicatorSnapshot } from '../types';
import type { EngineConfig } from '../config';
import { clampScore, fmtPrice } from '../util';

export function scoreTrend(
  snap: IndicatorSnapshot,
  cfg: EngineConfig,
): { score: number; details: Detail[]; choppy: boolean } {
  const { priceVsSma50, smaStack, smaSlope } = cfg.families.trend;
  const adxCfg = cfg.families.adx;
  const details: Detail[] = [];
  let raw = 0;

  // Component 1: price vs SMA50 (boundary is strict >, matching the prototype).
  if (snap.close > snap.sma50) {
    raw += priceVsSma50;
    details.push({ ok: 1, text: `Price above 50-bar SMA (${fmtPrice(snap.sma50)})` });
  } else {
    raw -= priceVsSma50;
    details.push({ ok: -1, text: `Price below 50-bar SMA (${fmtPrice(snap.sma50)})` });
  }

  // Component 2: SMA20 vs SMA50 stack.
  if (snap.sma20 > snap.sma50) {
    raw += smaStack;
    details.push({ ok: 1, text: '20 SMA above 50 SMA (bullish stack)' });
  } else {
    raw -= smaStack;
    details.push({ ok: -1, text: '20 SMA below 50 SMA (bearish stack)' });
  }

  // Component 3: SMA50 slope vs `smaSlopeLookback` bars ago.
  if (snap.sma50 > snap.sma50Prev) {
    raw += smaSlope;
    details.push({ ok: 1, text: '50 SMA sloping upward' });
  } else {
    raw -= smaSlope;
    details.push({ ok: -1, text: '50 SMA sloping downward' });
  }

  // ADX quality multiplier on the raw sum (methodology I.6 table).
  const adxLabel = snap.adx.toFixed(0);
  let multiplier: number;
  let choppy = false;
  if (snap.adx >= adxCfg.establishedMin) {
    multiplier = adxCfg.establishedMult;
    details.push({ ok: 1, text: `ADX ${adxLabel} — established trend` });
  } else if (snap.adx >= adxCfg.developingMin) {
    multiplier = adxCfg.developingMult;
    details.push({ ok: 0, text: `ADX ${adxLabel} — developing trend` });
  } else {
    multiplier = adxCfg.choppyMult;
    choppy = true;
    details.push({ ok: -1, text: `ADX ${adxLabel} — choppy, low trend conviction` });
  }

  return { score: clampScore(raw * multiplier), details, choppy };
}
