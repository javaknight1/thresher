'use client';

/**
 * The followed-stocks list — a leaderboard-style rows view. Each row shows the
 * price snapshot (logo · ticker · company · price · day change, via
 * /api/v1/quote) AND the exact trade the engine is offering for that symbol,
 * when there is one: direction + entry / stop / target / R:R, pulled from the
 * precomputed boards. Symbols with no qualifying setup say so honestly.
 * Shares the app-wide follows store, so add/remove reflects here immediately.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Timeframe } from '@thresher/engine';
import type { SymbolQuote } from '../lib/contracts';
import type { ScanResponse, ScanRow } from '../lib/api-types';
import { useFollows } from '../lib/follows-client';
import { TF_VIEWS, fetchBoard, bestBySymbol } from '../lib/board-client';
import Logo from './Logo';
import styles from './FollowedList.module.css';

const TF_LABEL: Record<Timeframe, string> = {
  intraday: 'Hourly',
  swing: 'Daily',
  position: 'Weekly',
};

const money = (x: number) => `$${x.toFixed(2)}`;

export default function FollowedList() {
  const { symbols, loaded, toggle } = useFollows();
  const [quotes, setQuotes] = useState<Record<string, SymbolQuote>>({});
  const [setups, setSetups] = useState<Record<string, ScanRow>>({});
  const key = symbols.join(',');

  // Price snapshots — re-fetch when the follow set changes.
  useEffect(() => {
    if (symbols.length === 0) {
      setQuotes({});
      return;
    }
    let cancelled = false;
    fetch(`/api/v1/quote?symbols=${encodeURIComponent(key)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((body: { quotes?: SymbolQuote[] }) => {
        if (cancelled) return;
        const map: Record<string, SymbolQuote> = {};
        for (const q of body.quotes ?? []) map[q.symbol] = q;
        setQuotes(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [key, symbols.length]);

  // Best setup per symbol across all candle sizes (from the cached boards) — the
  // exact trade to show on each line. Boards are global, so fetch once.
  useEffect(() => {
    let cancelled = false;
    Promise.all(TF_VIEWS.map((tf) => fetchBoard(tf))).then((results) => {
      if (cancelled) return;
      const boards = results
        .map((r) => r.board)
        .filter((b): b is ScanResponse => b !== null);
      setSetups(Object.fromEntries(bestBySymbol(boards)));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loaded && symbols.length === 0) {
    return (
      <div className={styles.empty} data-testid="followed-empty">
        No follows yet. Search a company above to build your watchlist.
      </div>
    );
  }

  return (
    <div className={styles.list} data-testid="followed-list">
      {symbols.map((sym) => {
        const q = quotes[sym];
        const change = q?.changePct ?? null;
        const up = change !== null && change >= 0;
        const setup = setups[sym];
        return (
          <div key={sym} className={styles.row} data-testid={`followed-row-${sym}`}>
            <div className={styles.headline}>
              <Logo ticker={sym} label={sym} size={34} />
              <div className={styles.idcol}>
                <Link href={`/analyze?symbol=${sym}`} className={styles.sym}>
                  {sym}
                </Link>
                <span className={styles.name}>{q?.name ?? '—'}</span>
              </div>
              <div className={styles.pricecol}>
                <span className={styles.price}>
                  {q?.price != null ? money(q.price) : '—'}
                </span>
                {change !== null && (
                  <span className={up ? styles.up : styles.down}>
                    {up ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
                  </span>
                )}
              </div>
              <Link
                href={`/analyze?symbol=${sym}${setup?.timeframe ? `&timeframe=${setup.timeframe}` : ''}`}
                className={styles.view}
                data-testid={`analyze-${sym}`}
              >
                Analyze
              </Link>
              <button
                className={styles.remove}
                data-testid={`followed-unfollow-${sym}`}
                onClick={() => void toggle(sym)}
                title={`Unfollow ${sym}`}
                aria-label={`Unfollow ${sym}`}
              >
                ✕
              </button>
            </div>

            <div className={styles.trade} data-testid={`trade-${sym}`}>
              {setup ? (
                <>
                  <span
                    className={`${styles.dir} ${setup.direction === 'long' ? styles.dirLong : styles.dirShort}`}
                  >
                    {setup.direction.toUpperCase()}
                  </span>
                  <span className={styles.leg}>
                    <span className={styles.legLabel}>Entry</span> {money(setup.entry)}
                  </span>
                  <span className={styles.leg}>
                    <span className={styles.legLabel}>Stop</span>{' '}
                    <span className={styles.stopVal}>{money(setup.stop)}</span>
                  </span>
                  <span className={styles.leg}>
                    <span className={styles.legLabel}>Target</span>{' '}
                    <span className={styles.targetVal}>{money(setup.target)}</span>
                  </span>
                  <span className={styles.rr}>{setup.rr.toFixed(2)}R</span>
                  {setup.timeframe && <span className={styles.tf}>{TF_LABEL[setup.timeframe]}</span>}
                </>
              ) : (
                <span className={styles.noTrade}>No active setup — watching</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
