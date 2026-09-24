'use client';

/**
 * Position-sizing calculator — turns a plan's entry/stop plus the user's account
 * size and per-trade risk into a concrete share count. Inputs live in the shared
 * prefs store (lib/prefs): Clerk metadata when signed in (so they follow you
 * across devices), localStorage otherwise. Settable here or on /settings.
 */
import { useEffect, useRef } from 'react';
import { positionSize } from '../lib/position-size';
import { usePrefs } from '../lib/prefs';
import styles from './PositionSizer.module.css';

const RISK_OPTIONS = [0.5, 1, 2, 3] as const;
// Pre-prefs per-browser keys; migrated once into prefs below.
const LEGACY_ACCOUNT_KEY = 'thresher:accountSize';
const LEGACY_RISK_KEY = 'thresher:riskPct';

const money = (x: number) => `$${Math.round(x).toLocaleString()}`;
const pct = (fraction: number) => `${(fraction * 100).toFixed(1)}%`;

export default function PositionSizer({
  entry,
  stop,
  unitStep = 1,
  unitLabel = 'shares',
}: {
  entry: number;
  stop: number;
  /** tradable increment: 1 = whole shares (equity), <1 = fractional (crypto) */
  unitStep?: number;
  /** display noun for a unit ('shares' | 'units') */
  unitLabel?: string;
}) {
  const { prefs, loaded, setPref, setPrefs } = usePrefs();
  const account = prefs.accountSize;
  const riskPct = prefs.riskPct;

  // One-time migration of the old per-browser sizer keys into prefs.
  const migrated = useRef(false);
  useEffect(() => {
    if (!loaded || migrated.current) return;
    migrated.current = true;
    if (prefs.accountSize) return; // already set — nothing to migrate
    try {
      const a = localStorage.getItem(LEGACY_ACCOUNT_KEY);
      const r = localStorage.getItem(LEGACY_RISK_KEY);
      const patch: Partial<typeof prefs> = {};
      if (a) patch.accountSize = a.replace(/[^0-9.]/g, '');
      if (r && Number(r) > 0) patch.riskPct = Number(r);
      if (Object.keys(patch).length) setPrefs(patch);
    } catch {
      /* localStorage unavailable — fine */
    }
  }, [loaded, prefs.accountSize, setPrefs]);

  const onAccount = (raw: string) => setPref('accountSize', raw.replace(/[^0-9.]/g, ''));
  const onRisk = (r: number) => setPref('riskPct', r);

  const accountSize = Number(account);
  const result = positionSize({ accountSize, riskPct, entry, stop, unitStep });
  const fractional = unitStep < 1;
  const fmtUnits = (n: number) =>
    n.toLocaleString(undefined, { maximumFractionDigits: fractional ? 6 : 0 });

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
              {fmtUnits(result.shares)}
            </span>
            <span className={styles.sharesLabel}>{unitLabel}</span>
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
              <dt>Risk / {fractional ? 'unit' : 'share'}</dt>
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
        Illustrative — the size is quantized down to the tradable increment so your actual risk
        never exceeds the amount you set. Not advice.
      </p>
    </section>
  );
}
