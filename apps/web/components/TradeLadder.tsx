'use client';

/**
 * Trade ladder — the signature element (design §6.1–§6.2 item 3).
 * With a plan: a vertical proportional gauge, stop→entry→target positioned by
 * actual price distances so R:R is visible before it's read. Without a plan:
 * the levels readout (§6.2 NO TRADE design).
 */
import Link from 'next/link';
import type { AnalyzeResponse } from '../lib/api-types';
import styles from './TradeLadder.module.css';

function fmt(x: number): string {
  return `$${x.toFixed(2)}`;
}

export function TradeLadder({ data }: { data: AnalyzeResponse }) {
  const { plan, direction, levels, price } = data;

  if (!plan) {
    return (
      <section className={`panel ${styles.root}`}>
        <h2 className={`kicker ${styles.heading}`}>Trade ladder</h2>
        <div className={styles.noLadder}>
          <p className={styles.noLadderText}>
            No ladder — the engine isn&apos;t offering a trade here. Levels it&apos;s watching:
          </p>
          <div className={`mono ${styles.levels}`}>
            <Link
              href="/methodology/indicators/pivots"
              className={`deep-link ${styles.resistance}`}
            >
              R {fmt(levels.resistance)}
            </Link>
            <span className={styles.closeLevel}>· {fmt(price)}</span>
            <Link href="/methodology/indicators/pivots" className={`deep-link ${styles.support}`}>
              S {fmt(levels.support)}
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const lo = Math.min(plan.stop, plan.target, plan.entry);
  const hi = Math.max(plan.stop, plan.target, plan.entry);
  const span = hi - lo || 1;
  /** % from the top of the gauge */
  const pos = (p: number): number => ((hi - p) / span) * 100;

  const rewardTop = pos(direction === 'long' ? plan.target : plan.entry);
  const rewardHeight = Math.abs(pos(plan.entry) - pos(plan.target));
  const riskTop = pos(direction === 'long' ? plan.entry : plan.stop);
  const riskHeight = Math.abs(pos(plan.entry) - pos(plan.stop));

  const rows = [
    {
      key: 'target',
      name: 'TARGET',
      price: plan.target,
      sub: `+${plan.rewardPct.toFixed(1)}%`,
      colorClass: styles.nameTarget,
      href: '/methodology/engine/targets',
    },
    {
      key: 'entry',
      name: 'ENTRY',
      price: plan.entry,
      sub: 'now',
      colorClass: styles.nameEntry,
      href: '/methodology/example',
    },
    {
      key: 'stop',
      name: 'STOP',
      price: plan.stop,
      sub: `−${plan.riskPct.toFixed(1)}%`,
      colorClass: styles.nameStop,
      href: '/methodology/engine/stops',
    },
  ];

  return (
    <section className={`panel ${styles.root}`}>
      <h2 className={`kicker ${styles.heading}`}>Trade ladder</h2>
      <div className={styles.ladder} data-testid="trade-ladder">
        <div className={styles.gauge} aria-hidden="true">
          <div
            className={styles.rewardZone}
            style={{ top: `${rewardTop}%`, height: `${rewardHeight}%` }}
          />
          <div className={styles.riskZone} style={{ top: `${riskTop}%`, height: `${riskHeight}%` }} />
          <div className={styles.entryLine} style={{ top: `calc(${pos(plan.entry)}% - 1px)` }} />
        </div>
        <div className={styles.labels}>
          {rows.map((r) => (
            <div
              key={r.key}
              className={styles.row}
              style={{ top: `calc(${pos(r.price)}% - 16px)` }}
            >
              <div className={`mono ${styles.rowName} ${r.colorClass}`}>{r.name}</div>
              <Link href={r.href} className={`deep-link mono ${styles.rowPrice}`}>
                {fmt(r.price)} <span className={styles.rowSub}>{r.sub}</span>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default TradeLadder;
