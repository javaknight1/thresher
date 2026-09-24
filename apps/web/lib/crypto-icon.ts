/**
 * Coin logo URL. Crypto icons come from CoinCap's keyless icon set, keyed by the
 * lowercase base symbol (BTC-USD → btc). No API token is required, so coin logos
 * render even where the logo.dev (equity) token isn't configured. A symbol
 * CoinCap doesn't carry 404s, and the Logo component falls back to its Monogram.
 */
export function cryptoIconUrl(symbol: string): string {
  const base = symbol.split('-')[0].toLowerCase();
  return `https://assets.coincap.io/assets/icons/${encodeURIComponent(base)}@2x.png`;
}
