/**
 * Deterministic monogram badge — a colored tile with 1–2 initials, used as an
 * icon for stocks (ticker) and brokerages (name). Self-contained (no external
 * logo service), always renders, and the color is a stable function of the
 * label so the same symbol always looks the same.
 */
import styles from './Monogram.module.css';

function initials(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return label.slice(0, 2).toUpperCase();
}

function hueFor(label: string): number {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) % 360;
  return h;
}

export interface MonogramProps {
  label: string;
  /** px size of the square tile */
  size?: number;
}

export default function Monogram({ label, size = 24 }: MonogramProps) {
  return (
    <span
      className={styles.badge}
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        fontSize: Math.round(size * 0.42),
        background: `hsl(${hueFor(label)} 48% 42%)`,
      }}
    >
      {initials(label)}
    </span>
  );
}
