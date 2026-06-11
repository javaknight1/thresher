/**
 * FROZEN: the /api/v1/analyze response contract — design doc §8, field-for-field.
 * The UI consumes exactly these shapes.
 */
import type { AnalysisResult, Bar, Timeframe } from '@thresher/engine';

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

export type ApiErrorCode =
  | 'INVALID_REQUEST'
  | 'UNKNOWN_SYMBOL'
  | 'UNTRADEABLE_SYMBOL'
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
  RATE_LIMITED: 429,
  DATA_UNAVAILABLE: 503,
};
