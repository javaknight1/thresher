/** /internal — Overview (tier A: connection health, env, key counts, versions). */
import { Fragment } from 'react';
import { ENGINE_VERSION, configHash } from '@thresher/engine';
import { createFollowStore } from '../../lib/follow-store';
import { createEarningsStore } from '../../lib/earnings-store';
import {
  ping,
  dbsize,
  scanKeys,
  bucketByPrefix,
  KEY_PREFIXES,
  redisConfigured,
} from '../../lib/internal/admin';
import styles from './internal.module.css';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ENV_GROUPS: ReadonlyArray<{ label: string; keys: string[] }> = [
  { label: 'Upstash', keys: ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'] },
  { label: 'Supabase', keys: ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] },
  { label: 'Clerk', keys: ['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'CLERK_SECRET_KEY'] },
  { label: 'Cron secret', keys: ['CRON_SECRET'] },
  { label: 'logo.dev', keys: ['NEXT_PUBLIC_LOGO_DEV_TOKEN'] },
];

export default async function InternalOverview() {
  const redis = redisConfigured();
  const [health, total, keys, followed, earningsSymbols] = await Promise.all([
    ping(),
    dbsize(),
    scanKeys('*', 1000),
    createFollowStore().allSymbols().catch(() => [] as string[]),
    createEarningsStore().symbols().catch(() => [] as string[]),
  ]);
  const { counts } = bucketByPrefix(keys);
  const provider = process.env.THRESHER_PROVIDER === 'mock' ? 'mock' : 'yahoo';
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev';

  return (
    <>
      <h1 className={styles.h1}>Overview</h1>

      <section className={styles.card}>
        <h2 className={styles.h2}>Connection</h2>
        <dl className={styles.kv}>
          <dt>Backend</dt>
          <dd>{redis ? 'Upstash (durable)' : 'in-memory (per-isolate)'}</dd>
          <dt>Status</dt>
          <dd data-testid="internal-status">
            <span
              className={`${styles.dot} ${health.ok ? styles.ok : redis ? styles.bad : styles.warn}`}
            />
            {health.ok ? `reachable · ${health.ms} ms` : redis ? 'unreachable' : 'not configured'}
          </dd>
          <dt>Total keys</dt>
          <dd>{total ?? '—'}</dd>
          <dt>Provider</dt>
          <dd>{provider}</dd>
        </dl>
      </section>

      <section className={styles.card}>
        <h2 className={styles.h2}>Environment</h2>
        <dl className={styles.kv}>
          {ENV_GROUPS.map((g) => {
            const on = g.keys.every((k) => Boolean(process.env[k]));
            return (
              <Fragment key={g.label}>
                <dt>{g.label}</dt>
                <dd>
                  <span className={`${styles.dot} ${on ? styles.ok : styles.bad}`} />
                  {on ? 'configured' : 'absent'}
                </dd>
              </Fragment>
            );
          })}
        </dl>
      </section>

      <section className={styles.card}>
        <h2 className={styles.h2}>Keys by prefix</h2>
        {redis ? (
          <dl className={styles.kv}>
            {KEY_PREFIXES.map((p) => (
              <Fragment key={p.prefix}>
                <dt>
                  {p.label} <span className={styles.dim}>{p.prefix}*</span>
                </dt>
                <dd>{counts[p.prefix]}</dd>
              </Fragment>
            ))}
          </dl>
        ) : (
          <p className={styles.note}>
            Requires Upstash — in-memory mode has no server keyspace to scan.
          </p>
        )}
      </section>

      <section className={styles.card}>
        <h2 className={styles.h2}>Coverage &amp; versions</h2>
        <dl className={styles.kv}>
          <dt>Followed symbols</dt>
          <dd>{followed.length}</dd>
          <dt>Earnings symbols captured</dt>
          <dd>{earningsSymbols.length}</dd>
          <dt>App version</dt>
          <dd>{appVersion}</dd>
          <dt>Engine version</dt>
          <dd>{ENGINE_VERSION}</dd>
          <dt>Config hash</dt>
          <dd>{configHash}</dd>
        </dl>
      </section>
    </>
  );
}
