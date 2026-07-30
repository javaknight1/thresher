'use client';

/**
 * Trade card — design §6.2 item 2: ticker, price, direction badge, R:R,
 * four stat tiles with basis captions, then signal-agreement bar with
 * itemized penalties. NO TRADE is a first-class state (NoTrade).
 */
import type { AnalyzeResponse } from '../lib/api-types';
import StatTile from './StatTile';
import ConfidenceBar from './ConfidenceBar';
import NoTrade from './NoTrade';
import Logo from './Logo';
import styles from './TradeCard.module.css';

const DIRECTION_LABEL = { long: 'LONG', short: 'SHORT', none: 'NO TRADE' } as const;

const fmtUsd = (x: number) => `$${x.toFixed(2)}`;
/** "-8" → "−8" (typographic minus, matches the prototype). */
const fmtPoints = (points: number) => String(points).replace('-', '−');

export default function TradeCard({ data }: { data: AnalyzeResponse }) {
  const { plan, direction, confidence } = data;

  return (
    <section className={`panel ${styles.card}`} aria-label="trade card">
      <header className={styles.head}>
        <Logo ticker={data.symbol} label={data.symbol} size={28} />
        <span className={styles.ticker}>{data.symbol}</span>
        <span className={`mono ${styles.price}`}>{fmtUsd(data.price)}</span>
        <span
          data-testid="direction-badge"
          data-direction={direction}
          className={`mono ${styles.badge}`}
        >
          {DIRECTION_LABEL[direction]}
        </span>
        {plan && (
          <span className={`mono ${styles.rr}`}>
            {plan.rr.toFixed(1)}:1 <span className={styles.rrUnit}>R:R</span>
          </span>
        )}
      </header>

      {plan ? (
        <div className={styles.tiles}>
          <StatTile
            label="ENTRY"
            value={fmtUsd(plan.entry)}
            color="amber"
            caption="market / current"
            testId="stat-entry"
          />
          <StatTile
            label="STOP LOSS"
            value={fmtUsd(plan.stop)}
            color="short"
            caption={`−${plan.riskPct.toFixed(1)}% · ${plan.stopBasis}`}
            testId="stat-stop"
            href="/methodology/engine/stops"
          />
          <StatTile
            label="TARGET"
            value={fmtUsd(plan.target)}
            color="long"
            caption={
              <>
                +{plan.rewardPct.toFixed(1)}% · {plan.targetBasis}
                {plan.overheadWarning && (
                  <span className={styles.warn}>
                    ⚠ price must clear nearby{' '}
                    {direction === 'long' ? 'resistance' : 'support'} to reach the
                    projection
                  </span>
                )}
              </>
            }
            testId="stat-target"
            href="/methodology/engine/targets"
          />
          <StatTile
            label="ILLUSTRATIVE EV"
            value={`${plan.ev.value >= 0 ? '+' : '−'}${Math.abs(plan.ev.value).toFixed(1)}%`}
            color={plan.ev.value >= 0 ? 'long' : 'short'}
            caption="treats signal agreement as win-rate — not calibrated"
            testId="stat-ev"
            href="/methodology/engine/gates"
          />
        </div>
      ) : (
        <NoTrade refusal={data.refusal} levels={data.levels} price={data.price} />
      )}

      <div>
        <ConfidenceBar confidence={confidence} />
        {confidence.penalties.length > 0 && (
          <ul className={styles.penalties}>
            {confidence.penalties.map((p) => (
              <li key={p.reason} data-testid="penalty-item" className="mono">
                ⚠ {p.reason} ({fmtPoints(p.points)})
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
