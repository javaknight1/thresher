import { describe, expect, it } from 'vitest';
import { compositeScore, resolveDirection } from '../src/composite';
import { DEFAULT_CONFIG } from '../src/config';

const cfg = DEFAULT_CONFIG;

describe('compositeScore', () => {
  it('returns 0 for an empty family list', () => {
    expect(compositeScore([])).toBe(0);
  });

  it('computes the weighted sum Σ weight × score', () => {
    const families = [
      { score: 1, weight: 0.5 },
      { score: -1, weight: 0.25 },
      { score: 0.4, weight: 0.25 },
    ];
    expect(compositeScore(families)).toBeCloseTo(0.5 - 0.25 + 0.1, 12);
  });

  it('II.9 worked example: swing weights × family scores = +0.745', () => {
    const families = [
      { score: 0.8, weight: 0.35 },
      { score: 0.9, weight: 0.3 },
      { score: 0.5, weight: 0.15 },
      { score: 0.6, weight: 0.2 },
    ];
    expect(compositeScore(families)).toBeCloseTo(0.745, 10);
  });

  it('II.9 counterfactual: composite = +0.25', () => {
    const families = [
      { score: 0.5, weight: 0.35 },
      { score: -0.4, weight: 0.3 },
      { score: 0.5, weight: 0.15 },
      { score: 0.6, weight: 0.2 },
    ];
    expect(compositeScore(families)).toBeCloseTo(0.25, 10);
  });

  it('uses the configured swing weights for the worked example', () => {
    const w = cfg.weights.swing;
    expect(
      compositeScore([
        { score: 0.8, weight: w.trend },
        { score: 0.9, weight: w.momentum },
        { score: 0.5, weight: w.volume },
        { score: 0.6, weight: w.structure },
      ]),
    ).toBeCloseTo(0.745, 10);
  });
});

describe('resolveDirection', () => {
  it('returns long exactly at +0.22 (inclusive boundary)', () => {
    expect(resolveDirection(0.22, cfg)).toBe('long');
  });

  it('returns none at 0.2199 (just below threshold)', () => {
    expect(resolveDirection(0.2199, cfg)).toBe('none');
  });

  it('returns short exactly at -0.22 (inclusive boundary)', () => {
    expect(resolveDirection(-0.22, cfg)).toBe('short');
  });

  it('returns none at -0.2199 and at 0', () => {
    expect(resolveDirection(-0.2199, cfg)).toBe('none');
    expect(resolveDirection(0, cfg)).toBe('none');
  });

  it('returns long for the worked example composite and counterfactual', () => {
    expect(resolveDirection(0.745, cfg)).toBe('long');
    expect(resolveDirection(0.25, cfg)).toBe('long');
  });
});
