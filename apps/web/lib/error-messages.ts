/**
 * Shared client-side error model for the data views (Analyze + Scan). A single
 * source for the error shape and the plain-English headlines, so the two views
 * can't drift apart (they used to: RATE_LIMITED read differently in each).
 */
import type { ApiErrorCode } from './api-types';

/** A UI error is an API error code, or a client-side network failure. */
export type UiErrorCode = ApiErrorCode | 'NETWORK';

export interface ErrorState {
  code: UiErrorCode;
  message: string;
}

/** Plain-English headline per error code — raw codes are jargon to a trader. */
export const ERROR_TITLES: Record<UiErrorCode, string> = {
  INVALID_REQUEST: 'Check the ticker',
  UNKNOWN_SYMBOL: 'Ticker not found',
  UNTRADEABLE_SYMBOL: 'Too illiquid to analyze',
  INSUFFICIENT_HISTORY: 'Too new for a full technical read',
  RATE_LIMITED: 'Too many requests',
  DATA_UNAVAILABLE: 'Market data unavailable',
  NETWORK: 'Can’t reach the service',
};
