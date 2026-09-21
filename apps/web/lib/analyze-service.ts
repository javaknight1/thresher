/**
 * Analyze service — the testable core of GET /api/v1/analyze (design §8).
 *
 * No Request/Response objects here: the route handles HTTP (params, rate
 * limit, status codes) and delegates to `runAnalysis`, which wires the data
 * layer (cache → guardrails → earnings) into the pure engine and assembles
 * the frozen AnalyzeResponse contract. Tests drive this directly with the
 * MockProvider — Yahoo is never exercised in tests (CLAUDE.md).
 */
import { analyze, smaSeries, minBars, DEFAULT_CONFIG } from '@thresher/engine';
import type { Bar, Timeframe } from '@thresher/engine';
import type {
  AnalyzeResponse,
  ApiError,
  ChartPayload,
  InsufficientHistoryResponse,
} from './api-types';
import { ProviderError } from './contracts';
import type { BarCache, BarsWithFreshness, MarketDataProvider } from './contracts';
import { getBarsWithFreshness } from './cache';
import { checkGuardrails } from './guardrails';
import { WEB_CONFIG } from './config';

export interface RunAnalysisInput {
  symbol: string;
  timeframe: Timeframe;
  provider: MarketDataProvider;
  cache: BarCache;
  /** injectable clock for deterministic tests; defaults to wall-clock */
  now?: () => Date;
  /**
   * Point-in-time replay: analyze the symbol AS OF this past instant, using only
   * bars up to it (no lookahead). Bypasses the live cache and disables the
   * earnings veto (the point-in-time earnings calendar isn't reconstructable).
   */
  asOf?: Date;
}

export type RunAnalysisResult =
  | { ok: true; body: AnalyzeResponse | InsufficientHistoryResponse }
  | { ok: false; error: ApiError };

/**
 * Chart payload (design §8): the last WEB_CONFIG.chart.bars bars, with SMA
 * overlays computed over ALL closes and then sliced to the same window —
 * slicing closes first would re-seed the averages and misalign the overlay.
 * Periods come from the engine config (no magic numbers).
 */
function buildChart(bars: readonly Bar[]): ChartPayload {
  const window = bars.slice(-WEB_CONFIG.chart.bars);
  const closes = bars.map((b) => b.c);
  const { short, mid } = DEFAULT_CONFIG.indicators.sma;
  return {
    bars: window,
    sma20: smaSeries(closes, short).slice(-window.length),
    sma50: smaSeries(closes, mid).slice(-window.length),
  };
}

export async function runAnalysis(input: RunAnalysisInput): Promise<RunAnalysisResult> {
  const { provider, cache, timeframe } = input;
  const symbol = input.symbol.toUpperCase();
  const now = input.now ?? (() => new Date());
  // The instant the analysis is "as of": a past date for a historical replay,
  // otherwise now.
  const analysisTime = input.asOf ?? now();
  const historical = input.asOf != null;

  // 1. Bars. Live: the stale-while-revalidate cache (design §2.1). Historical:
  // a direct point-in-time fetch — the window is immutable, so there's no
  // freshness to cache-manage, and it must never include a bar after `asOf`.
  let fresh: BarsWithFreshness;
  try {
    if (input.asOf) {
      const bars = await provider.getBars(symbol, timeframe, input.asOf);
      const last = bars[bars.length - 1];
      fresh = {
        bars,
        fetchedAt: last ? new Date(last.t).toISOString() : input.asOf.toISOString(),
        stale: false,
      };
    } else {
      fresh = await getBarsWithFreshness(provider, cache, symbol, timeframe, {
        now: () => now().getTime(),
      });
    }
  } catch (err) {
    if (err instanceof ProviderError && err.code === 'UNKNOWN_SYMBOL') {
      return { ok: false, error: { error: 'UNKNOWN_SYMBOL', message: err.message } };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { error: 'DATA_UNAVAILABLE', message } };
  }

  // 2. Universe guardrails (design §11.1) — refuse untradeable junk with the
  // human-readable reason.
  const guard = checkGuardrails(fresh.bars, timeframe);
  if (!guard.ok) {
    return {
      ok: false,
      error: { error: 'UNTRADEABLE_SYMBOL', message: `${symbol}: ${guard.reason}` },
    };
  }

  // 2b. Minimum history: the pure engine THROWS on too few bars (indicators
  // need ≥ minBars — snapshot.ts). That is correct engine behavior, but a throw
  // here would escape as an HTTP 500. A newly listed ticker is a valid stock,
  // not an error — return a first-class PARTIAL result (price + chart) so the
  // UI still shows the chart and the company panel, and just says the full
  // technical read isn't available for this timeframe yet.
  const needed = minBars(DEFAULT_CONFIG);
  if (fresh.bars.length < needed) {
    const partial: InsufficientHistoryResponse = {
      status: 'insufficient_history',
      symbol,
      timeframe,
      asOf: analysisTime.toISOString(),
      dataFreshness: fresh.fetchedAt,
      stale: fresh.stale,
      ...(historical ? { historical: true } : {}),
      price: fresh.bars[fresh.bars.length - 1].c,
      barsAvailable: fresh.bars.length,
      barsNeeded: needed,
      chart: buildChart(fresh.bars),
    };
    return { ok: true, body: partial };
  }

  // 3. Earnings distance — best-effort, and only for a LIVE analysis. A
  // historical replay can't reconstruct the point-in-time earnings calendar from
  // the free feed, so it passes "unknown" (the engine's G5 becomes flag-only).
  let tradingDaysToEarnings: number | null = null;
  if (!historical) {
    try {
      tradingDaysToEarnings = await provider.getDaysToEarnings(symbol, now());
    } catch {
      tradingDaysToEarnings = null;
    }
  }

  // 4. The pure engine call — all math lives there, never here. Guarded above
  // for the known throw (insufficient history); this catch is a backstop so no
  // unforeseen engine throw can ever become an HTTP 500 — it degrades to a
  // clean DATA_UNAVAILABLE instead.
  let result;
  try {
    result = analyze(fresh.bars, DEFAULT_CONFIG, {
      symbol,
      timeframe,
      tradingDaysToEarnings,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: { error: 'DATA_UNAVAILABLE', message: `${symbol}: analysis failed — ${message}` },
    };
  }

  // 5–6. Assemble the frozen §8 response: engine result + freshness + chart.
  const body: AnalyzeResponse = {
    ...result,
    symbol,
    timeframe,
    asOf: analysisTime.toISOString(),
    dataFreshness: fresh.fetchedAt,
    stale: fresh.stale,
    ...(historical ? { historical: true } : {}),
    chart: buildChart(fresh.bars),
  };
  return { ok: true, body };
}
