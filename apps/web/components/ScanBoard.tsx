'use client';

/**
 * Scan board (design §6.3) — the ranked list of gate-passing setups. Refusals/
 * skips are shown as honest counts, never padded into the list. Each row shows
 * the actionable trade levels (entry/stop/target) and deep-links to the full
 * Analyze view for its symbol + timeframe.
 *
 * Framing rule (CLAUDE.md): "signal agreement", not a prediction. The quality
 * column is the doc's (C/100)×RR rank, labelled as setup quality — not an
 * expected return.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Timeframe } from '@thresher/engine';
import type { ScanResponse } from '../lib/api-types';
import { WEB_CONFIG } from '../lib/config';
import styles from './ScanBoard.module.css';

export interface ScanBoardProps {
  board: ScanResponse;
  /** show the candle-size column (the aggregated "Top" view mixes timeframes) */
  showTimeframe?: boolean;
}

const TF_LABEL: Record<Timeframe, string> = {
  intraday: 'Hourly',
  swing: 'Daily',
  position: 'Weekly',
};

function analyzeHref(symbol: string, timeframe: string): string {
  return `/analyze?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}`;
}

function asOfTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const usd = (x: number) => `$${x.toFixed(2)}`;

export default function ScanBoard({ board, showTimeframe = false }: ScanBoardProps) {
  const router = useRouter();
  return (
    <section data-testid="scan-board" className={styles.wrap} aria-label="top setups">
      <div className={styles.summary}>
        <span className={styles.summaryLead}>
          Highest signal-agreement setups right now — not predictions. Entry / stop / target are
          the engine&rsquo;s levels; size the risk yourself.
        </span>
        <span className={`mono ${styles.counts}`} data-testid="scan-counts">
          {board.emitted} setups · {board.refused} refused · {board.skipped} skipped ·{' '}
          {board.universeSize} screened · as of {asOfTime(board.asOf)}
        </span>
      </div>

      {board.rows.length === 0 ? (
        <div data-testid="scan-empty" className={styles.empty}>
          No setups cleared all five gates right now — {board.refused} of {board.universeSize}{' '}
          refused. That&rsquo;s normal: most names have no confluence most of the time. Try another
          candle size, or search a specific ticker.
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.rank}>#</th>
                {showTimeframe && <th>Candle</th>}
                <th>Symbol</th>
                <th>Bias</th>
                <th className={styles.num}>Entry</th>
                <th className={styles.num}>Stop</th>
                <th className={styles.num}>Target</th>
                <th className={styles.num}>R:R</th>
                <th className={styles.num}>Agmt</th>
                <th className={styles.num}>Quality</th>
                <th className={styles.driverCol}>Driver</th>
              </tr>
            </thead>
            <tbody>
              {board.rows.map((row, i) => {
                const tf = row.timeframe ?? board.timeframe;
                const href = analyzeHref(row.symbol, tf);
                return (
                  <tr
                    key={`${row.symbol}:${tf}`}
                    data-testid={`scan-row-${row.symbol}`}
                    className={styles.row}
                    role="link"
                    tabIndex={0}
                    aria-label={`${row.symbol} ${row.direction} setup — open full trade detail`}
                    onClick={() => router.push(href)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        router.push(href);
                      }
                    }}
                  >
                    <td className={styles.rank}>{i + 1}</td>
                    {showTimeframe && (
                      <td className={`mono ${styles.tfCell}`}>{TF_LABEL[tf]}</td>
                    )}
                    <td className={styles.symbolCell}>
                      {/* Real link too: focus, middle-click / open-in-new-tab.
                          stopPropagation so it doesn't double-fire the row nav. */}
                      <Link
                        href={href}
                        className={styles.symbolLink}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {row.symbol}
                      </Link>
                    </td>
                    <td>
                      <span
                        className={row.direction === 'long' ? styles.long : styles.short}
                        data-testid={`scan-bias-${row.symbol}`}
                      >
                        {row.direction === 'long' ? 'LONG' : 'SHORT'}
                      </span>
                    </td>
                    <td className={`mono ${styles.num}`}>{usd(row.entry)}</td>
                    <td className={`mono ${styles.num} ${styles.stop}`}>{usd(row.stop)}</td>
                    <td className={`mono ${styles.num} ${styles.target}`}>{usd(row.target)}</td>
                    <td className={`mono ${styles.num}`}>
                      {row.rr >= WEB_CONFIG.scan.outlierRR && (
                        <span
                          className={styles.outlier}
                          title="Unusually large reward:risk — the target is far from entry. Sanity-check before acting."
                          data-testid={`scan-outlier-${row.symbol}`}
                        >
                          ⚠{' '}
                        </span>
                      )}
                      {row.rr.toFixed(2)}
                    </td>
                    <td className={`mono ${styles.num}`}>{row.confidence}</td>
                    <td className={`mono ${styles.num} ${styles.quality}`}>
                      {row.qualityRank.toFixed(2)}
                    </td>
                    <td className={styles.driverCol}>{row.driver}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
