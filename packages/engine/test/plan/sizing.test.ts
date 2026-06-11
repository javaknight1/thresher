/**
 * buildSizing — methodology II.8 / design §5.6.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/config';
import { buildSizing } from '../../src/plan/sizing';

const cfg = DEFAULT_CONFIG;

describe('buildSizing', () => {
  it('worked example (II.9): risk 3.64 → floor($250 / 3.64) = 68 shares', () => {
    const res = buildSizing(3.64, cfg);
    expect(res.example.shares).toBe(68);
    expect(res.example.account).toBe(25000);
    expect(res.riskFraction).toBe(0.01);
  });

  it('floors, never rounds up: risk 3.00 → 83 shares (not 83.33)', () => {
    expect(buildSizing(3, cfg).example.shares).toBe(83);
  });

  it('wider stop means fewer shares for the same dollar risk', () => {
    expect(buildSizing(5, cfg).example.shares).toBeLessThan(buildSizing(2, cfg).example.shares);
  });

  it('guards non-positive risk with 0 shares (no NaN/Infinity)', () => {
    expect(buildSizing(0, cfg).example.shares).toBe(0);
    expect(buildSizing(-1, cfg).example.shares).toBe(0);
  });
});
