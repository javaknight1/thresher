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
import type { ScanResponse } from '../lib/api-types';
import { ERROR_TITLES, type ErrorState } from '../lib/error-messages';
import { TF_VIEWS, fetchModeBoard, mergeTop, type BoardMode } from '../lib/board-client';
import { applyView, type DirectionFilter, type SortKey } from '../lib/scan-view';
import { isUsMarketOpen } from '../lib/market-hours';
import ScanBoard from './ScanBoard';
import SiteHeader from './SiteHeader';
import OnboardingGate from './OnboardingGate';
import Footer from './Footer';
import DataAlert from './DataAlert';
import ShareButton from './ShareButton';
import PageHero from './PageHero';
import SymbolSearch from './SymbolSearch';
import { ScanBoardSkeleton } from './Skeleton';
import { useFollows } from '../lib/follows-client';
import { usePrefs } from '../lib/prefs';
import styles from '../app/page.module.css';

type View = 'top' | 'following' | Timeframe;
/** Why the board might be behind (drives the top DataAlert); null = fresh. */
type StaleNotice = 'stale' | 'rate-limited';
/** The aggregate views merge all three candle sizes into one shortlist. */
function isAggregate(v: View): boolean {
  return v === 'top' || v === 'following';
}

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

function isDirection(v: string | null): v is DirectionFilter {
  return v === 'all' || v === 'long' || v === 'short';
}
function isSort(v: string | null): v is SortKey {
  return v === 'score' || v === 'quality' || v === 'rr' || v === 'confidence';
}

/** Build a shareable/reload-stable board URL; defaults are omitted for clean URLs. */
function boardUrl(
  scope: BoardMode,
  view: View,
  direction: DirectionFilter,
  minRR: number,
  sort: SortKey,
): string {
  const base = scope === 'crypto' ? '/crypto' : scope === 'equity' ? '/stocks' : '/leaderboard';
  const p = new URLSearchParams();
  if (view !== 'top') p.set('tab', view);
  if (direction !== 'all') p.set('dir', direction);
  if (minRR > 0) p.set('minrr', String(minRR));
  if (sort !== 'score') p.set('sort', sort);
  const qs = p.toString();
  return qs ? `${base}?${qs}` : base;
}

const HERO: Record<BoardMode, { kicker: string; title: string; sub: string }> = {
  all: {
    kicker: 'leaderboard',
    title: 'Top setups',
    sub: 'The best defined-risk setups across stocks and crypto, ranked together by Setup Score. Filter by candle size, or narrow to the symbols you follow.',
  },
  equity: {
    kicker: 'stocks',
    title: 'Top stocks',
    sub: 'The best defined-risk stock setups the engine sees right now, ranked by Setup Score. Filter by candle size, or narrow to the symbols you follow.',
  },
  crypto: {
    kicker: 'crypto',
    title: 'Top coins',
    sub: 'The best defined-risk crypto setups the engine sees right now, ranked by Setup Score — curated coins plus the ones you follow.',
  },
};

