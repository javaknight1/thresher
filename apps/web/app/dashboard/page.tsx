/**
 * Dashboard (/dashboard) — protected landing hub. Intentionally light for now:
 * quick actions + a preview of what's coming (watchlist, recent, alerts, the
 * hit-rate board). Personalized widgets land as those features ship.
 */
import Link from 'next/link';
import SiteHeader from '../../components/SiteHeader';
import Footer from '../../components/Footer';
import { IconLeaderboard, IconSearch, IconBrokerage } from '../../components/icons';
import styles from './dashboard.module.css';

export const metadata = { title: 'Dashboard — Thresher' };

const QUICK = [
  {
    href: '/app',
    title: 'Leaderboard',
    body: 'Today’s top setups across every candle size.',
    Icon: IconLeaderboard,
  },
  {
    href: '/analyze',
    title: 'Search a ticker',
    body: 'Full trade plan for any symbol — or an honest refusal.',
    Icon: IconSearch,
  },
  {
    href: '/brokerage',
    title: 'Brokerages',
    body: 'Where to open an account and place the trades.',
    Icon: IconBrokerage,
  },
];

const COMING = [
  { title: 'Watchlist', body: 'Scan your own symbols, not just the curated universe.' },
  { title: 'Recent analyses', body: 'Jump back to the tickers you’ve looked at.' },
  { title: 'Alerts', body: 'Get notified when a watched name first triggers a setup.' },
  { title: 'Track record', body: 'Hit-rate by confidence bucket once outcomes are labeled.' },
];

export default function DashboardPage() {
  return (
    <div className={styles.page} data-testid="dashboard-page">
      <SiteHeader />

      <section className={styles.intro}>
        <h1 className={styles.title}>Dashboard</h1>
        <p className={styles.sub}>Your home base. Jump into the board, or search a ticker.</p>
      </section>

      <section className={styles.quick}>
        {QUICK.map(({ href, title, body, Icon }) => (
          <Link key={href} href={href} className={styles.card}>
            <Icon className={styles.cardIcon} />
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
  );
}
