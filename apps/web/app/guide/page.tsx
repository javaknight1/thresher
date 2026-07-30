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
import GuideIntroButton from '../../components/GuideIntroButton';
import styles from './guide.module.css';

export const metadata = {
  title: 'Guide — Thresher',
  description: 'How to read the board, a trade plan, and the terms — the bare minimum to get started.',
};

export default function GuidePage() {
  return (
    <div className={styles.page} data-testid="guide-page">
      <SiteHeader showBack />

      <section className={styles.intro}>
        <div className={styles.kicker}>the guide</div>
        <h1 className={styles.title}>Everything you need to get started</h1>
        <p className={styles.sub}>
          Thresher turns a ticker into a complete, defined-risk trade — or an honest “no trade”.
          Here’s how to read what it shows. For the full formulas behind every number, see the{' '}
          <Link href="/methodology" className="deep-link">
            methodology
          </Link>
          .
        </p>
        <GuideIntroButton />
      </section>

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
        <h2 className={styles.sectionTitle}>The honest part</h2>
        <p className={styles.lead}>
          “Agreement” and “illustrative EV” are exactly that — measures of how the signals line up,
          not predictions or promised returns. Nothing here is financial advice; the decision, and
          the risk, are yours. Read{' '}
          <Link href="/methodology/limitations" className="deep-link">
            what the engine cannot see
          </Link>{' '}
          before you rely on it.
        </p>
        <Link href="/app" className={styles.openBtnLarge}>
          Open the board →
        </Link>
      </section>

      <Footer />
    </div>
  );
}
