'use client';

/**
 * Home = the Scan board (design §6.3): the top gate-passing setups right now.
 * The default "Top" tab aggregates across all three candle sizes (Hourly /
 * Daily / Weekly) into one overall shortlist — the "what should I trade this
 * morning?" view — and the three per-candle tabs drill into one size. This is
 * discovery; the per-symbol Analyze view lives behind the Search button and
 * each row's deep link.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { Timeframe } from '@thresher/engine';
import type { ApiError, ScanResponse, ScanRow } from '../lib/api-types';
import { WEB_CONFIG } from '../lib/config';
import ScanBoard from '../components/ScanBoard';
import Disclaimer from '../components/Disclaimer';
import styles from './page.module.css';

type View = 'top' | Timeframe;
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

const TF_VIEWS: readonly Timeframe[] = ['intraday', 'swing', 'position'];

// Top first (default), then the per-candle drill-downs.
const TABS: ReadonlyArray<{ key: View; label: string }> = [
  { key: 'top', label: 'Top' },
  { key: 'intraday', label: 'Hourly' },
  { key: 'swing', label: 'Daily' },
  { key: 'position', label: 'Weekly' },
];

/** One timeframe board; null on any failure (the Top view tolerates partials). */
async function fetchBoard(tf: Timeframe): Promise<ScanResponse | null> {
  try {
    const res = await fetch(`/api/v1/scan?timeframe=${tf}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as ScanResponse;
  } catch {
    return null;
  }
}

/** Merge per-timeframe boards into one overall top-N, each row tagged with its timeframe. */
function mergeTop(boards: ScanResponse[]): ScanResponse {
  const ranked = boards
    .flatMap((b) => b.rows.map((r) => ({ ...r, timeframe: b.timeframe })))
    .sort((a, b) => b.qualityRank - a.qualityRank);
  // A symbol can qualify on more than one candle size — keep only its best one
  // so the shortlist has no duplicate tickers.
  const bestBySymbol = new Map<string, ScanRow>();
  for (const row of ranked) {
    if (!bestBySymbol.has(row.symbol)) bestBySymbol.set(row.symbol, row);
  }
  const rows: ScanRow[] = [...bestBySymbol.values()].slice(0, WEB_CONFIG.scan.topN);
  return {
    timeframe: 'swing', // nominal; the Top view shows a per-row candle badge instead
    asOf: boards.reduce((latest, b) => (b.asOf > latest ? b.asOf : latest), boards[0].asOf),
    universeSize: boards.reduce((s, b) => s + b.universeSize, 0),
    emitted: boards.reduce((s, b) => s + b.emitted, 0),
    refused: boards.reduce((s, b) => s + b.refused, 0),
    skipped: boards.reduce((s, b) => s + b.skipped, 0),
    rows,
  };
}

export default function ScanPage() {
  const [view, setView] = useState<View>('top');
  const [board, setBoard] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);
  const [loading, setLoading] = useState(false);

  const loadBoard = useCallback(async (v: View) => {
    setLoading(true);
    setError(null);
    try {
      if (v === 'top') {
        const boards = (await Promise.all(TF_VIEWS.map(fetchBoard))).filter(
          (b): b is ScanResponse => b !== null,
        );
        if (boards.length === 0) {
          setBoard(null);
          setError({ code: 'NETWORK', message: 'Could not reach the scan service.' });
          return;
        }
        setBoard(mergeTop(boards));
        return;
      }
      const res = await fetch(`/api/v1/scan?timeframe=${v}`, { cache: 'no-store' });
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
    void loadBoard(view);
  }, [view, loadBoard]);

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

      <div className={styles.scanTabs} role="group" aria-label="board view">
        {TABS.map((t) => (
          <button
            key={t.key}
            data-testid={`scan-tab-${t.key}`}
            className={`${styles.scanTab} ${view === t.key ? styles.scanTabActive : ''}`}
            aria-pressed={view === t.key}
            onClick={() => setView(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {view === 'top' && (
        <div className={styles.topNote}>
          The best setups across all three candle sizes, ranked together — your morning shortlist.
        </div>
      )}

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

      {board && !loading && !error && <ScanBoard board={board} showTimeframe={view === 'top'} />}

      <Disclaimer />
    </div>
  );
}
