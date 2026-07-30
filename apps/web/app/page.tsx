'use client';

/**
 * Home = the Scan board (design §6.3): the top gate-passing setups right now.
 * The default "Top" tab aggregates across all three candle sizes (Hourly /
 * Daily / Weekly) into one overall shortlist — the "what should I trade this
 * morning?" view — and the three per-candle tabs drill into one size. Filters
 * and sort shape the table client-side; the scan-level counts are unchanged.
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Timeframe } from '@thresher/engine';
import type { ApiError, ScanResponse, ScanRow } from '../lib/api-types';
import { WEB_CONFIG } from '../lib/config';
import { applyView, type DirectionFilter, type SortKey } from '../lib/scan-view';
import { isUsMarketOpen } from '../lib/market-hours';
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

/** A valid board view = 'top' or one of the three timeframes. */
function isView(v: string | null): v is View {
  return v === 'top' || (TF_VIEWS as readonly string[]).includes(v ?? '');
}

const TABS: ReadonlyArray<{ key: View; label: string }> = [
  { key: 'top', label: 'Top' },
  { key: 'intraday', label: 'Hourly' },
  { key: 'swing', label: 'Daily' },
  { key: 'position', label: 'Weekly' },
];

const DIRECTION_FILTERS: ReadonlyArray<{ key: DirectionFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'long', label: 'Longs' },
  { key: 'short', label: 'Shorts' },
];

const RR_FLOORS = [0, 1.5, 2, 3] as const;
const SORTS: ReadonlyArray<{ key: SortKey; label: string }> = [
  { key: 'quality', label: 'Quality' },
  { key: 'rr', label: 'R:R' },
  { key: 'confidence', label: 'Agreement' },
];

async function fetchBoard(tf: Timeframe, force: boolean): Promise<ScanResponse | null> {
  try {
    const res = await fetch(`/api/v1/scan?timeframe=${tf}${force ? '&refresh=1' : ''}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as ScanResponse;
  } catch {
    return null;
  }
}

function mergeTop(boards: ScanResponse[]): ScanResponse {
  const ranked = boards
    .flatMap((b) => b.rows.map((r) => ({ ...r, timeframe: b.timeframe })))
    .sort((a, b) => b.qualityRank - a.qualityRank);
  const bestBySymbol = new Map<string, ScanRow>();
  for (const row of ranked) {
    if (!bestBySymbol.has(row.symbol)) bestBySymbol.set(row.symbol, row);
  }
  const rows: ScanRow[] = [...bestBySymbol.values()].slice(0, WEB_CONFIG.scan.topN);
  return {
    timeframe: 'swing',
    asOf: boards.reduce((latest, b) => (b.asOf > latest ? b.asOf : latest), boards[0].asOf),
    universeSize: boards.reduce((s, b) => s + b.universeSize, 0),
    emitted: boards.reduce((s, b) => s + b.emitted, 0),
    refused: boards.reduce((s, b) => s + b.refused, 0),
    skipped: boards.reduce((s, b) => s + b.skipped, 0),
    rows,
  };
}

function ScanApp() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Persist the selected tab in the URL (?tab=) so a browser refresh keeps the
  // view instead of snapping back to Top, and the board is shareable.
  const tabParam = searchParams.get('tab');
  const [view, setView] = useState<View>(isView(tabParam) ? tabParam : 'top');
  const selectView = useCallback(
    (v: View) => {
      setView(v);
      router.replace(v === 'top' ? '/' : `/?tab=${v}`, { scroll: false });
    },
    [router],
  );
  const [board, setBoard] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);
  const [loading, setLoading] = useState(false);
  const [direction, setDirection] = useState<DirectionFilter>('all');
  const [minRR, setMinRR] = useState<number>(0);
  const [sort, setSort] = useState<SortKey>('quality');

  const loadBoard = useCallback(async (v: View, force = false) => {
    setLoading(true);
    setError(null);
    try {
      if (v === 'top') {
        const boards = (await Promise.all(TF_VIEWS.map((tf) => fetchBoard(tf, force)))).filter(
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
      const res = await fetch(`/api/v1/scan?timeframe=${v}${force ? '&refresh=1' : ''}`, {
        cache: 'no-store',
      });
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

  // Filtered/sorted rows for display (scan-level counts stay as-is).
  const displayed = useMemo<ScanResponse | null>(() => {
    if (!board) return null;
    return { ...board, rows: applyView(board.rows, { direction, minRR, minConfidence: 0, sort }) };
  }, [board, direction, minRR, sort]);

  // "market closed" hint applies to Hourly setups (and the Top view mixes them in).
  const showClosedHint = (view === 'intraday' || view === 'top') && !isUsMarketOpen(new Date());

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
            onClick={() => selectView(t.key)}
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

      {/* Filter / sort bar */}
      <div className={styles.filterBar}>
        <div className={styles.filterGroup} role="group" aria-label="direction filter">
          {DIRECTION_FILTERS.map((d) => (
            <button
              key={d.key}
              data-testid={`filter-${d.key}`}
              className={`${styles.filterPill} ${direction === d.key ? styles.filterPillActive : ''}`}
              aria-pressed={direction === d.key}
              onClick={() => setDirection(d.key)}
            >
              {d.label}
            </button>
          ))}
        </div>

        <label className={styles.filterLabel}>
          min R:R
          <select
            className={styles.select}
            data-testid="filter-minrr"
            value={minRR}
            onChange={(e) => setMinRR(Number(e.target.value))}
          >
            {RR_FLOORS.map((v) => (
              <option key={v} value={v}>
                {v === 0 ? 'Any' : `≥ ${v.toFixed(1)}`}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.filterLabel}>
          sort
          <select
            className={styles.select}
            data-testid="filter-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <button
          className={styles.refreshBtn}
          data-testid="scan-refresh"
          onClick={() => void loadBoard(view, true)}
          disabled={loading}
          title="Re-scan now (bypasses the cached board)"
        >
          ↻ Refresh
        </button>
      </div>

      {showClosedHint && (
        <div className={styles.marketNote} data-testid="market-closed">
          US market closed — Hourly setups reflect the last session.
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

      {displayed && !loading && !error && (
        <ScanBoard board={displayed} showTimeframe={view === 'top'} />
      )}

      <Disclaimer />
    </div>
  );
}

// useSearchParams (the ?tab= persistence) needs a Suspense boundary above it.
export default function ScanPage() {
  return (
    <Suspense>
      <ScanApp />
    </Suspense>
  );
}
