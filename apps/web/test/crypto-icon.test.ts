import { describe, expect, it } from 'vitest';
import { cryptoIconUrl } from '../lib/crypto-icon';

describe('cryptoIconUrl', () => {
  it('keys CoinCap by the lowercase base symbol', () => {
    expect(cryptoIconUrl('BTC-USD')).toBe('https://assets.coincap.io/assets/icons/btc@2x.png');
    expect(cryptoIconUrl('ETH-USD')).toBe('https://assets.coincap.io/assets/icons/eth@2x.png');
    expect(cryptoIconUrl('RENDER-USD')).toBe(
      'https://assets.coincap.io/assets/icons/render@2x.png',
    );
  });

  it('handles a -USDT suffix and already-bare symbols', () => {
    expect(cryptoIconUrl('SOL-USDT')).toBe('https://assets.coincap.io/assets/icons/sol@2x.png');
    expect(cryptoIconUrl('DOGE')).toBe('https://assets.coincap.io/assets/icons/doge@2x.png');
  });
});
