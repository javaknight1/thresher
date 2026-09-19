/**
 * The brand mark — the amber "T" tile (same as the favicon) + THRESHER wordmark.
 * Shared by the app header (SiteHeader) and the marketing landing header so the
 * identity is identical everywhere. `href` lets each surface point it home
 * (landing → /, app → /leaderboard).
 */
import Link from 'next/link';
import styles from './Brandmark.module.css';

export default function Brandmark({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className={styles.wordmark} aria-label="Thresher home">
      <img src="/icon.svg" alt="" className={styles.mark} width={20} height={20} />
      THRESHER
    </Link>
  );
}