function ScanView({ scope }: { scope: BoardMode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // View + filters are all URL params (?tab=&dir=&minrr=&sort=) so a board view
  // survives reload and is shareable.
  const [view, setView] = useState<View>(() => {
    const t = searchParams.get('tab');
    return isView(t) ? t : 'top';
  });
  const [board, setBoard] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);
  const [staleNotice, setStaleNotice] = useState<StaleNotice | null>(null);
  const [loading, setLoading] = useState(false);
  const [direction, setDirection] = useState<DirectionFilter>(() => {
    const d = searchParams.get('dir');
    return isDirection(d) ? d : 'all';
  });
  const [minRR, setMinRR] = useState<number>(() => {
    const m = Number(searchParams.get('minrr'));
    return (RR_FLOORS as readonly number[]).includes(m) ? m : 0;
  });
  const [sort, setSort] = useState<SortKey>(() => {
    const s = searchParams.get('sort');
    return isSort(s) ? s : 'score';
  });

  const selectView = useCallback((v: View) => setView(v), []);

  // Board defaults from prefs: only when the URL pins NOTHING (a shared link is
  // authoritative). `ready` gates the first board fetch so applying prefs never
  // triggers a wasted second scan.
  const { prefs, loaded: prefsLoaded } = usePrefs();
  const [ready, setReady] = useState(false);
  const anyBoardParam = ['tab', 'dir', 'minrr', 'sort'].some(
    (k) => searchParams.get(k) !== null,
  );
  useEffect(() => {
    if (ready) return;
    if (anyBoardParam) {
      setReady(true);
      return;
    }
    if (!prefsLoaded) return;
    if (isView(prefs.boardTab)) setView(prefs.boardTab);
    if (isDirection(prefs.boardDirection)) setDirection(prefs.boardDirection);
    if ((RR_FLOORS as readonly number[]).includes(prefs.boardMinRR)) setMinRR(prefs.boardMinRR);
    if (isSort(prefs.boardSort)) setSort(prefs.boardSort);
    setReady(true);
  }, [ready, anyBoardParam, prefsLoaded, prefs]);

  // Reflect view + filters in the URL (shareable, reload-stable).
  useEffect(() => {
    if (!ready) return;
    router.replace(boardUrl(scope, view, direction, minRR, sort), { scroll: false });
  }, [ready, scope, view, direction, minRR, sort, router]);

  const loadBoard = useCallback(async (v: View, force = false) => {
    setLoading(true);
    setError(null);
    setStaleNotice(null);
    // A fresh view load shows the skeleton instead of the previous tab's rows.
    // A forced refresh keeps the current board visible (no blanking flash).
    if (!force) setBoard(null);
    try {
      const views: readonly Timeframe[] = isAggregate(v) ? TF_VIEWS : [v as Timeframe];
      const results = await Promise.all(views.map((tf) => fetchModeBoard(tf, force, scope)));
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
  }, [scope]);

  useEffect(() => {
    if (!ready) return;
    void loadBoard(view);
  }, [ready, view, loadBoard]);

  // The "Following" view narrows the aggregated board to the user's follows.
  // The Leaderboard ('all') unions both namespaces; a pinned scope uses its own.
  const { symbols: equityFollows } = useFollows('equity');
  const { symbols: cryptoFollows } = useFollows('crypto');
  const followed = useMemo(
    () =>
      scope === 'crypto'
        ? cryptoFollows
        : scope === 'equity'
          ? equityFollows
          : [...equityFollows, ...cryptoFollows],
    [scope, equityFollows, cryptoFollows],
  );

  // Filtered/sorted rows for display (scan-level counts stay as-is).
  const displayed = useMemo<ScanResponse | null>(() => {
    if (!board) return null;
    const followedSet = new Set(followed);
    const rows =
      view === 'following' ? board.rows.filter((r) => followedSet.has(r.symbol)) : board.rows;
    return { ...board, rows: applyView(rows, { direction, minRR, minConfidence: 0, sort }) };
  }, [board, direction, minRR, sort, view, followed]);

  // "market closed" hint applies to Hourly equity setups only — crypto trades 24/7.
  const showClosedHint =
    scope !== 'crypto' &&
    (view === 'intraday' || isAggregate(view)) &&
    !isUsMarketOpen(new Date());

  return (
    <>
      <OnboardingGate />
      <SiteHeader />
      <div className={styles.shell}>
        <PageHero kicker={HERO[scope].kicker} title={HERO[scope].title}>
          {HERO[scope].sub}
        </PageHero>

        {scope === 'crypto' && (
          <div className={styles.boardSearch} data-testid="crypto-board-search">
            <SymbolSearch
              testId="crypto-board-search"
              assetClass="crypto"
              placeholder="Search any coin to analyze (e.g. BTC-USD, Solana)…"
              onSelect={(m) => router.push(`/analyze?symbol=${encodeURIComponent(m.symbol)}`)}
            />
          </div>
        )}

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
        <ShareButton label="Share view" />
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

        <Footer assetClass={scope === 'crypto' ? 'crypto' : 'equity'} />
      </div>
    </>
  );
}

// useSearchParams (the ?tab= persistence) needs a Suspense boundary above it.
export default function ScanApp({ scope = 'all' }: { scope?: BoardMode } = {}) {
  return (
    <Suspense>
      <ScanView scope={scope} />
    </Suspense>
  );
}
