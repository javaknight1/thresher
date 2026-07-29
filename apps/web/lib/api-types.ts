/**
 * FROZEN: the /api/v1/analyze response contract — design doc §8, field-for-field.
 * The UI consumes exactly these shapes.
 */
import type { AnalysisResult, Bar, Timeframe } from '@thresher/engine';
import type { CompanyProfile } from './contracts';

export interface ChartPayload {
  /** last ~130 bars (WEB_CONFIG.chart.bars) */
  bars: Bar[];
  /** aligned to chart bars; null before the window fills */
  sma20: (number | null)[];
  sma50: (number | null)[];
}

export interface AnalyzeResponse {
  symbol: string;
  timeframe: Timeframe;
  /** when the analysis ran (ISO) */
  asOf: string;
  /** when the bar data was fetched from the provider (ISO) — design §2.1 */
  dataFreshness: string;
  /** true when bars were served past TTL (stale-while-revalidate / provider down) */
  stale: boolean;
  engineVersion: string;
  configHash: string;
  price: number;
  direction: AnalysisResult['direction'];
  composite: number;
  confidence: AnalysisResult['confidence'];
  gates: AnalysisResult['gates'];
  plan: AnalysisResult['plan'];
  refusal: AnalysisResult['refusal'];
  families: AnalysisResult['families'];
  levels: AnalysisResult['levels'];
  indicators: AnalysisResult['indicators'];
  flags: AnalysisResult['flags'];
  story: string;
  chart: ChartPayload;
}

/**
 * Partial analyze result for a valid ticker with too little price history for
 * the engine (e.g. a recent IPO — the engine needs ≥ barsNeeded bars). It is a
 * first-class 200 result, NOT an error: the UI still shows the chart, the price,
 * and the company panel, and just says the full technical read isn't available
 * yet. `status` discriminates it from a full AnalyzeResponse.
 */
export interface InsufficientHistoryResponse {
  status: 'insufficient_history';
  symbol: string;
  timeframe: Timeframe;
  asOf: string;
  dataFreshness: string;
  stale: boolean;
  price: number;
  /** bars actually available for this timeframe */
  barsAvailable: number;
  /** bars the engine needs before it will analyze */
  barsNeeded: number;
  chart: ChartPayload;
}

/**
 * GET /api/v1/profile response — display-only company context, a separate
 * endpoint from analyze so a slow/flaky fundamentals fetch never blocks or
 * breaks the trade plan. This data does NOT come from the engine.
 */
export interface ProfileResponse {
  profile: CompanyProfile;
  /** when the fundamentals were fetched (ISO) */
  fetchedAt: string;
  /** true when served past the profile TTL (stale-while-revalidate) */
  stale: boolean;
}

export type ApiErrorCode =
  | 'INVALID_REQUEST'
  | 'UNKNOWN_SYMBOL'
  | 'UNTRADEABLE_SYMBOL'
  | 'INSUFFICIENT_HISTORY'
  | 'RATE_LIMITED'
  | 'DATA_UNAVAILABLE';

export interface ApiError {
  error: ApiErrorCode;
  message: string;
  /** RATE_LIMITED only: ISO timestamp when the window resets */
  resetAt?: string;
}

/** HTTP status per error code (design §8 + §11.1 guardrail decision). */
export const ERROR_STATUS: Record<ApiErrorCode, number> = {
  INVALID_REQUEST: 400,
  UNKNOWN_SYMBOL: 404,
  UNTRADEABLE_SYMBOL: 422,
  INSUFFICIENT_HISTORY: 422,
  RATE_LIMITED: 429,
  DATA_UNAVAILABLE: 503,
};
