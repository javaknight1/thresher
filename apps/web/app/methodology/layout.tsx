import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { listSections } from '../../lib/methodology';
import SiteHeader from '../../components/SiteHeader';
import styles from './methodology.module.css';

export const metadata: Metadata = {
  title: 'Methodology — Thresher',
  description:
    'Every number the engine produces, derived from first principles: indicator formulas, signal families, confidence, stops, targets, and refusal gates.',
};

export default function MethodologyLayout({ children }: { children: ReactNode }) {
  const indicators = listSections('indicators');
  const engine = listSections('engine');

  return (
    <>
      <SiteHeader showBack />
      <div className={styles.shell}>
        <div className={styles.body}>
        <nav className={`panel ${styles.nav}`} aria-label="Methodology sections">
          <Link href="/methodology" className={styles.navLink}>
            Overview &amp; pipeline
          </Link>

          <p className={`kicker ${styles.navGroup}`}>Part I — Indicators</p>
          <ul className={styles.navList}>
            {indicators.map((section) => (
              <li key={section.slug}>
                <Link href={`/methodology/indicators/${section.slug}`} className={styles.navLink}>
                  <span className={styles.navNum}>{section.number}</span>
                  {section.shortTitle}
                </Link>
              </li>
            ))}
          </ul>

          <p className={`kicker ${styles.navGroup}`}>Part II — Determination</p>
          <ul className={styles.navList}>
            {engine.map((section) => (
              <li key={section.slug}>
                <Link href={`/methodology/engine/${section.slug}`} className={styles.navLink}>
                  <span className={styles.navNum}>{section.number}</span>
                  {section.shortTitle}
                </Link>
              </li>
            ))}
          </ul>

          <p className={`kicker ${styles.navGroup}`}>Appendix</p>
          <ul className={styles.navList}>
            <li>
              <Link href="/methodology/example" className={styles.navLink}>
                <span className={styles.navNum}>II.9</span>
                Worked example
              </Link>
            </li>
            <li>
              <Link href="/methodology/limitations" className={styles.navLink}>
                <span className={styles.navNum}>II.10</span>
                Limitations
              </Link>
            </li>
          </ul>
        </nav>

        <main>{children}</main>
        </div>
      </div>
    </>
  );
}
