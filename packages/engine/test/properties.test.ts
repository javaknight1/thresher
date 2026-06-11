/**
 * Property tests over deterministic pseudo-random market shapes (TODO.md M0):
 * - no NaN for any valid bar series
 * - long ⇒ stop < entry < target (mirror short)
 * - emitted ⇒ all gates pass · refusal ⇒ the named gate actually fails
 */
import { describe, expect, it } from 'vitest';
import type { Timeframe } from '../src/types';
import { DEFAULT_CONFIG } from '../src/config';
import { analyze } from '../src/analyze';
import { genBars } from './fixtures/bars';

const TIMEFRAMES: Timeframe[] = ['intraday', 'swing', 'position'];
const SEEDS = Array.from({ length: 40 }, (_, i) => `prop-${i}`);

function findNaN(value: unknown, path: string): string | null {
  if (typeof value === 'number') {
    return Number.isNaN(value) || !Number.isFinite(value) ? path : null;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findNaN(value[i], `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      const hit = findNaN(v, `${path}.${k}`);
      if (hit) return hit;
    }
  }
  return null;
}

describe('engine invariants over 120 random market shapes', () => {
  for (const timeframe of TIMEFRAMES) {
    for (const seed of SEEDS) {
      it(`${timeframe} · ${seed}`, () => {
        const bars = genBars(`${timeframe}:${seed}`, 300);
        const result = analyze(bars, DEFAULT_CONFIG, { symbol: 'PROP', timeframe });

        // No NaN/Infinity anywhere in the result tree.
        expect(findNaN(result, 'result')).toBeNull();

        // Exactly four families, clamped scores, every component explained.
        expect(result.families).toHaveLength(4);
        for (const f of result.families) {
          expect(Math.abs(f.score)).toBeLessThanOrEqual(1);
          expect(f.details.length).toBeGreaterThan(0);
          for (const d of f.details) expect(d.text.length).toBeGreaterThan(0);
        }

        // Confidence respects its clamp.
        expect(result.confidence.score).toBeGreaterThanOrEqual(5);
        expect(result.confidence.score).toBeLessThanOrEqual(95);

        // Plan XOR refusal — a trade is only emitted when all gates pass.
        if (result.refusal === null) {
          expect(result.plan).not.toBeNull();
          expect(result.gates).toHaveLength(5);
          expect(result.gates.every((g) => g.pass)).toBe(true);
        } else {
          expect(result.plan).toBeNull();
          const failed = result.gates[result.gates.length - 1];
          expect(failed.gate).toBe(result.refusal.gate);
          expect(failed.pass).toBe(false);
          expect(result.gates.slice(0, -1).every((g) => g.pass)).toBe(true);
          expect(result.refusal.reason.length).toBeGreaterThan(0);
        }

        if (result.plan) {
          const { entry, stop, target, rr } = result.plan;
          if (result.direction === 'long') {
            expect(stop).toBeLessThan(entry);
            expect(target).toBeGreaterThan(entry);
          } else {
            expect(result.direction).toBe('short');
            expect(stop).toBeGreaterThan(entry);
            expect(target).toBeLessThan(entry);
          }
          expect(rr).toBeGreaterThanOrEqual(DEFAULT_CONFIG.gates.minRR);
          expect(result.confidence.score).toBeGreaterThanOrEqual(DEFAULT_CONFIG.gates.minConfidence);
          expect(result.plan.sizing.example.shares).toBeGreaterThanOrEqual(0);
        }

        // Direction none always refuses at G1.
        if (result.direction === 'none') {
          expect(result.refusal?.gate).toBe('G1');
          expect(result.confidence.penalties).toHaveLength(0);
        }

        expect(result.story.length).toBeGreaterThan(0);
      });
    }
  }
});
