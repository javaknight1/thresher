/**
 * /internal — a HIDDEN data inspector (not linked in nav or the command palette;
 * protected in proxy.ts when auth is on). Shows everything Thresher currently has
 * cached/stored: the followed universe, cached OHLCV bars per symbol × timeframe,
 * the accumulating point-in-time earnings observations, and the precomputed scan
 * boards. Read-only; useful for watching the earnings calendar "roll in".
 */
import type { Timeframe } from '@thresher/engine';
import SiteHeader from '../../components/SiteHeader';
import Footer from '../../components/Footer';
import PageHero from '../../components/PageHero';
import { createBarCache } from '../../lib/cache';
import { createFollowStore } from '../../lib/follow-store';
import { createEarningsStore } from '../../lib/earnings-store';
import { createScanStore } from '../../lib/scan-store';
import { upstashConfigured } from '../../lib/upstash';
import { WEB_CONFIG } from '../../lib/config';
import styles from './internal.module.css';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Cached data — Thresher', robots: { index: false } };

const TIMEFRAMES: readonly Timeframe[] = ['intraday', 'swing', 'position'];
const fmt = (iso: string | null): string => (iso ? new Date(iso).toLocaleString() : '—');

export default async function InternalPage() {
  const follows = createFollowStore();
  const earnings = createEarningsStore();
  const scan = createScanStore();
  const cache = createBarCache();
  const backend = upstashConfigured() ? 'Upstash (durable)' : 'in-memory (per-isolate)';

  const [followed, earningsSymbols] = await Promise.all([
    follows.allSymbols().catch(() => [] as string[]),
    earnings.symbols().catch(() => [] as string[]),
  ]);

  const symbols = [
    ...new Set([...followed, ...WEB_CONFIG.scan.curated, ...earningsSymbols]),
  ].sort();

  // Cached bars: probe the known symbol set × each timeframe (no enumeration).
  const barRows = await Promise.all(
    symbols.map(async (symbol) => ({
      symbol,
      cols: await Promise.all(
        TIMEFRAMES.map(async (tf) => {
          const c = await cache.get(symbol, tf).catch(() => null);
          return c ? { count: c.bars.length, fetchedAt: c.fetchedAt } : null;
        }),
      ),
    })),
  );

  // Point-in-time earnings observations (the capture that accumulates forward).
  const earningsRows = await Promise.all(
    [...earningsSymbols].sort().map(async (symbol) => ({
      symbol,
      dates: await earnings.dates(symbol).catch(() => [] as string[]),
    })),
  );

  // Precomputed scan boards.
  const boards = await Promise.all(
    TIMEFRAMES.map(async (tf) => {
      const b = await scan.get(tf).catch(() => null);
      return { tf, storedAt: b ? new Date(b.storedAt).toISOString() : null, rows: b?.value.rows.length ?? null };
    }),
  );

  const cachedCount = barRows.filter((r) => r.cols.some(Boolean)).length;

  return (
    <>
      <SiteHeader minimal />
      <div className={styles.page} data-testid="internal-page">
        <PageHero kicker="internal" title="Cached data">
          Everything Thresher currently has stored — read-only. Storage backend:{' '}
          <strong>{backend}</strong>.
        </PageHero>

        <section className={styles.card}>
          <h2 className={styles.h2}>Followed universe ({followed.length})</h2>
          <p className={styles.mono}>{followed.length ? followed.join(', ') : '— none —'}</p>
        </section>

        <section className={styles.card}>
          <h2 className={styles.h2}>
            Point-in-time earnings observations ({earningsSymbols.length} symbols)
          </h2>
          <p className={styles.note}>
            Captured on every live analysis; accumulates forward into a point-in-time
            earnings calendar for historical replay (gate G5).
          </p>
          {earningsRows.length === 0 ? (
            <p className={styles.mono}>— none captured yet —</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Observed next-earnings dates</th>
                </tr>
              </thead>
              <tbody>
                {earningsRows.map((r) => (
                  <tr key={r.symbol}>
                    <td className={styles.mono}>{r.symbol}</td>
                    <td className={styles.mono}>{r.dates.map((d) => fmt(d)).join(' · ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className={styles.card}>
          <h2 className={styles.h2}>
            Cached bars ({cachedCount}/{symbols.length} symbols)
          </h2>
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Symbol</th>
                  {TIMEFRAMES.map((tf) => (
                    <th key={tf}>{tf}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {barRows.map((r) => (
                  <tr key={r.symbol}>
                    <td className={styles.mono}>{r.symbol}</td>
                    {r.cols.map((c, i) => (
                      <td key={TIMEFRAMES[i]} className={styles.mono}>
                        {c ? (
                          <>
                            {c.count} bars
                            <span className={styles.dim}> · {fmt(c.fetchedAt)}</span>
                          </>
                        ) : (
                          <span className={styles.dim}>—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.card}>
          <h2 className={styles.h2}>Precomputed scan boards</h2>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Timeframe</th>
                <th>Rows</th>
                <th>Computed</th>
              </tr>
            </thead>
            <tbody>
              {boards.map((b) => (
                <tr key={b.tf}>
                  <td className={styles.mono}>{b.tf}</td>
                  <td className={styles.mono}>{b.rows ?? '—'}</td>
                  <td className={styles.mono}>{fmt(b.storedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
      <Footer />
    </>
  );
}
