'use client';

/**
 * Shared app header — the same on every app/reference page. Icon+text links:
 * Dashboard, Leaderboard (the Top board), Search (per-symbol), Brokerage
 * (affiliate partners), and the profile menu. A back button appears only on the
 * reference pages (/guide, /methodology) per design.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AuthNav from './AuthNav';
import { IconDashboard, IconLeaderboard, IconSearch, IconBrokerage } from './icons';
import styles from './SiteHeader.module.css';

export interface SiteHeaderProps {
  /** show a Back button (reference pages only) */
  showBack?: boolean;
}

const LINKS = [
  { href: '/dashboard', label: 'Dashboard', Icon: IconDashboard, testid: 'nav-dashboard' },
  { href: '/app', label: 'Leaderboard', Icon: IconLeaderboard, testid: 'nav-leaderboard' },
  { href: '/analyze', label: 'Search', Icon: IconSearch, testid: 'nav-search' },
  { href: '/brokerage', label: 'Brokerage', Icon: IconBrokerage, testid: 'nav-brokerage' },
] as const;

export default function SiteHeader({ showBack = false }: SiteHeaderProps) {
  const router = useRouter();
  return (
    <header className={styles.header} data-testid="site-header">
      <div className={styles.left}>
        {showBack && (
          <button className={styles.back} onClick={() => router.back()} data-testid="nav-back">
            ← Back
          </button>
        )}
        <Link href="/app" className={styles.wordmark}>
          THRESHER
        </Link>
      </div>

      <nav className={styles.nav} aria-label="primary">
        {LINKS.map(({ href, label, Icon, testid }) => (
          <Link key={href} href={href} className={styles.link} data-testid={testid}>
            <Icon className={styles.icon} />
            <span className={styles.label}>{label}</span>
          </Link>
        ))}
        <AuthNav />
      </nav>
    </header>
  );
}
