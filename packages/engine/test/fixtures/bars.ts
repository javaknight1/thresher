/**
 * Deterministic synthetic OHLCV for tests (golden files, cross-validation,
 * property tests). Seeded PRNG — same seed, same bars, forever. Never used in
 * production code.
 */
import type { Bar } from '../../src/types';

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Fixed origin so bar timestamps are reproducible. 2024-01-01T00:00:00Z. */
const EPOCH_START = 1704067200000;
const DAY_MS = 86400000;

/**
 * Generate `count` deterministic daily bars for a seed string. Regime drift,
 * volatility, and volume profile all derive from the seed, so different seeds
 * exercise different market shapes (trending, choppy, thin, gappy).
 */
export function genBars(seed: string, count: number): Bar[] {
  const rng = mulberry32(hashStr(seed));
  const basePrice = 8 + rng() * 470;
  let drift = (rng() - 0.42) * 0.0035;
  const vol = 0.008 + rng() * 0.02;
  const regimeFlip = 0.012 + rng() * 0.02;
  const baseVol = 1e5 + rng() * 9e5;

  const bars: Bar[] = [];
  let c = basePrice;
  for (let i = 0; i < count; i++) {
    if (rng() < regimeFlip) drift = (rng() - 0.45) * 0.004;
    const r = drift + gauss(rng) * vol;
    const o = c;
    c = Math.max(0.5, c * (1 + r));
    const wick = Math.abs(gauss(rng)) * vol * c * 0.8;
    const h = Math.max(o, c) + wick;
    const l = Math.max(0.1, Math.min(o, c) - wick);
    const v = baseVol * (0.6 + rng() * 0.8 + Math.abs(r) * 60);
    bars.push({ t: EPOCH_START + i * DAY_MS, o, h, l, c, v });
  }
  return bars;
}
