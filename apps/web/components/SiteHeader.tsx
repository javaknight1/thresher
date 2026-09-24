'use client';

/**
 * Shared app header — a full-width bar with a fixed inner width, so it looks
 * identical on every page regardless of that page's content width. Icon+text
 * links to Dashboard, Leaderboard (/leaderboard), Search (/analyze), Brokerage, plus the
 * profile menu. The current page's link is highlighted. A back button appears
 * only on the reference pages (/guide, /methodology).
 */
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import AuthNav from './AuthNav';
import Brandmark from './Brandmark';
import CommandPalette from './CommandPalette';
import {
  IconDashboard,
  IconLeaderboard,
  IconSearch,
  IconBrokerage,
  IconCrypto,
  IconStocks,
} from './icons';
import styles from './SiteHeader.module.css';

function openPalette() {
  window.dispatchEvent(new Event('thresher:command-palette'));
}

export interface SiteHeaderProps {
  /** show a Back button (reference pages only) */
  showBack?: boolean;
  /** logo-only bar — no nav links, command palette, or account menu (e.g. /internal) */
  minimal?: boolean;
}

const LINKS = [
  { href: '/dashboard', label: 'Dashboard', Icon: IconDashboard, testid: 'nav-dashboard' },
  { href: '/leaderboard', label: 'Leaderboard', Icon: IconLeaderboard, testid: 'nav-leaderboard' },
  { href: '/stocks', label: 'Stocks', Icon: IconStocks, testid: 'nav-stocks' },
  { href: '/crypto', label: 'Crypto', Icon: IconCrypto, testid: 'nav-crypto' },
  { href: '/analyze', label: 'Search', Icon: IconSearch, testid: 'nav-search' },
  { href: '/brokerage', label: 'Brokerage', Icon: IconBrokerage, testid: 'nav-brokerage' },
] as const;

export default function SiteHeader({ showBack = false, minimal = false }: SiteHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();

  // Logo-only bar: the Thresher mark and nothing else (no nav / palette / account).
  if (minimal) {
    return (
      <header className={styles.bar} data-testid="site-header">
        <div className={styles.inner}>
          <div className={styles.left}>
            <Brandmark href="/dashboard" />
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className={styles.bar} data-testid="site-header">
      <div className={styles.inner}>
        <div className={styles.left}>
          {showBack && (
            <button className={styles.back} onClick={() => router.back()} data-testid="nav-back">
              ← Back
            </button>
          )}
          <Brandmark href="/dashboard" />
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
          <button
            type="button"
            className={styles.cmdk}
            onClick={openPalette}
            data-testid="cmdk-open"
            aria-label="Open command palette"
            title="Search — ⌘K"
          >
            <IconSearch className={styles.icon} />
            <span className={styles.cmdkKey}>⌘K</span>
          </button>
          <AuthNav />
        </nav>
      </div>
      <CommandPalette />
    </header>
  );
}
