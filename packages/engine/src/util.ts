/** Shared pure helpers. No financial logic lives here. */

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/** Family scores are clamped to [-1, +1] (design §4.1). */
export function clampScore(x: number): number {
  return clamp(x, -1, 1);
}

/** Price levels are denominated in cents (methodology II.9 arithmetic). */
export function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

export function mean(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  let sum = 0;
  for (const x of xs) sum += x;
  return sum / xs.length;
}

/** Format a price for reason strings, e.g. "$84.60". */
export function fmtPrice(x: number): string {
  return `$${x.toFixed(2)}`;
}
