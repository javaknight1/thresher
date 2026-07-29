'use client';

/**
 * NO TRADE state — a first-class design, not an error (design §6.2).
 * Shows which gate refused (in plain English, not just "G2"), the engine's
 * reason (what would need to change), a short explainer of what the gates are,
 * and the S/R levels it is watching.
 */
import Link from 'next/link';
import type { GateId, Refusal } from '@thresher/engine';
import type { AnalyzeResponse } from '../lib/api-types';
import styles from './TradeCard.module.css';

export interface NoTradeProps {
  refusal: Refusal | null;
  levels: AnalyzeResponse['levels'];
  price: number;
}

const fmtUsd = (x: number) => `$${x.toFixed(2)}`;

/**
 * Plain-English name + the question each refusal gate asks (methodology II.7).
 * The engine evaluates them in order and stops at the first that fails.
 */
const GATE_INFO: Record<GateId, { name: string; question: string }> = {
  G1: { name: 'Edge', question: 'Is there a clear directional bias at all?' },
  G2: { name: 'Conviction', question: 'Do the signals agree strongly enough?' },
  G3: { name: 'Structure', question: 'Is the reward worth the risk?' },
  G4: { name: 'Expected value', question: 'Does the edge beat break-even after the odds?' },
  G5: { name: 'Event risk', question: 'Is an earnings report too close?' },
};

const GATE_ORDER: GateId[] = ['G1', 'G2', 'G3', 'G4', 'G5'];

export default function NoTrade({ refusal, levels, price }: NoTradeProps) {
  const failed = refusal?.gate ?? null;
  const failedName = failed ? GATE_INFO[failed].name : null;

  return (
    <div data-testid="no-trade" className={styles.noTrade}>
      <div className={`mono ${styles.noTradeGate}`}>
        {refusal ? `NO TRADE · ${failedName} gate (${refusal.gate})` : 'NO TRADE'}
      </div>
      {refusal && <p className={styles.noTradeReason}>{refusal.reason}</p>}

      <div className={styles.gatesExplainer}>
        <div className="kicker">What are gates?</div>
        <p className={styles.gatesIntro}>
          Before proposing a trade, Thresher runs five checks in order — its
          “gates.” It only shows a plan when all five pass; otherwise it stops at
          the first that fails and refuses, rather than dress up a weak setup.{' '}
          <Link href="/methodology" className="deep-link">
            How the gates work →
          </Link>
        </p>
        <ol className={styles.gateList}>
          {GATE_ORDER.map((id) => (
            <li
              key={id}
              className={id === failed ? styles.gateItemFailed : styles.gateItem}
            >
              <span className="mono">{id}</span> {GATE_INFO[id].name} —{' '}
              {GATE_INFO[id].question}
              {id === failed && <span className={styles.gateFailedTag}> · stopped here</span>}
            </li>
          ))}
        </ol>
      </div>

      <div>
        <div className="kicker">Levels the engine is watching</div>
        <div className={`mono ${styles.levels}`}>
          <div className={styles.levelR}>
            R {fmtUsd(levels.resistance)}
            {levels.synthetic.resistance && (
              <span className={styles.levelNote}> · projected (no pivot)</span>
            )}
          </div>
          <div className={styles.levelNow}>· {fmtUsd(price)}</div>
          <div className={styles.levelS}>
            S {fmtUsd(levels.support)}
            {levels.synthetic.support && (
              <span className={styles.levelNote}> · projected (no pivot)</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
