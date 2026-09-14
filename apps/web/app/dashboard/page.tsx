/**
 * Dashboard (/dashboard) — the signed-in home. Centerpiece is the watchlist:
 * an autocomplete search to add follows + a leaderboard-style followed list.
 * Colorful quick-links and a short "coming soon" strip round it out.
 */
import type { CSSProperties } from 'react';
import Link from 'next/link';
import SiteHeader from '../../components/SiteHeader';
import Footer from '../../components/Footer';
import PageHero from '../../components/PageHero';
import DashboardFollows from '../../components/DashboardFollows';
import { IconLeaderboard, IconSearch, IconBrokerage } from '../../components/icons';
import styles from './dashboard.module.css';

export const metadata = { title: 'Dashboard — Thresher' };

const QUICK = [
  {
    href: '/leaderboard',
    title: 'Leaderboard',
    body: 'Today’s top setups across every candle size.',
    Icon: IconLeaderboard,
    accent: 'var(--amber)',
  },
  {
    href: '/analyze',
    title: 'Search a ticker',
    body: 'Full trade plan for any symbol — or an honest refusal.',
    Icon: IconSearch,
    accent: 'var(--long)',
  },
  {
    href: '/brokerage',
    title: 'Brokerages',
    body: 'Where to open an account and place the trades.',
    Icon: IconBrokerage,
    accent: '#6ea8fe',
  },
];

const COMING = [
  { title: 'Recent analyses', body: 'Jump back to the tickers you’ve looked at.' },
  { title: 'Alerts', body: 'Get notified when a followed name first triggers a setup.' },
  { title: 'Track record', body: 'Hit-rate by confidence bucket once outcomes are labeled.' },
];

export default function DashboardPage() {
  return (
    <>
      <SiteHeader />
      <div className={styles.page} data-testid="dashboard-page">
        <PageHero title="Your desk">
          Follow the names you care about — those are the ones Thresher scans and keeps warm.
        </PageHero>

        <section className={styles.watchlist}>
          <DashboardFollows />
        </section>

        <section className={styles.quick}>
          {QUICK.map(({ href, title, body, Icon, accent }) => (
            <Link
              key={href}
              href={href}
              className={styles.card}
              style={{ '--accent': accent } as CSSProperties}
            >
              <span className={styles.cardIconWrap}>
                <Icon className={styles.cardIcon} />
              </span>
              <div>
                <div className={styles.cardTitle}>{title}</div>
                <div className={styles.cardBody}>{body}</div>
              </div>
            </Link>
          ))}
        </section>

        <section className={styles.comingWrap}>
          <div className="kicker">Coming soon</div>
          <div className={styles.coming}>
            {COMING.map((c) => (
              <div key={c.title} className={styles.comingCard}>
                <div className={styles.comingTitle}>{c.title}</div>
                <div className={styles.comingBody}>{c.body}</div>
              </div>
            ))}
          </div>
        </section>

        <Footer />
      </div>
    </>
  );
}
