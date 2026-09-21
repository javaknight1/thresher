'use client';

/**
 * A deliberately small, low-key control: "analyze as of a past time". Reveals a
 * datetime picker that re-runs the current analysis as of that instant (a
 * point-in-time replay — see lib/analyze-service asOf). Not a headline CTA; it's
 * a trust/debugging tool, so it hides behind a tiny hyperlink until opened.
 */
import { useState } from 'react';
import styles from './AsOfControl.module.css';

/** ISO → the `yyyy-MM-ddThh:mm` shape a <input type="datetime-local"> expects (local time). */
function toLocalInput(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AsOfControl({
  asOf,
  onApply,
}: {
  /** current as-of ISO string, or null when analyzing live */
  asOf: string | null;
  /** apply a new as-of (ISO), or null to return to live */
  onApply: (iso: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(() => toLocalInput(asOf));

  const openPicker = () => {
    setValue(toLocalInput(asOf));
    setOpen(true);
  };

  const apply = () => {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return;
    onApply(d.toISOString());
    setOpen(false);
  };

  // Editing (picker open) takes priority over the active/idle summaries.
  if (open) {
    return (
      <div className={styles.row} data-testid="asof-picker">
        <input
          type="datetime-local"
          className={styles.input}
          value={value}
          max={toLocalInput(null)}
          onChange={(e) => setValue(e.target.value)}
          data-testid="asof-input"
          aria-label="Analyze as of date and time"
        />
        <button className={styles.apply} data-testid="asof-apply" disabled={!value} onClick={apply}>
          Apply
        </button>
        <button className={styles.link} onClick={() => setOpen(false)}>
          cancel
        </button>
      </div>
    );
  }

  // Active: a historical as-of is in effect — show it + change / back-to-live.
  if (asOf) {
    return (
      <div className={styles.row} data-testid="asof-active">
        <span className={styles.badge}>🕐 as of {new Date(asOf).toLocaleString()}</span>
        <button className={styles.link} onClick={openPicker}>
          change
        </button>
        <button className={styles.link} data-testid="asof-clear" onClick={() => onApply(null)}>
          back to live
        </button>
      </div>
    );
  }

  // Idle: the tiny hyperlink.
  return (
    <button className={styles.trigger} data-testid="asof-open" onClick={openPicker}>
      ↩ analyze as of a past time
    </button>
  );
}
