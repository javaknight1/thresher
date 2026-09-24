/**
 * buildSizing — methodology II.8 (equity, whole shares) + IV (crypto, fractional).
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, CRYPTO_CONFIG } from '../../src/config';
import { buildSizing } from '../../src/plan/sizing';

const cfg = DEFAULT_CONFIG;

describe('buildSizing (equity, whole shares)', () => {
  it('worked example (II.9): risk 3.64 → floor($250 / 3.64) = 68 units', () => {
    const res = buildSizing(3.64, cfg);
    expect(res.example.units).toBe(68);
    expect(res.example.account).toBe(25000);
    expect(res.riskFraction).toBe(0.01);
    expect(res.unitLabel).toBe('shares');
  });

  it('floors, never rounds up: risk 3.00 → 83 units (not 83.33)', () => {
    expect(buildSizing(3, cfg).example.units).toBe(83);
  });

  it('wider stop means fewer units for the same dollar risk', () => {
    expect(buildSizing(5, cfg).example.units).toBeLessThan(buildSizing(2, cfg).example.units);
  });

  it('guards non-positive risk with 0 units (no NaN/Infinity)', () => {
    expect(buildSizing(0, cfg).example.units).toBe(0);
    expect(buildSizing(-1, cfg).example.units).toBe(0);
  });
});

describe('buildSizing (crypto, fractional units)', () => {
  it('sizes a high-priced coin fractionally instead of flooring to 0', () => {
    // $250 risk at ~$4,200 risk-per-unit would be 0 whole units — must be fractional.
    const res = buildSizing(4200, CRYPTO_CONFIG);
    expect(res.unitLabel).toBe('units');
    expect(res.example.units).toBeGreaterThan(0);
    expect(res.example.units).toBeLessThan(1);
    // Quantized to the 1e-6 step.
    expect(res.example.units).toBeCloseTo(Math.floor((25000 * 0.01) / 4200 / 1e-6) * 1e-6, 9);
  });

  it('still never rounds up (quantizes down to the unit step)', () => {
    const res = buildSizing(7, CRYPTO_CONFIG);
    expect(res.example.units).toBeLessThanOrEqual((25000 * 0.01) / 7);
  });
});
