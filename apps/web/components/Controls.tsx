'use client';

/**
 * Controls — ticker input, timeframe pills, sample chips, and the
 * data-freshness stamp (design §6.2 item 1; §2.1 visible staleness warning).
 */
import { useState } from 'react';
import type { Timeframe } from '@thresher/engine';
import { WEB_CONFIG } from '../lib/config';
import styles from './Controls.module.css';

export interface ControlsProps {
  onAnalyze: (symbol: string) => void;
  timeframe: Timeframe;
  onTimeframe: (tf: Timeframe) => void;
  samples: readonly string[];
  activeSymbol: string | null;
  loading: boolean;
  freshness: { dataFreshness: string; stale: boolean } | null;
}

/**
 * The three analyzed timeframes, labelled by candle cadence (what the user
 * picks) with the trade horizon as the secondary note. Each still drives the
 * full engine at its interval — intraday=1h, swing=1d, position=1wk
 * (WEB_CONFIG.provider.lookback). Adding finer candles (1m/5m/15m) would need
 * new methodology constants, so the set stays at these three.
 */
const TIMEFRAMES: ReadonlyArray<{ key: Timeframe; label: string; horizon: string }> = [
  { key: 'intraday', label: 'Hourly', horizon: 'intraday' },
  { key: 'swing', label: 'Daily', horizon: 'swing' },
  { key: 'position', label: 'Weekly', horizon: 'position' },
];

/** Tickers only: uppercase letters, dots, dashes. */
function sanitize(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z.-]/g, '');
}

export default function Controls({
  onAnalyze,
  timeframe,
  onTimeframe,
  samples,
  activeSymbol,
  loading,
  freshness,
}: ControlsProps) {
  const [input, setInput] = useState('');

  const submit = (symbol?: string) => {
    const clean = sanitize((symbol ?? input).trim());
    if (!clean || loading) return;
    setInput(clean);
    onAnalyze(clean);
  };

  const lookback = WEB_CONFIG.provider.lookback[timeframe];

  return (
    <section className={styles.wrap} aria-label="analysis controls">
      <div className={styles.row}>
        <input
          data-testid="ticker-input"
          className={styles.input}
          value={input}
          onChange={(e) => setInput(sanitize(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          placeholder="TICKER"
          aria-label="ticker symbol"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          data-testid="analyze-button"
          className={styles.analyze}
          onClick={() => submit()}
          disabled={loading}
        >
          {loading ? 'Analyzing…' : 'Analyze'}
        </button>
        <div className={styles.pills} role="group" aria-label="candle timeframe">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.key}
              data-testid={`tf-${tf.key}`}
              className={`${styles.pill} ${timeframe === tf.key ? styles.pillActive : ''}`}
              aria-pressed={timeframe === tf.key}
              title={`${tf.label} candles · ${tf.horizon} horizon`}
              onClick={() => onTimeframe(tf.key)}
            >
              {tf.label}
              <span className={styles.pillSub}>{tf.horizon}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.row}>
        <span className={styles.try}>try:</span>
        {samples.map((s) => (
          <button
            key={s}
            className={`${styles.chip} ${activeSymbol === s ? styles.chipActive : ''}`}
            onClick={() => submit(s)}
          >
            {s}
          </button>
        ))}
        <span className={`mono ${styles.meta}`}>
          {lookback.interval} bars · {lookback.days}d lookback
        </span>
        {freshness && (
          <span data-testid="freshness" className={`mono ${styles.freshness}`}>
            data as of{' '}
            {new Date(freshness.dataFreshness).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
            {freshness.stale && <span className={styles.staleTag}>STALE</span>}
          </span>
        )}
      </div>
    </section>
  );
}
