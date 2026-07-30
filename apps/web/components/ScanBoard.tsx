'use client';

/**
 * Scan board (design §6.3) — the ranked list of gate-passing setups for one
 * timeframe. Refusals/skips are shown as honest counts, never padded into the
 * list. Each row deep-links to the Analyze view for that symbol + timeframe.
 *
 * Framing rule (CLAUDE.md): this is "signal agreement", not a prediction. The
 * quality column is the doc's (C/100)×RR rank, labelled as setup quality — not
 * an expected return.
 */
import Link from 'next/link';
import type { ScanResponse } from '../lib/api-types';
import styles from './ScanBoard.module.css';

export interface ScanBoardProps {
  board: ScanResponse;
}

function asOfTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function ScanBoard({ board }: ScanBoardProps) {
  return (
    <section data-testid="scan-board" className={styles.wrap} aria-label="top setups">
      <div className={styles.summary}>
        <span className={styles.summaryLead}>
          Highest signal-agreement setups right now — not predictions.
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
                <th>Symbol</th>
                <th>Bias</th>
                <th className={styles.num}>Agreement</th>
                <th className={styles.num}>R:R</th>
                <th className={styles.num}>Quality</th>
                <th className={styles.driverCol}>Driver</th>
              </tr>
            </thead>
            <tbody>
              {board.rows.map((row, i) => (
                <tr key={row.symbol} data-testid={`scan-row-${row.symbol}`} className={styles.row}>
                  <td className={styles.rank}>{i + 1}</td>
                  <td className={styles.symbolCell}>
                    <Link
                      href={`/analyze?symbol=${encodeURIComponent(row.symbol)}&timeframe=${board.timeframe}`}
                      className={styles.symbolLink}
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
                  <td className={`mono ${styles.num}`}>{row.confidence}</td>
                  <td className={`mono ${styles.num}`}>{row.rr.toFixed(2)}</td>
                  <td className={`mono ${styles.num} ${styles.quality}`}>
                    {row.qualityRank.toFixed(2)}
                  </td>
                  <td className={styles.driverCol}>{row.driver}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
