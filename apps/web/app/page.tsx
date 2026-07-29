'use client';

/**
 * The Analyze page — the product (design §6.2). Controls → trade card +
 * ladder → chart → story → family grid → disclaimer. NO TRADE is a
 * first-class state, not an error.
 */
import { useCallback, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import type { Timeframe } from '@thresher/engine';
import type {
  AnalyzeResponse,
  ApiError,
  InsufficientHistoryResponse,
  ProfileResponse,
} from '../lib/api-types';
import { WEB_CONFIG } from '../lib/config';
import Controls from '../components/Controls';
import TradeCard from '../components/TradeCard';
import TradeLadder from '../components/TradeLadder';
import TradeStory from '../components/TradeStory';
import FamilyGrid from '../components/FamilyGrid';
import CompanyPanel from '../components/CompanyPanel';
import TooNew from '../components/TooNew';
import Disclaimer from '../components/Disclaimer';
import styles from './page.module.css';

const PriceChart = dynamic(() => import('../components/PriceChart'), { ssr: false });

type ErrorState = { code: ApiError['error'] | 'NETWORK'; message: string };

/** The analyze route returns a full result or a partial "too new" one. */
type AnalyzeData = AnalyzeResponse | InsufficientHistoryResponse;

/** A recent listing with too little history returns the partial shape. */
function isTooNew(d: AnalyzeData): d is InsufficientHistoryResponse {
  return 'status' in d && d.status === 'insufficient_history';
}

/** Plain-English headline per error code — raw codes are jargon to a trader. */
const ERROR_TITLES: Record<ErrorState['code'], string> = {
  INVALID_REQUEST: 'Check the ticker',
  UNKNOWN_SYMBOL: 'Ticker not found',
  UNTRADEABLE_SYMBOL: 'Too illiquid to analyze',
  INSUFFICIENT_HISTORY: 'Too new for a full technical read',
  RATE_LIMITED: 'Too many requests',
  DATA_UNAVAILABLE: 'Market data unavailable',
  NETWORK: 'Can’t reach the service',
};

export default function AnalyzePage() {
  const [timeframe, setTimeframe] = useState<Timeframe>('swing');
  const [activeSymbol, setActiveSymbol] = useState<string | null>(null);
  const [data, setData] = useState<AnalyzeData | null>(null);
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);
  const [loading, setLoading] = useState(false);

  const loadAnalysis = useCallback(async (symbol: string, tf: Timeframe) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/analyze?symbol=${encodeURIComponent(symbol)}&timeframe=${tf}`,
        { cache: 'no-store' },
      );
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
  }, []);

  // Fundamentals load independently of the trade plan — a failure just hides the
  // panel and never surfaces as a page error (the trade plan is what matters).
  const loadProfile = useCallback(async (symbol: string) => {
    setProfile(null);
    try {
      const res = await fetch(`/api/v1/profile?symbol=${encodeURIComponent(symbol)}`, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      setProfile((await res.json()) as ProfileResponse);
    } catch {
      setProfile(null);
    }
  }, []);

  const onAnalyze = useCallback(
    (symbol: string) => {
      setActiveSymbol(symbol);
      void loadAnalysis(symbol, timeframe);
      void loadProfile(symbol);
    },
    [loadAnalysis, loadProfile, timeframe],
  );

  // Switching timeframe re-runs the analysis but not the (symbol-scoped) profile.
  const onTimeframe = useCallback(
    (tf: Timeframe) => {
      setTimeframe(tf);
      if (activeSymbol) void loadAnalysis(activeSymbol, tf);
    },
    [activeSymbol, loadAnalysis],
  );

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div>
          <div className={styles.wordmark}>THRESHER</div>
          <div className={styles.tagline}>
            technical confluence desk — full trade story from entry to exit
          </div>
        </div>
        <nav className={styles.nav}>
          <Link href="/methodology" className="deep-link mono">
            methodology
          </Link>
        </nav>
      </header>

      <Controls
        onAnalyze={onAnalyze}
        timeframe={timeframe}
        onTimeframe={onTimeframe}
        samples={WEB_CONFIG.samples}
        activeSymbol={activeSymbol}
        loading={loading}
        freshness={data ? { dataFreshness: data.dataFreshness, stale: data.stale } : null}
      />

      {error && (
        <div role="alert" data-testid="error-banner" className={styles.error}>
          <div className={styles.errorTitle}>{ERROR_TITLES[error.code]}</div>
          <div>{error.message}</div>
        </div>
      )}

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

      <Disclaimer />
    </div>
  );
}
