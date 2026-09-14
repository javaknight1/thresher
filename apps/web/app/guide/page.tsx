/**
 * Guide page (public, /guide) — the friendly walkthrough: what Thresher does,
 * how to read the board and a trade plan, the five gates, and a glossary. The
 * exhaustive reference lives in /methodology; this is the on-ramp. Content comes
 * from lib/guide-content (shared with the onboarding wizard).
 */
import Link from 'next/link';
import { GUIDE_SECTIONS, GLOSSARY } from '../../lib/guide-content';
import SiteHeader from '../../components/SiteHeader';
import Footer from '../../components/Footer';
import PageHero from '../../components/PageHero';
import GuideIntroButton from '../../components/GuideIntroButton';
import styles from './guide.module.css';

export const metadata = {
  title: 'Guide — Thresher',
  description: 'How to read the board, a trade plan, and the terms — the bare minimum to get started.',
};

export default function GuidePage() {
  return (
    <>
      <SiteHeader showBack />
      <div className={styles.page} data-testid="guide-page">
        <PageHero
          kicker="the guide"
          title="Everything you need to get started"
          actions={<GuideIntroButton />}
        >
          Thresher turns a ticker into a complete, defined-risk trade — or an honest “no trade”.
          Here’s how to read what it shows. For the full formulas behind every number, see the{' '}
          <Link href="/methodology" className="deep-link">
            methodology
          </Link>
          .
        </PageHero>

      {GUIDE_SECTIONS.map((s, i) => (
        <section key={s.id} className={styles.section} data-testid={`guide-section-${s.id}`}>
          <div className={styles.sectionNum}>{String(i + 1).padStart(2, '0')}</div>
          <div className={styles.sectionBody}>
            <h2 className={styles.sectionTitle}>{s.title}</h2>
            <p className={styles.lead}>{s.lead}</p>
            <ul className={styles.points}>
              {s.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        </section>
      ))}

      <section className={styles.glossary}>
        <h2 className={styles.sectionTitle}>Glossary</h2>
        <dl className={styles.terms}>
          {GLOSSARY.map((g) => (
            <div key={g.term} className={styles.termRow}>
              <dt className={styles.term}>{g.term}</dt>
              <dd className={styles.def}>{g.def}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={styles.honest}>
        <p className={styles.lead}>
          Before you rely on it, read{' '}
          <Link href="/methodology/limitations" className="deep-link">
            what the engine cannot see
          </Link>
          .
        </p>
        <Link href="/leaderboard" className={styles.openBtnLarge}>
          Open the board →
        </Link>
      </section>

        <Footer />
      </div>
    </>
  );
}
