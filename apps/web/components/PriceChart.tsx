'use client';

/**
 * Price chart — design doc §6.2 item 4.
 * TradingView Lightweight Charts (v5): candlesticks + volume pane + SMA20/50
 * + reference price lines (entry/stop/target when a plan exists, S/R otherwise).
 * Pure presentation: all numbers arrive via props from the API response.
 */

import { useEffect, useRef } from 'react';
import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  LineSeries,
  LineStyle,
} from 'lightweight-charts';
import type { ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import type { Direction, Plan } from '@thresher/engine';
import type { AnalyzeResponse, ChartPayload } from '../lib/api-types';
import styles from './PriceChart.module.css';

export interface PriceChartProps {
  chart: ChartPayload;
  /** Trade overlays are optional: a too-new ticker has a chart but no analysis,
   *  so the chart renders candles + SMAs alone (no entry/stop/target or S/R). */
  plan?: Plan | null;
  levels?: AnalyzeResponse['levels'] | null;
  direction?: Direction;
}

/**
 * Canvas options cannot read CSS custom properties, so §6.1 tokens are resolved
 * from computed style at runtime; these are the spec values as fallbacks.
 */
const TOKEN_FALLBACK = {
  long: '#3FCF8E',
  short: '#F26969',
  amber: '#E8B44C',
  border: '#27303C',
  muted: '#8C96A6',
  mono: "'IBM Plex Mono', ui-monospace, monospace",
} as const;

/** SMA line colors — subtle blue-greys carried over from the prototype (not §6.1 tokens). */
const SMA_COLOR = { sma20: '#8FA3C4', sma50: '#5A6B85' } as const;

/** Volume pane occupies the bottom ~22% of the chart, candles keep the rest. */
const PANE_LAYOUT = {
  price: { top: 0.06, bottom: 0.26 },
  volume: { top: 0.8, bottom: 0 },
} as const;

const MS_PER_DAY = 86_400_000;
const VOLUME_ALPHA = 0.32;

function cssToken(el: HTMLElement, name: string, fallback: string): string {
  const value = window.getComputedStyle(el).getPropertyValue(name).trim();
  return value || fallback;
}

/** `#RRGGBB` → `rgba(...)`; returns the input unchanged when not a 6-digit hex. */
function withAlpha(color: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return color;
  const n = parseInt(match[1], 16);
  return `rgba(${(n >> 16) & 0xff}, ${(n >> 8) & 0xff}, ${n & 0xff}, ${alpha})`;
}

function toTime(epochMs: number): UTCTimestamp {
  return Math.floor(epochMs / 1000) as UTCTimestamp;
}

/** SMA arrays are index-aligned to bars with a null prefix before the window fills. */
function smaData(bars: ChartPayload['bars'], values: (number | null)[]) {
  return bars.flatMap((bar, i) => {
    const value = values[i];
    return value == null ? [] : [{ time: toTime(bar.t), value }];
  });
}

export default function PriceChart({ chart, plan, levels, direction }: PriceChartProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // SSR guard: lightweight-charts touches the DOM on creation.
    if (typeof window === 'undefined') return;
    const host = hostRef.current;
    if (!host || chart.bars.length === 0) return;

    const colors = {
      long: cssToken(host, '--long', TOKEN_FALLBACK.long),
      short: cssToken(host, '--short', TOKEN_FALLBACK.short),
      amber: cssToken(host, '--amber', TOKEN_FALLBACK.amber),
      border: cssToken(host, '--border', TOKEN_FALLBACK.border),
      muted: cssToken(host, '--muted', TOKEN_FALLBACK.muted),
    };
    const monoFont = cssToken(host, '--font-mono', TOKEN_FALLBACK.mono);

    // Intraday (hourly) bars need clock labels on the time axis; daily/weekly don't.
    const intradayBars =
      chart.bars.length >= 2 && chart.bars[1].t - chart.bars[0].t < MS_PER_DAY;

    const api = createChart(host, {
      width: host.clientWidth,
      height: host.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: colors.muted,
        fontFamily: monoFont,
        fontSize: 10,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: colors.border, style: LineStyle.Dotted },
      },
      rightPriceScale: {
        borderColor: colors.border,
        scaleMargins: { ...PANE_LAYOUT.price },
      },
      timeScale: {
        borderColor: colors.border,
        timeVisible: intradayBars,
        secondsVisible: false,
      },
      crosshair: {
        vertLine: { color: colors.muted, labelBackgroundColor: colors.border },
        horzLine: { color: colors.muted, labelBackgroundColor: colors.border },
      },
    });

    const candles = api.addSeries(CandlestickSeries, {
      upColor: colors.long,
      downColor: colors.short,
      borderVisible: false,
      wickUpColor: colors.long,
      wickDownColor: colors.short,
    });
    candles.setData(
      chart.bars.map((bar) => ({
        time: toTime(bar.t),
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
      })),
    );

    const volume = api.addSeries(HistogramSeries, {
      color: withAlpha(colors.muted, VOLUME_ALPHA),
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      priceLineVisible: false,
      lastValueVisible: false,
    });
    volume.setData(chart.bars.map((bar) => ({ time: toTime(bar.t), value: bar.v })));
    api.priceScale('volume').applyOptions({ scaleMargins: { ...PANE_LAYOUT.volume } });

    const smaOptions = {
      lineWidth: 1 as const,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    };
    const sma20: ISeriesApi<'Line'> = api.addSeries(LineSeries, {
      ...smaOptions,
      color: SMA_COLOR.sma20,
    });
    sma20.setData(smaData(chart.bars, chart.sma20));
    const sma50: ISeriesApi<'Line'> = api.addSeries(LineSeries, {
      ...smaOptions,
      color: SMA_COLOR.sma50,
    });
    sma50.setData(smaData(chart.bars, chart.sma50));

    // Reference lines: trade levels when a plan exists; S/R readout on NO TRADE
    // (§6.2); none at all when there is no analysis yet (too-new ticker).
    const lineBase = { lineWidth: 1 as const, lineStyle: LineStyle.Dashed, axisLabelVisible: true };
    const priceLines = plan
      ? [
          { ...lineBase, price: plan.entry, color: colors.amber, title: 'ENTRY' },
          { ...lineBase, price: plan.stop, color: colors.short, title: 'STOP' },
          { ...lineBase, price: plan.target, color: colors.long, title: 'TARGET' },
        ]
      : levels
        ? [
            { ...lineBase, price: levels.resistance, color: colors.short, title: 'R' },
            { ...lineBase, price: levels.support, color: colors.long, title: 'S' },
          ]
        : [];
    for (const line of priceLines) candles.createPriceLine(line);

    api.timeScale().fitContent();

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) api.applyOptions({ width, height });
      }
    });
    observer.observe(host);

    return () => {
      observer.disconnect();
      api.remove();
    };
  }, [chart, plan, levels]);

  return (
    <section
      className={`panel ${styles.wrap}`}
      data-testid="price-chart"
      aria-label={`Price chart with moving averages${
        plan ? ' and trade levels' : levels ? ' and support and resistance levels' : ''
      }${direction ? ` (${direction === 'none' ? 'no trade' : direction} reading)` : ''}`}
    >
      <div className={`kicker ${styles.label}`}>
        PRICE · SMA20 · SMA50{plan ? ' · TRADE LEVELS' : levels ? ' · S/R LEVELS' : ''}
      </div>
      <div ref={hostRef} className={styles.host} />
    </section>
  );
}
