'use client';

/**
 * Company / brokerage logo. Uses logo.dev (ticker or domain endpoint) when a
 * publishable token is configured (NEXT_PUBLIC_LOGO_DEV_TOKEN), and falls back
 * to the deterministic Monogram when there's no token or the logo is missing /
 * fails to load — so it's never broken. Logos sit on a white rounded tile so
 * they stay visible on the dark theme.
 */
import { useState } from 'react';
import Monogram from './Monogram';
import styles from './Logo.module.css';

const TOKEN = process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN;

export interface LogoProps {
  /** stock ticker (uses logo.dev /ticker/) */
  ticker?: string;
  /** company/brokerage domain, e.g. robinhood.com (uses logo.dev /{domain}) */
  domain?: string;
  /** fallback label for the monogram */
  label: string;
  size?: number;
}

function srcFor(ticker: string | undefined, domain: string | undefined, size: number): string | null {
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
    <span
      className={styles.tile}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.28) }}
    >
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
