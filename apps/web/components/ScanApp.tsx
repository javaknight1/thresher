'use client';

/**
 * The Scan board (design §6.3) — the app's main page, at /app. The default
 * "Top" tab aggregates across all three candle sizes (Hourly / Daily / Weekly)
 * into one overall shortlist — the "what should I trade this morning?" view —
 * and the three per-candle tabs drill into one size. Filters and sort shape the
 * table client-side; the scan-level counts are unchanged.
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Timeframe } from '@thresher/engine';
import type { ApiError, ScanResponse, ScanRow } from '../lib/api-types';
import { WEB_CONFIG } from '../lib/config';
import { applyView, type DirectionFilter, type SortKey } from '../lib/scan-view';
import { isUsMarketOpen } from '../lib/market-hours';
import ScanBoard from './ScanBoard';
import SiteHeader from './SiteHeader';
import OnboardingGate from './OnboardingGate';
import Footer from './Footer';
import DataAlert from './DataAlert';
import { ScanBoardSkeleton } from './Skeleton';
import { useFollows } from '../lib/follows-client';
import styles from '../app/page.module.css';

type View = 'top' | 'following' | Timeframe;
/** Why the board might be behind (drives the top DataAlert); null = fresh. */
type StaleNotice = 'stale' | 'rate-limited';
/** The aggregate views merge all three candle sizes into one shortlist. */
function isAggregate(v: View): boolean {
  return v === 'top' || v === 'following';
}
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

/** A valid board view = 'top' | 'following' | one of the three timeframes. */
function isView(v: string | null): v is View {
  return v === 'top' || v === 'following' || (TF_VIEWS as readonly string[]).includes(v ?? '');
}

const TABS: ReadonlyArray<{ key: View; label: string }> = [
  { key: 'top', label: 'Top' },
  { key: 'following', label: 'Following' },
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
  { key: 'score', label: 'Score' },
  { key: 'quality', label: 'Quality' },
  { key: 'rr', label: 'R:R' },
  { key: 'confidence', label: 'Agreement' },
];

type BoardFetch = { board: ScanResponse | null; status: number };

async function fetchBoard(tf: Timeframe, force: boolean): Promise<BoardFetch> {
  try {
    const res = await fetch(`/api/v1/scan?timeframe=${tf}${force ? '&refresh=1' : ''}`, {
      cache: 'no-store',
    });
    if (!res.ok) return { board: null, status: res.status };
    return { board: (await res.json()) as ScanResponse, status: 200 };
  } catch {
    return { board: null, status: 0 };
  }
}

/** Outcome of a resilient fetch: the board (if any) + why it might be stale. */
type ResilientBoard = {
  board: ScanResponse | null;
  /** true when a forced refresh failed and we served the cached board instead */
  fellBack: boolean;
  /** true when the (forced) recompute was rate-limited / quota-capped */
  rateLimited: boolean;
};

/**
 * Force a fresh board; if the recompute fails (a cold scan can 5xx/time out
 * under a burst, or hit the rate limit), fall back to the last cached (Upstash)
 * board so the Top view always has all three timeframes. Otherwise a dropped
 * timeframe changes the merge on every refresh — the "different results each
 * reload" bug. Reports whether it fell back / was rate-limited so the caller
 * can flag stale data.
 */
async function fetchBoardResilient(tf: Timeframe, force: boolean): Promise<ResilientBoard> {
  const fresh = await fetchBoard(tf, force);
  const rateLimited = fresh.status === 429;
  if (fresh.board || !force) {
    return { board: fresh.board, fellBack: false, rateLimited };
  }
  const cached = await fetchBoard(tf, false);
  return { board: cached.board, fellBack: cached.board !== null, rateLimited };
}

