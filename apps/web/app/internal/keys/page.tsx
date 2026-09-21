/** /internal/keys — Data browser (tier C): raw key explorer + per-store views. */
import type { Timeframe } from '@thresher/engine';
import { createBarCache } from '../../../lib/cache';
import { createFollowStore } from '../../../lib/follow-store';
import { createEarningsStore } from '../../../lib/earnings-store';
import { createScanStore } from '../../../lib/scan-store';
import { WEB_CONFIG } from '../../../lib/config';
import { scanKeys, keyInfo, redisConfigured } from '../../../lib/internal/admin';
import styles from '../internal.module.css';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TIMEFRAMES: readonly Timeframe[] = ['intraday', 'swing', 'position'];
const KEY_DETAIL_CAP = 80;
const fmt = (iso: string | null): string => (iso ? new Date(iso).toLocaleString() : '—');
const ttlLabel = (ttl: number | null): string =>
  ttl == null ? '—' : ttl === -1 ? 'no expiry' : ttl === -2 ? 'missing' : `${ttl}s`;

export default async function InternalKeys() {
  const redis = redisConfigured();
  const follows = createFollowStore();
  const earnings = createEarningsStore();
  const scan = createScanStore();
  const cache = createBarCache();

  const [allKeys, followed, earningsSymbols] = await Promise.all([
    redis ? scanKeys('*', 500) : Promise.resolve([]),
    follows.allSymbols().catch(() => [] as string[]),
    earnings.symbols().catch(() => [] as string[]),
  ]);

  const infos = await Promise.all(allKeys.slice(0, KEY_DETAIL_CAP).map((k) => keyInfo(k)));

  const symbols = [
    ...new Set([...followed, ...WEB_CONFIG.scan.curated, ...earningsSymbols]),
  ].sort();

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

  const earningsRows = await Promise.all(
    [...earningsSymbols].sort().map(async (symbol) => ({
      symbol,
      dates: await earnings.dates(symbol).catch(() => [] as string[]),
    })),
  );

  const boards = await Promise.all(
    TIMEFRAMES.map(async (tf) => {
      const b = await scan.get(tf).catch(() => null);
      return {
        tf,
        storedAt: b ? new Date(b.storedAt).toISOString() : null,
        rows: b?.value.rows.length ?? null,
      };
    }),
  );

  return (
    <>
      <h1 className={styles.h1}>Data browser</h1>

      <section className={styles.card}>
        <h2 className={styles.h2}>
          Redis keys{redis ? ` (${allKeys.length}${allKeys.length > KEY_DETAIL_CAP ? `, showing ${KEY_DETAIL_CAP}` : ''})` : ''}
        </h2>
        {!redis ? (
          <p className={styles.note}>Requires Upstash — no server keyspace in in-memory mode.</p>
        ) : (
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Type</th>
                  <th>TTL</th>
                  <th>Size</th>
                </tr>
              </thead>
              <tbody>
                {infos.map((info) => (
                  <tr key={info.key}>
                    <td className={styles.mono}>{info.key}</td>
                    <td className={styles.mono}>{info.type ?? '—'}</td>
                    <td className={styles.mono}>{ttlLabel(info.ttl)}</td>
                    <td className={styles.mono}>
                      {info.members != null
                        ? `${info.members} members`
                        : info.bytes != null
                          ? `${info.bytes} B`
                          : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.card}>
        <h2 className={styles.h2}>Cached bars</h2>
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
                          {c.count} bars<span className={styles.dim}> · {fmt(c.fetchedAt)}</span>
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
        <h2 className={styles.h2}>Earnings observations ({earningsSymbols.length})</h2>
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
        <h2 className={styles.h2}>Followed universe ({followed.length})</h2>
        <p className={styles.mono}>{followed.length ? followed.join(', ') : '— none —'}</p>
      </section>

      <section className={styles.card}>
        <h2 className={styles.h2}>Scan boards</h2>
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
    </>
  );
}
