/**
 * CRYPTO_CONFIG — methodology Part IV. Verifies the tuned crypto profile: valid
 * weights, volume down-weighted, earnings veto off, wider ATR, fractional sizing,
 * a distinct hash, and that the asset-agnostic parts (direction/confidence/gates)
 * are inherited unchanged from the equity config.
 */
import { describe, it, expect } from 'vitest';
import { CRYPTO_CONFIG, DEFAULT_CONFIG, configHash, cryptoConfigHash } from '../src/config';
import type { Timeframe } from '../src/types';

const TIMEFRAMES: readonly Timeframe[] = ['intraday', 'swing', 'position'];

describe('CRYPTO_CONFIG', () => {
  it('weights sum to 1 per timeframe', () => {
    for (const tf of TIMEFRAMES) {
      const w = CRYPTO_CONFIG.weights[tf];
      expect(w.trend + w.momentum + w.volume + w.structure).toBeCloseTo(1, 10);
    }
  });

  it('down-weights volume vs equity (unreliable crypto volume)', () => {
    for (const tf of TIMEFRAMES) {
      expect(CRYPTO_CONFIG.weights[tf].volume).toBeLessThanOrEqual(DEFAULT_CONFIG.weights[tf].volume);
    }
  });

  it('disables the earnings veto (G5) on every timeframe', () => {
    expect(CRYPTO_CONFIG.earningsVetoTradingDays).toEqual({
      intraday: null,
      swing: null,
      position: null,
    });
  });

  it('widens the ATR stop + target vs equity (fatter tails)', () => {
    expect(CRYPTO_CONFIG.stop.bufferAtr).toBeGreaterThan(DEFAULT_CONFIG.stop.bufferAtr);
    expect(CRYPTO_CONFIG.stop.capAtr).toBeGreaterThan(DEFAULT_CONFIG.stop.capAtr);
    expect(CRYPTO_CONFIG.stop.floorAtr).toBeGreaterThan(DEFAULT_CONFIG.stop.floorAtr);
    expect(CRYPTO_CONFIG.target.projectionAtrMult).toBeGreaterThan(
      DEFAULT_CONFIG.target.projectionAtrMult,
    );
  });

  it('uses fractional sizing and carries a distinct config hash', () => {
    expect(CRYPTO_CONFIG.sizing.unitStep).toBeLessThan(1);
    expect(CRYPTO_CONFIG.sizing.unitLabel).toBe('units');
    expect(cryptoConfigHash).not.toBe(configHash);
    expect(cryptoConfigHash).toMatch(/^[0-9a-f]{6}$/);
  });

  it('inherits direction/confidence/gates unchanged from equity', () => {
    expect(CRYPTO_CONFIG.direction).toEqual(DEFAULT_CONFIG.direction);
    expect(CRYPTO_CONFIG.confidence).toEqual(DEFAULT_CONFIG.confidence);
    expect(CRYPTO_CONFIG.gates).toEqual(DEFAULT_CONFIG.gates);
    expect(CRYPTO_CONFIG.indicators).toEqual(DEFAULT_CONFIG.indicators);
    expect(CRYPTO_CONFIG.families).toEqual(DEFAULT_CONFIG.families);
  });
});
