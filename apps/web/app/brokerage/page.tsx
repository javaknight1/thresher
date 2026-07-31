/**
 * Brokerage page (/brokerage) — affiliate partners. Public. Links are marked
 * rel="sponsored" and an affiliate disclosure is shown (FTC). Two groups: general
 * brokers to open an account with, and API brokers that could support one-click
 * execution from Thresher later. Lists + URLs live in lib/brokerages.ts.
 */
import { BROKERAGES, API_BROKERAGES, BROKERAGE_DISCLOSURE, type Brokerage } from '../../lib/brokerages';
import SiteHeader from '../../components/SiteHeader';
import Logo from '../../components/Logo';
import Footer from '../../components/Footer';
import styles from './brokerage.module.css';

export const metadata = {
  title: 'Brokerages — Thresher',
  description: 'Where to place the trades — brokerage partners.',
};

function BrokerageCard({ b }: { b: Brokerage }) {
  return (
    <div className={styles.card} data-testid={`brokerage-${b.name}`}>
      <div className={styles.cardHead}>
        <Logo domain={b.domain} label={b.name} size={38} />
        <div>
          <div className={styles.cardTag}>{b.tag}</div>
          <h2 className={styles.cardName}>{b.name}</h2>
        </div>
      </div>
      <p className={styles.cardBlurb}>{b.blurb}</p>
      <a className={styles.cardCta} href={b.href} target="_blank" rel="sponsored noopener noreferrer">
        Open an account →
      </a>
    </div>
  );
}

export default function BrokeragePage() {
  return (
    <>
      <SiteHeader />
      <div className={styles.page} data-testid="brokerage-page">
        <section className={styles.intro}>
          <div className={styles.kicker}>brokerages</div>
          <h1 className={styles.title}>Where to place the trades</h1>
          <p className={styles.sub}>
            Thresher doesn’t execute orders — it hands you a defined-risk plan. These are established
            brokers you can open an account with to act on it.
          </p>
          <p className={styles.disclosure}>{BROKERAGE_DISCLOSURE}</p>
        </section>

        <section className={styles.grid}>
          {BROKERAGES.map((b) => (
            <BrokerageCard key={b.name} b={b} />
          ))}
        </section>

        <section className={styles.intro} data-testid="api-brokerages">
          <div className={styles.kicker}>api brokerages</div>
          <h2 className={styles.title}>Brokers with a trading API</h2>
          <p className={styles.sub}>
            These expose a trading API (OAuth) — the groundwork for connecting a broker and, one day,
            sending a trade to it in one click from Thresher. Nothing here executes trades yet.
          </p>
        </section>

        <section className={styles.grid}>
          {API_BROKERAGES.map((b) => (
            <BrokerageCard key={b.name} b={b} />
          ))}
        </section>

        <Footer />
      </div>
    </>
  );
}
