'use client';

/**
 * Shared app header — a full-width bar with a fixed inner width, so it looks
 * identical on every page regardless of that page's content width. Icon+text
 * links to Dashboard, Leaderboard (/app), Search (/analyze), Brokerage, plus the
 * profile menu. The current page's link is highlighted. A back button appears
 * only on the reference pages (/guide, /methodology).
 */
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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
  const pathname = usePathname();
  return (
    <header className={styles.bar} data-testid="site-header">
      <div className={styles.inner}>
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
          {LINKS.map(({ href, label, Icon, testid }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`${styles.link} ${active ? styles.linkActive : ''}`}
                aria-current={active ? 'page' : undefined}
                data-testid={testid}
              >
                <Icon className={styles.icon} />
                <span className={styles.label}>{label}</span>
              </Link>
            );
          })}
          <AuthNav />
        </nav>
      </div>
    </header>
  );
}
