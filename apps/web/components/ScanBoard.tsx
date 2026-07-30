'use client';

/**
 * Scan board (design §6.3) — the ranked list of gate-passing setups. Refusals/
 * skips are shown as honest counts, never padded into the list. Each row shows
 * the actionable trade levels; clicking a row expands an inline drawer with the
 * engine's reasoning, the stop/target basis, and a link to the full Analyze
 * view. The symbol itself is a link (new-tab / deep link).
 *
 * Framing rule (CLAUDE.md): "signal agreement", not a prediction. The quality
 * column is the doc's (C/100)×RR rank, labelled as setup quality — not an
 * expected return.
 */
import { Fragment, useState } from 'react';
import Link from 'next/link';
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
  const [expanded, setExpanded] = useState<string | null>(null);
  // Columns: #, [Candle], Symbol, Bias, Entry, Stop, Target, R:R, Agmt, Quality, Driver, caret.
  const colSpan = 10 + (showTimeframe ? 1 : 0) + 1;

  return (
    <section data-testid="scan-board" className={styles.wrap} aria-label="top setups">
      <div className={styles.summary}>
        <span className={styles.summaryLead}>
          Highest signal-agreement setups right now — not predictions. Entry / stop / target are
          the engine&rsquo;s levels; size the risk yourself. Click a row for the reasoning.
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
                <th
                  className={styles.num}
                  title="Signal agreement — how strongly trend, momentum, volume, and structure agree. Not a win rate."
                >
                  Agree
                </th>
                <th className={styles.num}>Quality</th>
                <th className={styles.driverCol}>Driver</th>
                <th aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {board.rows.map((row, i) => {
                const tf = row.timeframe ?? board.timeframe;
                const href = analyzeHref(row.symbol, tf);
                const key = `${row.symbol}:${tf}`;
                const isOpen = expanded === key;
                return (
                  <Fragment key={key}>
                    <tr
                      data-testid={`scan-row-${row.symbol}`}
                      className={`${styles.row} ${isOpen ? styles.rowOpen : ''}`}
                      role="button"
                      tabIndex={0}
                      aria-expanded={isOpen}
                      aria-label={`${row.symbol} ${row.direction} setup — ${isOpen ? 'collapse' : 'expand'} details`}
                      onClick={() => setExpanded(isOpen ? null : key)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setExpanded(isOpen ? null : key);
                        }
                      }}
                    >
                      <td className={styles.rank}>{i + 1}</td>
                      {showTimeframe && <td className={`mono ${styles.tfCell}`}>{TF_LABEL[tf]}</td>}
                      <td className={styles.symbolCell}>
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
                      <td className={styles.caret} aria-hidden="true">
                        {isOpen ? '▾' : '▸'}
                      </td>
                    </tr>

                    {isOpen && (
                      <tr className={styles.detailRow}>
                        <td colSpan={colSpan} className={styles.detailCell}>
                          <div className={styles.detail} data-testid={`scan-detail-${row.symbol}`}>
                            <div className={styles.detailLevels}>
                              <span>
                                Entry <b>{usd(row.entry)}</b>
                              </span>
                              <span className={styles.stop}>
                                Stop <b>{usd(row.stop)}</b> (−{row.riskPct.toFixed(1)}% ·{' '}
                                {row.stopBasis})
                              </span>
                              <span className={styles.target}>
                                Target <b>{usd(row.target)}</b> (+{row.rewardPct.toFixed(1)}% ·{' '}
                                {row.targetBasis})
                              </span>
                            </div>
                            <p className={styles.detailStory}>{row.story}</p>
                            <Link
                              href={href}
                              className={styles.detailLink}
                              data-testid={`scan-detail-link-${row.symbol}`}
                            >
                              View full analysis →
                            </Link>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
