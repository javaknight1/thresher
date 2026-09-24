import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG, CRYPTO_CONFIG } from '@thresher/engine';
import { assetClassOf, engineConfigFor } from '../lib/asset-class';

describe('assetClassOf', () => {
  it('classifies Yahoo coin pairs as crypto', () => {
    expect(assetClassOf('BTC-USD')).toBe('crypto');
    expect(assetClassOf('eth-usd')).toBe('crypto'); // case-insensitive
    expect(assetClassOf('SOL-USDT')).toBe('crypto');
  });

  it('classifies equities/ETFs as equity', () => {
    expect(assetClassOf('AAPL')).toBe('equity');
    expect(assetClassOf('BRK.B')).toBe('equity');
    expect(assetClassOf('COIN')).toBe('equity'); // Coinbase the stock, not a coin
  });

  it('picks the matching engine config', () => {
    expect(engineConfigFor('crypto')).toBe(CRYPTO_CONFIG);
    expect(engineConfigFor('equity')).toBe(DEFAULT_CONFIG);
  });
});
