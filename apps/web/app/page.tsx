'use client';

/**
 * Home = the Scan board (design §6.3): the top gate-passing setups right now,
 * with Hourly / Daily / Weekly tabs (the candle sizes). This is discovery — the
 * "what should I look at?" entry point. The per-symbol Analyze view lives behind
 * the Search button and each row's deep link.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { Timeframe } from '@thresher/engine';
import type { ApiError, ScanResponse } from '../lib/api-types';
import ScanBoard from '../components/ScanBoard';
import Disclaimer from '../components/Disclaimer';
import styles from './page.module.css';

type ErrorState = { code: ApiError['error'] | 'NETWORK'; message: string };

const ERROR_TITLES: Record<ErrorState['code'], string> = {
  INVALID_REQUEST: 'Check the request',
  UNKNOWN_SYMBOL: 'Not found',
  UNTRADEABLE_SYMBOL: 'Not tradeable',
  INSUFFICIENT_HISTORY: 'Not enough history',
  RATE_LIMITED: 'Too many scans',
  DATA_UNAVAILABLE: 'Market data unavailable',
  NETWORK: 'Can’t reach the service',
};

// Candle tabs, labelled by cadence with the trade horizon as the engine value.
const TABS: ReadonlyArray<{ key: Timeframe; label: string }> = [
  { key: 'intraday', label: 'Hourly' },
  { key: 'swing', label: 'Daily' },
  { key: 'position', label: 'Weekly' },
];

export default function ScanPage() {
  const [timeframe, setTimeframe] = useState<Timeframe>('swing');
  const [board, setBoard] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);
  const [loading, setLoading] = useState(false);

  const loadBoard = useCallback(async (tf: Timeframe) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/scan?timeframe=${tf}`, { cache: 'no-store' });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as ApiError | null;
        setBoard(null);
        setError({
          code: body?.error ?? 'NETWORK',
          message: body?.message ?? `Request failed (${res.status})`,
        });
        return;
      }
      setBoard((await res.json()) as ScanResponse);
    } catch {
      setBoard(null);
      setError({ code: 'NETWORK', message: 'Could not reach the scan service.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBoard(timeframe);
  }, [timeframe, loadBoard]);

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div>
          <div className={styles.wordmark}>THRESHER</div>
          <div className={styles.tagline}>
            technical confluence desk — the setups clearing every gate right now
          </div>
        </div>
        <nav className={styles.nav}>
          <Link href="/analyze" className={styles.searchBtn} data-testid="search-button">
            Search a ticker →
          </Link>
          <Link href="/methodology" className="deep-link mono">
            methodology
          </Link>
        </nav>
      </header>

      <div className={styles.scanTabs} role="group" aria-label="candle timeframe">
        {TABS.map((t) => (
          <button
            key={t.key}
            data-testid={`scan-tab-${t.key}`}
            className={`${styles.scanTab} ${timeframe === t.key ? styles.scanTabActive : ''}`}
            aria-pressed={timeframe === t.key}
            onClick={() => setTimeframe(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && (
        <div data-testid="scan-loading" className={styles.loading}>
          Scanning the tape…
        </div>
      )}

      {error && !loading && (
        <div role="alert" data-testid="error-banner" className={styles.error}>
          <div className={styles.errorTitle}>{ERROR_TITLES[error.code]}</div>
          <div>{error.message}</div>
        </div>
      )}

      {board && !loading && !error && <ScanBoard board={board} />}

      <Disclaimer />
    </div>
  );
}
