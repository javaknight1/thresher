'use client';

/**
 * Position-sizing calculator — turns a plan's entry/stop plus the user's account
 * size and per-trade risk into a concrete share count. Inputs persist in
 * localStorage (per browser) so they carry across analyses without a database.
 */
import { useEffect, useState } from 'react';
import { positionSize } from '../lib/position-size';
import styles from './PositionSizer.module.css';

const RISK_OPTIONS = [0.5, 1, 2, 3] as const;
const ACCOUNT_KEY = 'thresher:accountSize';
const RISK_KEY = 'thresher:riskPct';

const money = (x: number) => `$${Math.round(x).toLocaleString()}`;
const pct = (fraction: number) => `${(fraction * 100).toFixed(1)}%`;

export default function PositionSizer({ entry, stop }: { entry: number; stop: number }) {
  const [account, setAccount] = useState('');
  const [riskPct, setRiskPct] = useState(1);

  // Load saved inputs after mount (avoids a hydration mismatch).
  useEffect(() => {
    try {
      const a = localStorage.getItem(ACCOUNT_KEY);
      const r = localStorage.getItem(RISK_KEY);
      if (a) setAccount(a);
      if (r && Number(r) > 0) setRiskPct(Number(r));
    } catch {
      // localStorage unavailable — fine, just no persistence
    }
  }, []);

  const onAccount = (raw: string) => {
    const clean = raw.replace(/[^0-9.]/g, '');
    setAccount(clean);
    try {
      localStorage.setItem(ACCOUNT_KEY, clean);
    } catch {
      /* ignore */
    }
  };

  const onRisk = (r: number) => {
    setRiskPct(r);
    try {
      localStorage.setItem(RISK_KEY, String(r));
    } catch {
      /* ignore */
    }
  };

  const accountSize = Number(account);
  const result = positionSize({ accountSize, riskPct, entry, stop });

  return (
    <section className={`panel ${styles.root}`} data-testid="position-sizer">
      <h2 className={`kicker ${styles.heading}`}>Position size</h2>

      <div className={styles.inputs}>
        <label className={styles.field}>
          <span className={styles.label}>Account</span>
          <div className={styles.money}>
            <span className={styles.dollar}>$</span>
            <input
              className={styles.input}
              data-testid="ps-account"
              inputMode="decimal"
              value={account}
              onChange={(e) => onAccount(e.target.value)}
              placeholder="10,000"
              aria-label="Account size in dollars"
            />
          </div>
        </label>

        <div className={styles.field}>
          <span className={styles.label}>Risk / trade</span>
          <div className={styles.pills} role="group" aria-label="risk per trade">
            {RISK_OPTIONS.map((r) => (
              <button
                key={r}
                type="button"
                className={`${styles.pill} ${riskPct === r ? styles.pillActive : ''}`}
                aria-pressed={riskPct === r}
                onClick={() => onRisk(r)}
              >
                {r}%
              </button>
            ))}
          </div>
        </div>
      </div>

      {result ? (
        <div className={styles.result} data-testid="ps-result">
          <div className={styles.sharesRow}>
            <span className={styles.shares} data-testid="ps-shares">
              {result.shares.toLocaleString()}
            </span>
            <span className={styles.sharesLabel}>shares</span>
          </div>
          <dl className={styles.stats}>
            <div className={styles.stat}>
              <dt>Risk</dt>
              <dd>
                {money(result.actualRisk)}{' '}
                <span className={styles.muted}>({pct(result.actualRisk / accountSize)})</span>
              </dd>
            </div>
            <div className={styles.stat}>
              <dt>Position</dt>
              <dd>
                {money(result.positionValue)}{' '}
                <span className={styles.muted}>({pct(result.positionPct / 100)})</span>
              </dd>
            </div>
            <div className={styles.stat}>
              <dt>Risk / share</dt>
              <dd>{money(result.riskPerShare)}</dd>
            </div>
          </dl>
        </div>
      ) : (
        <div className={styles.hint} data-testid="ps-hint">
          Enter your account size to size this trade from its entry and stop.
        </div>
      )}

      <p className={styles.note}>
        Illustrative — whole shares are floored so your actual risk never exceeds the amount you
        set. Not advice.
      </p>
    </section>
  );
}
