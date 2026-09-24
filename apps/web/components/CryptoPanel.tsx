/**
 * Context panel for a coin — the crypto counterpart to CompanyPanel. Spot crypto
 * has no earnings/fundamentals, so instead of an all-dashes stats grid this
 * states plainly what the read is (and isn't). Display-only; never feeds the
 * engine.
 */
import styles from './CryptoPanel.module.css';

export default function CryptoPanel({ symbol }: { symbol: string }) {
  return (
    <section className={`panel ${styles.root}`} data-testid="crypto-panel">
      <h2 className={`kicker ${styles.heading}`}>About {symbol}</h2>
      <p className={styles.body}>
        Spot cryptocurrency — it trades 24/7, with no earnings or company fundamentals. This read
        is pure technical analysis on price and volume. Reported crypto volume is unreliable across
        exchanges, so the volume signal is weighted lightly, and stops are wider to allow for
        crypto’s larger swings.
      </p>
    </section>
  );
}
