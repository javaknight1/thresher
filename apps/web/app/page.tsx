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
import type { AnalyzeResponse, ApiError } from '../lib/api-types';
import { WEB_CONFIG } from '../lib/config';
import Controls from '../components/Controls';
import TradeCard from '../components/TradeCard';
import TradeLadder from '../components/TradeLadder';
import TradeStory from '../components/TradeStory';
import FamilyGrid from '../components/FamilyGrid';
import Disclaimer from '../components/Disclaimer';
import styles from './page.module.css';

const PriceChart = dynamic(() => import('../components/PriceChart'), { ssr: false });

type ErrorState = { code: ApiError['error'] | 'NETWORK'; message: string };

export default function AnalyzePage() {
  const [timeframe, setTimeframe] = useState<Timeframe>('swing');
  const [activeSymbol, setActiveSymbol] = useState<string | null>(null);
  const [data, setData] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async (symbol: string, tf: Timeframe) => {
    setLoading(true);
    setError(null);
    setActiveSymbol(symbol);
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
      setData((await res.json()) as AnalyzeResponse);
    } catch {
      setData(null);
      setError({ code: 'NETWORK', message: 'Could not reach the analysis service.' });
    } finally {
      setLoading(false);
    }
  }, []);

  const onAnalyze = useCallback((symbol: string) => void run(symbol, timeframe), [run, timeframe]);

  const onTimeframe = useCallback(
    (tf: Timeframe) => {
      setTimeframe(tf);
      if (activeSymbol) void run(activeSymbol, tf);
    },
    [activeSymbol, run],
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
          <span className="mono">{error.code}</span> — {error.message}
        </div>
      )}

      {data && !error && (
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

      <Disclaimer />
    </div>
  );
}
