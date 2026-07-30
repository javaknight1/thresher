/**
 * Brokerage page (/brokerage) — affiliate partners. Public. Links are marked
 * rel="sponsored" and an affiliate disclosure is shown (FTC). The list + URLs
 * live in lib/brokerages.ts (replace the placeholder hrefs with real links).
 */
import { BROKERAGES, BROKERAGE_DISCLOSURE } from '../../lib/brokerages';
import SiteHeader from '../../components/SiteHeader';
import Monogram from '../../components/Monogram';
import Footer from '../../components/Footer';
import styles from './brokerage.module.css';

export const metadata = {
  title: 'Brokerages — Thresher',
  description: 'Where to place the trades — brokerage partners.',
};

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
          <div key={b.name} className={styles.card} data-testid={`brokerage-${b.name}`}>
            <div className={styles.cardHead}>
              <Monogram label={b.name} size={38} />
              <div>
                <div className={styles.cardTag}>{b.tag}</div>
                <h2 className={styles.cardName}>{b.name}</h2>
              </div>
            </div>
            <p className={styles.cardBlurb}>{b.blurb}</p>
            <a
              className={styles.cardCta}
              href={b.href}
              target="_blank"
              rel="sponsored noopener noreferrer"
            >
              Open an account →
            </a>
          </div>
        ))}
      </section>

      <Footer />
      </div>
    </>
  );
}
