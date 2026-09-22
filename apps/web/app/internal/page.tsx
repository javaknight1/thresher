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
import { fetchUpstashUsage } from '../../lib/internal/usage';
import styles from './internal.module.css';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const mb = (b: number | null | undefined): string =>
  b == null ? '—' : `${(b / 1024 / 1024).toFixed(1)} MB`;
const pctOf = (used: number | null | undefined, cap: number | null | undefined): number | null =>
  used != null && cap ? Math.round((used / cap) * 100) : null;
const dotFor = (p: number | null): string =>
  p == null ? styles.dim : p >= 90 ? styles.bad : p >= 70 ? styles.warn : styles.ok;

const ENV_GROUPS: ReadonlyArray<{ label: string; keys: string[] }> = [
  { label: 'Upstash', keys: ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'] },
  { label: 'Supabase', keys: ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] },
  { label: 'Clerk', keys: ['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'CLERK_SECRET_KEY'] },
  { label: 'Cron secret', keys: ['CRON_SECRET'] },
  { label: 'logo.dev', keys: ['NEXT_PUBLIC_LOGO_DEV_TOKEN'] },
];

export default async function InternalOverview() {
  const redis = redisConfigured();
  const [health, total, keys, followed, earningsSymbols, usage] = await Promise.all([
    ping(),
    dbsize(),
    scanKeys('*', 1000),
    createFollowStore().allSymbols().catch(() => [] as string[]),
    createEarningsStore().symbols().catch(() => [] as string[]),
    fetchUpstashUsage(),
  ]);
  const { counts } = bucketByPrefix(keys);
  const provider = process.env.THRESHER_PROVIDER === 'mock' ? 'mock' : 'yahoo';
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev';

  // Project month-end command usage from the run-rate so far.
  const cmdPct = pctOf(usage.commandsThisMonth, usage.commandLimit);
  const storPct = pctOf(usage.storageBytes, usage.storageLimit);
  const dom = new Date().getDate();
  const dim = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const projected =
    usage.commandsThisMonth != null ? Math.round((usage.commandsThisMonth / dom) * dim) : null;
  const projPct = pctOf(projected, usage.commandLimit);

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
        <h2 className={styles.h2}>Upstash quota</h2>
        {!usage.configured ? (
          <p className={styles.note}>
            Set UPSTASH_EMAIL / UPSTASH_API_KEY / UPSTASH_REDIS_ID (the Management API — a
            separate credential from the Redis token) to enable the quota panel.
          </p>
        ) : usage.error ? (
          <p className={styles.note}>Management API error: {usage.error}</p>
        ) : (
          <dl className={styles.kv}>
            <dt>Database</dt>
            <dd>
              {usage.dbName ?? '—'}
              {usage.region ? ` · ${usage.region}` : ''}
            </dd>
            <dt>Commands this month</dt>
            <dd>
              <span className={`${styles.dot} ${dotFor(cmdPct)}`} />
              {usage.commandsThisMonth?.toLocaleString() ?? '—'} /{' '}
              {usage.commandLimit?.toLocaleString() ?? '—'}
              {cmdPct != null ? ` (${cmdPct}%)` : ''}
            </dd>
            <dt>Projected month-end</dt>
            <dd>
              {projected != null
                ? `${projected.toLocaleString()}${projPct != null ? ` (${projPct}%)` : ''}`
                : '—'}
            </dd>
            <dt>Storage</dt>
            <dd>
              <span className={`${styles.dot} ${dotFor(storPct)}`} />
              {mb(usage.storageBytes)} / {mb(usage.storageLimit)}
              {storPct != null ? ` (${storPct}%)` : ''}
            </dd>
            <dt>Bandwidth (month)</dt>
            <dd>{mb(usage.bandwidthBytes)}</dd>
          </dl>
        )}
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
