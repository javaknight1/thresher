'use client';

/**
 * NO TRADE state — a first-class design, not an error (design §6.2).
 * Shows which gate refused, the engine's reason (what would need to change),
 * and the S/R levels it is watching.
 */
import type { Refusal } from '@thresher/engine';
import type { AnalyzeResponse } from '../lib/api-types';
import styles from './TradeCard.module.css';

export interface NoTradeProps {
  refusal: Refusal | null;
  levels: AnalyzeResponse['levels'];
  price: number;
}

const fmtUsd = (x: number) => `$${x.toFixed(2)}`;

export default function NoTrade({ refusal, levels, price }: NoTradeProps) {
  return (
    <div data-testid="no-trade" className={styles.noTrade}>
      <div className={`mono ${styles.noTradeGate}`}>
        {refusal ? `NO TRADE — GATE ${refusal.gate} REFUSED` : 'NO TRADE'}
      </div>
      {refusal && <p className={styles.noTradeReason}>{refusal.reason}</p>}
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
