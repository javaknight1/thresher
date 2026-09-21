/** /internal/integrity — Integrity checks (tier D): drift, orphans, gaps, freshness. */
import type { Timeframe } from '@thresher/engine';
import { createBarCache } from '../../../lib/cache';
import { createFollowStore } from '../../../lib/follow-store';
import { createEarningsStore } from '../../../lib/earnings-store';
import { scanKeys, bucketByPrefix, redisConfigured } from '../../../lib/internal/admin';
import styles from '../internal.module.css';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TIMEFRAMES: readonly Timeframe[] = ['intraday', 'swing', 'position'];

/** A check card: green when `offenders` is empty, amber otherwise. */
function Check({ title, ok, okText, offenders }: {
  title: string;
  ok: boolean;
  okText: string;
  offenders: string[];
}) {
  return (
    <section className={styles.card}>
      <h2 className={styles.h2}>
        <span className={`${styles.dot} ${ok ? styles.ok : styles.warn}`} />
        {title}
      </h2>
      {ok ? (
        <p className={styles.note}>{okText}</p>
      ) : (
        <p className={styles.mono}>{offenders.join(' · ')}</p>
      )}
    </section>
  );
}

export default async function InternalIntegrity() {
  const redis = redisConfigured();
  const follows = createFollowStore();
  const earnings = createEarningsStore();
  const cache = createBarCache();

  // Orphan keys (Upstash): keys matching no known prefix.
  const allKeys = redis ? await scanKeys('*', 500) : [];
  const { orphans } = bucketByPrefix(allKeys);

  // Universe drift: symbols in the follow universe with zero followers.
  const universe = await follows.allSymbols().catch(() => [] as string[]);
  const followerCounts = await Promise.all(
    universe.map(async (s) => ({ s, n: (await follows.followersOf(s).catch(() => [])).length })),
  );
  const orphanFollows = followerCounts.filter((x) => x.n === 0).map((x) => x.s);

  // Coverage gaps: followed symbols with no cached bars for a timeframe.
  const gaps: string[] = [];
  await Promise.all(
    universe.map(async (symbol) => {
      for (const tf of TIMEFRAMES) {
        const c = await cache.get(symbol, tf).catch(() => null);
        if (!c) gaps.push(`${symbol}/${tf}`);
      }
    }),
  );

  // Earnings freshness: symbols whose latest observed date is already in the past
  // (capture is behind — the next earnings has passed without a newer observation).
  const nowMs = Date.now();
  const earningsSymbols = await earnings.symbols().catch(() => [] as string[]);
  const staleEarnings: string[] = [];
  await Promise.all(
    earningsSymbols.map(async (symbol) => {
      const dates = await earnings.dates(symbol).catch(() => [] as string[]);
      const latest = dates.length ? Date.parse(dates[dates.length - 1]) : NaN;
      if (Number.isFinite(latest) && latest < nowMs) staleEarnings.push(symbol);
    }),
  );

  return (
    <>
      <h1 className={styles.h1}>Integrity</h1>
      <p className={styles.sub}>
        Automated consistency checks. Amber = worth a look (not necessarily a bug).
      </p>

      <Check
        title="Orphan keys"
        ok={!redis || orphans.length === 0}
        okText={redis ? 'Every key matches a known prefix.' : 'Requires Upstash.'}
        offenders={orphans}
      />
      <Check
        title="Follow-universe drift"
        ok={orphanFollows.length === 0}
        okText="Every symbol in the scan universe has at least one follower."
        offenders={orphanFollows}
      />
      <Check
        title="Cache coverage gaps"
        ok={gaps.length === 0}
        okText="Every followed symbol has cached bars for all timeframes."
        offenders={gaps}
      />
      <Check
        title="Earnings capture freshness"
        ok={staleEarnings.length === 0}
        okText="Every captured symbol has a future next-earnings observation."
        offenders={staleEarnings.map((s) => `${s} (next earnings passed — awaiting a fresh observation)`)}
      />
    </>
  );
}
