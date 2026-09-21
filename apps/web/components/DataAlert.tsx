/**
 * DataAlert — a non-blocking banner pinned at the top of a data view when we
 * couldn't get fresh data but still have something to show (served-stale bars,
 * a hit rate limit / quota, or a provider outage with a cached fallback). It
 * never replaces the content below it; it just flags that the numbers may be
 * behind. Hard failures (unknown symbol, network down, no data at all) still
 * use the blocking error banner instead.
 */
import styles from './DataAlert.module.css';

export type DataAlertVariant = 'stale' | 'rate-limited' | 'unavailable' | 'historical';

const TITLES: Record<DataAlertVariant, string> = {
  stale: 'Showing cached data',
  'rate-limited': 'Request limit reached',
  unavailable: 'Live data unavailable',
  historical: 'Historical analysis',
};

const ICONS: Record<DataAlertVariant, string> = {
  stale: '⚠',
  'rate-limited': '⚠',
  unavailable: '⚠',
  historical: '🕐',
};

export default function DataAlert({
  variant,
  message,
}: {
  variant: DataAlertVariant;
  message: string;
}) {
  return (
    <div
      className={styles.alert}
      data-testid="data-alert"
      data-variant={variant}
      role="status"
      aria-live="polite"
    >
      <span className={styles.icon} aria-hidden="true">
        {ICONS[variant]}
      </span>
      <div>
        <div className={styles.title}>{TITLES[variant]}</div>
        <div className={styles.message}>{message}</div>
      </div>
    </div>
  );
}
