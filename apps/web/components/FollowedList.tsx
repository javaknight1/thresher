'use client';

/**
 * The followed-stocks list — a leaderboard-style rows view (logo · ticker ·
 * company · price · day change) backed by /api/v1/quote (one batch call for the
 * whole watchlist). Shares the app-wide follows store, so add/remove reflects
 * here immediately.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { SymbolQuote } from '../lib/contracts';
import { useFollows } from '../lib/follows-client';
import Logo from './Logo';
import styles from './FollowedList.module.css';

export default function FollowedList() {
  const { symbols, loaded, toggle } = useFollows();
  const [quotes, setQuotes] = useState<Record<string, SymbolQuote>>({});
  const key = symbols.join(',');

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
    // key is the stable join of symbols; re-fetch only when the set changes.
  }, [key, symbols.length]);

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
        return (
          <div key={sym} className={styles.row} data-testid={`followed-row-${sym}`}>
            <Logo ticker={sym} label={sym} size={34} />
            <div className={styles.idcol}>
              <Link href={`/analyze?symbol=${sym}`} className={styles.sym}>
                {sym}
              </Link>
              <span className={styles.name}>{q?.name ?? '—'}</span>
            </div>
            <div className={styles.pricecol}>
              <span className={styles.price}>
                {q?.price != null ? `$${q.price.toFixed(2)}` : '—'}
              </span>
              {change !== null && (
                <span className={up ? styles.up : styles.down}>
                  {up ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
                </span>
              )}
            </div>
            <Link href={`/analyze?symbol=${sym}`} className={styles.view} data-testid={`analyze-${sym}`}>
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
        );
      })}
    </div>
  );
}
