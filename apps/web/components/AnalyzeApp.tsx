'use client';

/**
 * The Analyze view (design §6.2) — the per-symbol product: Controls → trade
 * card + ladder → chart → story → family grid → disclaimer. NO TRADE is a
 * first-class state, not an error. Reached via the Search button or a Scan-row
 * click; deep-linkable with ?symbol=&timeframe= so both entry points work.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Timeframe } from '@thresher/engine';
import type {
  AnalyzeResponse,
  ApiError,
  InsufficientHistoryResponse,
  ProfileResponse,
} from '../lib/api-types';
import { WEB_CONFIG } from '../lib/config';
import { usePrefs } from '../lib/prefs';
import { ERROR_TITLES, type ErrorState } from '../lib/error-messages';
import Controls from './Controls';
import TradeCard from './TradeCard';
import TradeLadder from './TradeLadder';
import TradeStory from './TradeStory';
import FamilyGrid from './FamilyGrid';
import CompanyPanel from './CompanyPanel';
import TooNew from './TooNew';
import SiteHeader from './SiteHeader';
import Footer from './Footer';
import DataAlert from './DataAlert';
import AsOfControl from './AsOfControl';
import FollowButton from './FollowButton';
import ShareButton from './ShareButton';
import PositionSizer from './PositionSizer';
import PageHero from './PageHero';
import { AnalyzeSkeleton, ProfileSkeleton } from './Skeleton';
import styles from '../app/page.module.css';

/** Human-readable "as of" for the stale-data banner. */
function formatFreshness(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

const PriceChart = dynamic(() => import('./PriceChart'), { ssr: false });

/** The analyze route returns a full result or a partial "too new" one. */
type AnalyzeData = AnalyzeResponse | InsufficientHistoryResponse;

/** A recent listing with too little history returns the partial shape. */
function isTooNew(d: AnalyzeData): d is InsufficientHistoryResponse {
  return 'status' in d && d.status === 'insufficient_history';
}

const TIMEFRAMES: readonly Timeframe[] = ['intraday', 'swing', 'position'];
function isTimeframe(v: string | null): v is Timeframe {
  return v !== null && (TIMEFRAMES as readonly string[]).includes(v);
}

export default function AnalyzeApp() {
  const searchParams = useSearchParams();
  const router = useRouter();
  // Timeframe is a URL option (?timeframe=): seed it from the URL so a shared
  // link opens on the right candle size even before a symbol is analyzed.
  const [timeframe, setTimeframe] = useState<Timeframe>(() => {
    const t = searchParams.get('timeframe');
    return isTimeframe(t) ? t : 'swing';
  });
  const [activeSymbol, setActiveSymbol] = useState<string | null>(null);
  // Point-in-time replay: the as-of instant (ISO), or null when analyzing live.
  const [asOf, setAsOf] = useState<string | null>(() => searchParams.get('asOf'));
  const [data, setData] = useState<AnalyzeData | null>(null);

  // On a fresh /analyze visit (no symbol or timeframe in the URL), apply the
  // user's default-timeframe pref once it hydrates. A shared/deep link that
  // pins either one wins, so this never overrides an explicit choice.
  const { prefs, loaded: prefsLoaded } = usePrefs();
  const appliedTfPref = useRef(false);
  useEffect(() => {
    if (!prefsLoaded || appliedTfPref.current) return;
    appliedTfPref.current = true;
    const hasUrlTf = isTimeframe(searchParams.get('timeframe'));
    const hasUrlSymbol = Boolean(searchParams.get('symbol'));
    if (!hasUrlTf && !hasUrlSymbol && prefs.defaultTimeframe !== timeframe) {
      setTimeframe(prefs.defaultTimeframe);
    }
  }, [prefsLoaded, prefs.defaultTimeframe, searchParams, timeframe]);
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [profileFailed, setProfileFailed] = useState(false);
  const [error, setError] = useState<ErrorState | null>(null);
  const [loading, setLoading] = useState(false);
  // Guards the deep-link effect from re-running when WE change the URL.
  const lastDeepLink = useRef<string | null>(null);

  const loadAnalysis = useCallback(
    async (symbol: string, tf: Timeframe, asOfIso: string | null) => {
      setLoading(true);
      setError(null);
      try {
        const query =
          `symbol=${encodeURIComponent(symbol)}&timeframe=${tf}` +
          (asOfIso ? `&asOf=${encodeURIComponent(asOfIso)}` : '');
        const res = await fetch(`/api/v1/analyze?${query}`, { cache: 'no-store' });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as ApiError | null;
          setData(null);
          setError({
            code: body?.error ?? 'NETWORK',
            message: body?.message ?? `Request failed (${res.status})`,
          });
          return;
        }
        setData((await res.json()) as AnalyzeData);
      } catch {
        setData(null);
        setError({ code: 'NETWORK', message: 'Could not reach the analysis service.' });
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Fundamentals load independently of the trade plan — a failure just hides the
  // panel and never surfaces as a page error (the trade plan is what matters).
  const loadProfile = useCallback(async (symbol: string) => {
    setProfile(null);
    setProfileFailed(false);
    try {
      const res = await fetch(`/api/v1/profile?symbol=${encodeURIComponent(symbol)}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        setProfileFailed(true);
        return;
      }
      setProfile((await res.json()) as ProfileResponse);
    } catch {
      // Surface the failure instead of silently hiding the panel, so a flaky
      // fundamentals fetch is visible (and retryable) rather than a mystery.
      setProfileFailed(true);
    }
  }, []);

  // Reflect the current symbol + timeframe in the URL so it's shareable and the
  // Back button works between analyses. Bumping the guard prevents the deep-link
  // effect from treating our own URL change as a fresh navigation.
  const syncUrl = useCallback(
    (symbol: string, tf: Timeframe, asOfIso: string | null) => {
      lastDeepLink.current = `${symbol}:${tf}:${asOfIso ?? ''}`;
      const q = new URLSearchParams({ symbol, timeframe: tf });
      if (asOfIso) q.set('asOf', asOfIso);
      router.replace(`/analyze?${q.toString()}`, { scroll: false });
    },
    [router],
  );

  // Loads a symbol without touching the URL — the deep-link effect uses this on
  // arrival (the URL is already correct), and user actions add their own
  // syncUrl so an in-mount router.replace never races React's mount.
  const run = useCallback(
    (symbol: string, tf: Timeframe, asOfIso: string | null) => {
      setActiveSymbol(symbol);
      setTimeframe(tf);
      setAsOf(asOfIso);
      // Clear the prior symbol's result so the skeleton shows for the new one
      // (a timeframe switch keeps its data — see onTimeframe — so no flash).
      setData(null);
      void loadAnalysis(symbol, tf, asOfIso);
      void loadProfile(symbol);
    },
    [loadAnalysis, loadProfile],
  );

  const onAnalyze = useCallback(
    (symbol: string) => {
      syncUrl(symbol, timeframe, asOf);
      run(symbol, timeframe, asOf);
    },
    [run, syncUrl, timeframe, asOf],
  );

  // Clicking a timeframe re-runs the analysis (not the symbol-scoped profile)
  // and updates the URL option.
  const onTimeframe = useCallback(
    (tf: Timeframe) => {
      setTimeframe(tf);
      if (activeSymbol) {
        syncUrl(activeSymbol, tf, asOf);
        void loadAnalysis(activeSymbol, tf, asOf);
      } else {
        router.replace(`/analyze?timeframe=${tf}`, { scroll: false });
      }
    },
    [activeSymbol, loadAnalysis, syncUrl, router, asOf],
  );

  // The as-of control: re-run the current symbol at a past instant (or null = live).
  const onAsOf = useCallback(
    (asOfIso: string | null) => {
      setAsOf(asOfIso);
      if (activeSymbol) {
        syncUrl(activeSymbol, timeframe, asOfIso);
        void loadAnalysis(activeSymbol, timeframe, asOfIso);
      }
    },
    [activeSymbol, timeframe, syncUrl, loadAnalysis],
  );

  // Deep link: ?symbol=&timeframe= (from the Scan board or a shared URL) runs
  // once on arrival. Keyed to the URL so navigating between rows re-runs.
  const urlSymbol = searchParams.get('symbol');
  const urlTf = searchParams.get('timeframe');
  const urlAsOf = searchParams.get('asOf');
  useEffect(() => {
    if (!urlSymbol) return;
    const key = `${urlSymbol}:${urlTf ?? ''}:${urlAsOf ?? ''}`;
    if (lastDeepLink.current === key) return;
    lastDeepLink.current = key;
    run(urlSymbol.toUpperCase(), isTimeframe(urlTf) ? urlTf : 'swing', urlAsOf ?? null);
  }, [urlSymbol, urlTf, urlAsOf, run]);

  return (
    <>
      <SiteHeader />
      <div className={styles.shell}>

      {!activeSymbol && (
        <PageHero kicker="analyze" title="Analyze any ticker">
          Enter a symbol for a complete, defined-risk trade plan — entry, stop, target, and the
          reasoning behind them — or an honest “no trade”.
        </PageHero>
      )}

      {activeSymbol && (
        <div className={styles.analyzeHead}>
          <span className={styles.analyzeSymbol}>{activeSymbol}</span>
          <div className={styles.headActions}>
            <ShareButton />
            <FollowButton symbol={activeSymbol} />
          </div>
        </div>
      )}

      <Controls
        onAnalyze={onAnalyze}
        timeframe={timeframe}
        onTimeframe={onTimeframe}
        samples={WEB_CONFIG.samples}
        activeSymbol={activeSymbol}
        loading={loading}
        freshness={data ? { dataFreshness: data.dataFreshness, stale: data.stale } : null}
      />

      {activeSymbol && <AsOfControl asOf={asOf} onApply={onAsOf} />}

      {/* Point-in-time replay banner — this analysis is "as of" a past instant. */}
      {data && !error && data.historical && (
        <DataAlert
          variant="historical"
          message={`This is a point-in-time replay — the engine sees only data up to ${formatFreshness(
            data.dataFreshness,
          )}. Earnings checks are disabled for historical dates.`}
        />
      )}

      {error && (
        <div role="alert" data-testid="error-banner" className={styles.error}>
          <div className={styles.errorTitle}>{ERROR_TITLES[error.code]}</div>
          <div>{error.message}</div>
        </div>
      )}

      {/* Couldn't get fresh bars, but served the last ones — flag it, keep the
          plan visible below. */}
      {data && !error && data.stale && (
        <DataAlert
          variant="stale"
          message={`Live market data was unavailable, so this reflects the most recent data we have (as of ${formatFreshness(data.dataFreshness)}).`}
        />
      )}

      {/* Waiting on the analyze request with nothing to show yet → skeleton. */}
      {loading && !data && !error && <AnalyzeSkeleton />}

      {/* Too-new is a first-class partial result: no trade plan, but the chart
          still renders, and the company panel below shows the rest. */}
      {data && !error && isTooNew(data) && (
        <>
          <TooNew data={data} timeframe={timeframe} onSelectTimeframe={onTimeframe} />
          <PriceChart chart={data.chart} />
        </>
      )}

      {data && !error && !isTooNew(data) && (
        <>
          <div className={styles.cardRow}>
            <TradeCard data={data} />
            <TradeLadder data={data} />
          </div>
          {data.plan && <PositionSizer entry={data.plan.entry} stop={data.plan.stop} />}
          <PriceChart
            chart={data.chart}
            plan={data.plan}
            levels={data.levels}
            direction={data.direction}
          />
          <TradeStory story={data.story} direction={data.direction} />
          <FamilyGrid families={data.families} composite={data.composite} />
        </>
      )}

      {/* Company context loads independently of the trade plan, so it shows even
          when the engine can't run (e.g. a brand-new listing). */}
      {profile && <CompanyPanel data={profile} onPeerSelect={onAnalyze} />}
      {!profile && !profileFailed && activeSymbol && <ProfileSkeleton />}
      {!profile && profileFailed && activeSymbol && (
        <div data-testid="profile-error" className={styles.profileError}>
          Couldn’t load company details for {activeSymbol}.{' '}
          <button className={styles.retry} onClick={() => void loadProfile(activeSymbol)}>
            Retry
          </button>
        </div>
      )}

      <Footer />
      </div>
    </>
  );
}
