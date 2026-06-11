/**
 * Assembles the IndicatorSnapshot the determination layer consumes.
 * Pure: bars in, readings out. All parameters come from config.
 */
import type { Bar, IndicatorSnapshot } from '../types';
import type { EngineConfig } from '../config';
import { smaSeries } from './sma';
import { macdSeries } from './macd';
import { rsiSeries } from './rsi';
import { atrSeries } from './atr';
import { adxSeries } from './adx';
import { obvDelta } from './obv';
import { relVol } from './relative-volume';
import { percentB } from './bollinger';
import { pivotLevels } from './pivots';

/**
 * Minimum history before any snapshot is trusted: EMA-derived signals need
 * ≥ 5× the slow EMA period (methodology I.2); other windows are smaller.
 */
export function minBars(cfg: EngineConfig): number {
  const ind = cfg.indicators;
  return Math.max(
    ind.minBarsFactor * ind.macd.slow,
    ind.sma.mid + ind.smaSlopeLookback + 1,
    2 * ind.adx.period,
    ind.bollinger.period,
    ind.relVol.longBars + 1,
    ind.obv.deltaBars + 1,
    ind.priceDeltaBars + 1,
  );
}

function req(value: number | null | undefined, name: string): number {
  if (value === null || value === undefined) {
    throw new Error(`indicator "${name}" unavailable — insufficient history`);
  }
  return value;
}

/**
 * Insufficient history is a data-layer error (thrown), not a refusal: refusals
 * are reserved for gate decisions on valid data (CLAUDE.md hard rule 4).
 */
export function buildSnapshot(bars: readonly Bar[], cfg: EngineConfig): IndicatorSnapshot {
  const need = minBars(cfg);
  if (bars.length < need) {
    throw new Error(`insufficient bars: got ${bars.length}, need ≥ ${need}`);
  }

  const ind = cfg.indicators;
  const closes = bars.map((b) => b.c);
  const volumes = bars.map((b) => b.v);
  const last = closes.length - 1;
  const close = closes[last];

  const sma20s = smaSeries(closes, ind.sma.short);
  const sma50s = smaSeries(closes, ind.sma.mid);
  const macd = macdSeries(closes, ind.macd.fast, ind.macd.slow, ind.macd.signal);
  const rsis = rsiSeries(closes, ind.rsi.period);
  const atrs = atrSeries(bars, ind.atr.period);
  const adxs = adxSeries(bars, ind.adx.period);

  const atr = req(atrs[last], 'atr');
  const pivots = pivotLevels(bars, atr, ind.pivots);

  return {
    close,
    sma20: req(sma20s[last], 'sma20'),
    sma50: req(sma50s[last], 'sma50'),
    sma50Prev: req(sma50s[last - ind.smaSlopeLookback], 'sma50Prev'),
    rsi: req(rsis[last], 'rsi'),
    macd: {
      line: macd.line[last],
      signal: macd.signal[last],
      hist: macd.hist[last],
      histPrev: macd.hist[last - ind.macd.histCompareBars],
    },
    atr,
    adx: req(adxs.adx[last], 'adx'),
    obvDelta: obvDelta(bars, ind.obv.deltaBars),
    priceDelta: close - closes[last - ind.priceDeltaBars],
    relVol: relVol(volumes, ind.relVol.shortBars, ind.relVol.longBars),
    percentB: percentB(closes, ind.bollinger.period, ind.bollinger.stdevMult),
    support: pivots.support,
    resistance: pivots.resistance,
    zonesAbove: pivots.zonesAbove,
    zonesBelow: pivots.zonesBelow,
  };
}
