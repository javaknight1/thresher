'use client';

/**
 * Company / brokerage / coin logo. Equities & brokerages use logo.dev (ticker or
 * domain endpoint) when a publishable token is configured
 * (NEXT_PUBLIC_LOGO_DEV_TOKEN). Crypto uses CoinCap's keyless icon set, keyed by
 * the base symbol (BTC-USD → btc) — so coin logos work even without the logo.dev
 * token. Anything missing / failing to load falls back to the deterministic
 * Monogram, so it's never broken. Logos render at their natural shape/aspect
 * with no background tile or padding (a round coin logo reads as round).
 */
import { useState } from 'react';
import Monogram from './Monogram';
import { assetClassOf } from '../lib/asset-class';
import { cryptoIconUrl } from '../lib/crypto-icon';
import styles from './Logo.module.css';

const TOKEN = process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN;

export interface LogoProps {
  /** stock ticker (logo.dev /ticker/) or coin symbol like BTC-USD (CoinCap) */
  ticker?: string;
  /** company/brokerage domain, e.g. robinhood.com (uses logo.dev /{domain}) */
  domain?: string;
  /** fallback label for the monogram */
  label: string;
  size?: number;
}

function srcFor(ticker: string | undefined, domain: string | undefined, size: number): string | null {
  // Crypto: CoinCap's icon set is keyed by the lowercase base symbol and needs no
  // token, so coin logos render regardless of the logo.dev config.
  if (ticker && assetClassOf(ticker) === 'crypto') {
    return cryptoIconUrl(ticker);
  }
  if (!TOKEN) return null;
  const q = `token=${TOKEN}&format=png&size=${size * 2}&retina=true`;
  if (ticker) return `https://img.logo.dev/ticker/${encodeURIComponent(ticker)}?${q}`;
  if (domain) return `https://img.logo.dev/${encodeURIComponent(domain)}?${q}`;
  return null;
}

export default function Logo({ ticker, domain, label, size = 24 }: LogoProps) {
  const [failed, setFailed] = useState(false);
  const src = srcFor(ticker, domain, size);
  if (!src || failed) return <Monogram label={label} size={size} />;
  return (
    <span className={styles.tile} style={{ width: size, height: size }}>
      {/* plain img: no next/image remote config, works on workerd */}
      <img
        className={styles.img}
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </span>
  );
}
