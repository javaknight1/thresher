/**
 * Provider selection for the API route.
 *
 * `THRESHER_PROVIDER=mock` swaps in the deterministic MockProvider (Playwright,
 * offline dev). Otherwise a module-level YahooProvider singleton is reused
 * across requests. Zero env vars required: the default path is Yahoo.
 */
import type { MarketDataProvider } from '../contracts';
import { MockProvider } from './mock';
import { YahooProvider } from './yahoo';

/** Module-level singleton — constructed lazily so mock runs never touch Yahoo. */
let yahooSingleton: YahooProvider | null = null;

export function getProvider(): MarketDataProvider {
  if (process.env.THRESHER_PROVIDER === 'mock') {
    return new MockProvider();
  }
  yahooSingleton ??= new YahooProvider();
  return yahooSingleton;
}
