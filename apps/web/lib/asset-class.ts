/**
 * Asset classification (a WEB concern — the pure engine never maps symbols to a
 * class). A symbol is crypto if it's in the curated coin registry or matches
 * Yahoo's `BASE-USD` / `BASE-USDT` pair form; otherwise equity. The web layer
 * uses this to pick which versioned engine config to pass into `analyze()`.
 */
import { DEFAULT_CONFIG, CRYPTO_CONFIG, type EngineConfig } from '@thresher/engine';
import { WEB_CONFIG } from './config';

export type AssetClass = 'equity' | 'crypto';

const CRYPTO_SET = new Set<string>(WEB_CONFIG.crypto.curatedCoins.map((s) => s.toUpperCase()));

/** Classify a symbol. `BTC-USD`/`ETH-USDT` → crypto; `AAPL` → equity. */
export function assetClassOf(symbol: string): AssetClass {
  const s = symbol.toUpperCase();
  if (CRYPTO_SET.has(s)) return 'crypto';
  if (/-USDT?$/.test(s)) return 'crypto';
  return 'equity';
}

/** The versioned engine config for an asset class (crypto = tuned Part IV profile). */
export function engineConfigFor(assetClass: AssetClass): EngineConfig {
  return assetClass === 'crypto' ? CRYPTO_CONFIG : DEFAULT_CONFIG;
}