function mergeTop(boards: ScanResponse[]): ScanResponse {
  const ranked = boards
    .flatMap((b) => b.rows.map((r) => ({ ...r, timeframe: b.timeframe })))
    .sort((a, b) => b.score - a.score);
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

function ScanView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Persist the selected tab in the URL (?tab=) so a browser refresh keeps the
  // view instead of snapping back to Top, and the board is shareable.
  const tabParam = searchParams.get('tab');
  const [view, setView] = useState<View>(isView(tabParam) ? tabParam : 'top');
  const selectView = useCallback(
    (v: View) => {
      setView(v);
      router.replace(v === 'top' ? '/app' : `/app?tab=${v}`, { scroll: false });
    },
    [router],
  );
  const [board, setBoard] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);
  const [staleNotice, setStaleNotice] = useState<StaleNotice | null>(null);
  const [loading, setLoading] = useState(false);
  const [direction, setDirection] = useState<DirectionFilter>('all');
  const [minRR, setMinRR] = useState<number>(0);
  const [sort, setSort] = useState<SortKey>('score');

  const loadBoard = useCallback(async (v: View, force = false) => {
    setLoading(true);
    setError(null);
    setStaleNotice(null);
    // A fresh view load shows the skeleton instead of the previous tab's rows.
    // A forced refresh keeps the current board visible (no blanking flash).
    if (!force) setBoard(null);
    try {
      const views: readonly Timeframe[] = isAggregate(v) ? TF_VIEWS : [v as Timeframe];
      const results = await Promise.all(views.map((tf) => fetchBoardResilient(tf, force)));
      const boards = results.map((r) => r.board).filter((b): b is ScanResponse => b !== null);

      if (boards.length === 0) {
        setBoard(null);
        const rateLimited = results.some((r) => r.rateLimited);
        setError({
          code: rateLimited ? 'RATE_LIMITED' : 'NETWORK',
          message: rateLimited
            ? 'You’ve hit the scan limit — try again shortly.'
            : 'Could not reach the scan service.',
        });
        return;
      }

      setBoard(isAggregate(v) ? mergeTop(boards) : boards[0]);
      // Flag if we couldn't get fresh data but showed something anyway.
      if (results.some((r) => r.rateLimited)) setStaleNotice('rate-limited');
      else if (results.some((r) => r.fellBack)) setStaleNotice('stale');
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

  // The "Following" view narrows the aggregated board to the user's follows.
  const { symbols: followed } = useFollows();

  // Filtered/sorted rows for display (scan-level counts stay as-is).
  const displayed = useMemo<ScanResponse | null>(() => {
    if (!board) return null;
    const followedSet = new Set(followed);
    const rows =
      view === 'following' ? board.rows.filter((r) => followedSet.has(r.symbol)) : board.rows;
    return { ...board, rows: applyView(rows, { direction, minRR, minConfidence: 0, sort }) };
  }, [board, direction, minRR, sort, view, followed]);

  // "market closed" hint applies to Hourly setups (the aggregate views mix them in).
  const showClosedHint =
    (view === 'intraday' || isAggregate(view)) && !isUsMarketOpen(new Date());

  return (
    <>
      <OnboardingGate />
      <SiteHeader />
      <div className={styles.shell}>
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

      {view === 'following' && (
        <div className={styles.topNote}>
          Setups from the symbols you follow, across every candle size. Search a ticker and tap
          Follow to add one.
        </div>
      )}

      {/* Couldn't get a fresh scan, but showed the cached board — flag it up top. */}
      {staleNotice && board && !error && (
        <DataAlert
          variant={staleNotice === 'rate-limited' ? 'rate-limited' : 'stale'}
          message={
            staleNotice === 'rate-limited'
              ? 'You’ve hit the scan limit, so this shows the most recent cached board rather than a fresh scan.'
              : 'A fresh scan wasn’t available, so this shows the most recent cached board.'
          }
        />
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

      {/* Waiting on the scan with nothing cached to show yet → skeleton. A
          forced refresh keeps the existing board visible instead. */}
      {loading && !board && !error && <ScanBoardSkeleton />}

      {error && !loading && (
        <div role="alert" data-testid="error-banner" className={styles.error}>
          <div className={styles.errorTitle}>{ERROR_TITLES[error.code]}</div>
          <div>{error.message}</div>
        </div>
      )}

      {displayed && !error && view === 'following' && displayed.rows.length === 0 && !loading && (
        <div className={styles.loading} data-testid="following-empty">
          {followed.length === 0
            ? 'You’re not following anything yet. Search a ticker and tap ☆ Follow to build your board.'
            : 'None of your followed symbols have a qualifying setup right now.'}
        </div>
      )}

      {displayed && !error && !(view === 'following' && displayed.rows.length === 0) && (
        <ScanBoard board={displayed} showTimeframe={isAggregate(view)} />
      )}

        <Footer />
      </div>
    </>
  );
}

// useSearchParams (the ?tab= persistence) needs a Suspense boundary above it.
export default function ScanApp() {
  return (
    <Suspense>
      <ScanView />
    </Suspense>
  );
}
