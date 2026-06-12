/**
 * Universe guardrails — design §11.1 (user-confirmed decision).
 *
 * Keeps the engine off untradeable junk: a price floor and a minimum average
 * dollar volume. Runs on the fetched bars before analysis; a failure maps to
 * the UNTRADEABLE_SYMBOL API error (422). All thresholds live in
 * WEB_CONFIG.guardrails — no magic numbers here.
 */
import type { Bar, Timeframe } from '@thresher/engine';
import { WEB_CONFIG } from './config';

export type GuardrailResult = { ok: true } | { ok: false; reason: string };

/** Compact human-readable dollar amount: $950K, $1M, $2.5M. */
function fmtDollars(value: number): string {
  const MILLION = 1_000_000;
  const THOUSAND = 1_000;
  if (value >= MILLION) {
    const m = value / MILLION;
    return `$${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  if (value >= THOUSAND) {
    return `$${Math.round(value / THOUSAND)}K`;
  }
  return `$${value.toFixed(2)}`;
}

/**
 * Checks the last close against the price floor and the mean dollar volume of
 * the last `windowBars` bars (normalized to per-day via `perDayFactor`, since
 * intraday bars are hourly and position bars are weekly) against the dollar
 * volume floor. Boundary values pass: rejection requires strictly below.
 */
export function checkGuardrails(bars: readonly Bar[], timeframe: Timeframe): GuardrailResult {
  const { minPrice, minAvgDollarVolume, perDayFactor, windowBars } = WEB_CONFIG.guardrails;

  if (bars.length === 0) {
    return { ok: false, reason: 'no price data returned — cannot assess tradability' };
  }

  const lastClose = bars[bars.length - 1].c;
  if (lastClose < minPrice) {
    return {
      ok: false,
      reason: `price $${lastClose.toFixed(2)} below the $${minPrice} floor — too thin for technical analysis`,
    };
  }

  const window = bars.slice(-windowBars);
  const meanBarDollarVolume = window.reduce((sum, b) => sum + b.c * b.v, 0) / window.length;
  const dailyDollarVolume = meanBarDollarVolume * perDayFactor[timeframe];
  if (dailyDollarVolume < minAvgDollarVolume) {
    return {
      ok: false,
      reason:
        `average dollar volume ${fmtDollars(dailyDollarVolume)}/day below the ` +
        `${fmtDollars(minAvgDollarVolume)} floor — too illiquid for technical analysis`,
    };
  }

  return { ok: true };
}
