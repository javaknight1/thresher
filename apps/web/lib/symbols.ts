/**
 * Ticker validation + normalization, defined once and shared across the API
 * routes and the scan/follow layers — so "what a valid ticker is" lives in one
 * place instead of a regex copy-pasted into every route.
 */

/** Uppercase letters, dots, dashes; 1–10 chars, letter-led. */
export const SYMBOL_PATTERN = /^[A-Z][A-Z.-]{0,9}$/;

/** Canonical stored form of a raw ticker (trimmed, upper-cased). */
export function normalizeSymbol(raw: string): string {
  return raw.trim().toUpperCase();
}

/** True when an already-normalized symbol is syntactically a valid ticker. */
export function isValidSymbol(symbol: string): boolean {
  return SYMBOL_PATTERN.test(symbol);
}
