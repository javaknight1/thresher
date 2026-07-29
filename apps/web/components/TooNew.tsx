'use client';

/**
 * "Too new for a full read" panel — a first-class partial result, not an error.
 *
 * A recent listing (e.g. an IPO) is a valid stock with too little price history
 * for the engine at the chosen candle size. We STILL show the chart and the
 * company panel; this panel explains why there's no trade plan yet and — key
 * part — how much history each candle size needs, flagging the ones this stock
 * already qualifies for so the user can jump to a REAL analysis there.
 *
 * We never fabricate a low-data "guess": the methodology refuses to score with
 * < barsNeeded bars, and confidence is uncalibrated. Instead we point to the
 * timeframe where a genuine read is available.
 */
import type { Timeframe } from '@thresher/engine';
import type { InsufficientHistoryResponse } from '../lib/api-types';
import styles from './TooNew.module.css';

export interface TooNewProps {
  data: InsufficientHistoryResponse;
  timeframe: Timeframe;
  onSelectTimeframe: (tf: Timeframe) => void;
}

const DAY_MS = 86_400_000;

/**
 * Approximate bars-per-week per candle size (hourly ≈ 6.5 × 5 sessions) and the
 * calendar history a full read needs, for a plain-English requirement.
 */
const TF_HISTORY: ReadonlyArray<{
  key: Timeframe;
  label: string;
  barsPerWeek: number;
  needsText: string;
}> = [
  { key: 'intraday', label: 'Hourly', barsPerWeek: 32.5, needsText: '~4 weeks of history' },
  { key: 'swing', label: 'Daily', barsPerWeek: 5, needsText: '~6 months of history' },
  { key: 'position', label: 'Weekly', barsPerWeek: 1, needsText: '~2.5 years of history' },
];

export default function TooNew({ data, timeframe, onSelectTimeframe }: TooNewProps) {
  const bars = data.chart.bars;
  const spanDays = bars.length >= 2 ? (bars[bars.length - 1].t - bars[0].t) / DAY_MS : 0;
  const weeksOfHistory = spanDays / 7;
  const currentLabel = TF_HISTORY.find((t) => t.key === timeframe)?.label ?? 'this';

  return (
    <section data-testid="too-new-notice" className={styles.wrap} aria-label="insufficient history">
      <div className={styles.title}>Too new for a full {currentLabel} read</div>
      <p className={styles.lead}>
        {data.symbol} is a recent listing: it has only {data.barsAvailable} {currentLabel.toLowerCase()}{' '}
        candles and a full technical read needs {data.barsNeeded}. The full company details and the
        price chart are below — Thresher just won&rsquo;t invent a trade plan on this little history.
      </p>

      <div className="kicker">What each candle size needs</div>
      <ul className={styles.tfList}>
        {TF_HISTORY.map((tf) => {
          const estBars = weeksOfHistory * tf.barsPerWeek;
          const qualifies = estBars >= data.barsNeeded;
          const isCurrent = tf.key === timeframe;
          return (
            <li key={tf.key} className={styles.tfRow}>
              <span className={styles.tfLabel}>{tf.label}</span>
              <span className={styles.tfNeeds}>needs {tf.needsText}</span>
              {isCurrent ? (
                <span className={styles.tfNo}>not enough yet</span>
              ) : qualifies ? (
                <button
                  className={styles.tfGo}
                  onClick={() => onSelectTimeframe(tf.key)}
                  data-testid={`too-new-switch-${tf.key}`}
                >
                  enough history — analyze {tf.label} →
                </button>
              ) : (
                <span className={styles.tfNo}>not enough yet</span>
              )}
            </li>
          );
        })}
      </ul>
      <p className={styles.footnote}>
        Availability is estimated from {data.symbol}&rsquo;s ~{Math.max(1, Math.round(spanDays))} days
        of trading so far.
      </p>
    </section>
  );
}
