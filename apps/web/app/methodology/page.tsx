import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getOverview, listSections } from '../../lib/methodology';
import styles from './methodology.module.css';

export const dynamic = 'force-static';

export default function MethodologyOverviewPage() {
  const overview = getOverview();
  const indicators = listSections('indicators');
  const engine = listSections('engine');

  return (
    <article className={styles.article}>
      <p className="kicker">Methodology</p>
      <h1 className={styles.title}>Methodology Reference</h1>

      <div className={styles.markdown}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{overview}</ReactMarkdown>
      </div>

      <p className={`kicker ${styles.gridLabel}`}>Part I — Indicators</p>
      <div className={styles.grid}>
        {indicators.map((section) => (
          <Link
            key={section.slug}
            href={`/methodology/indicators/${section.slug}`}
            className={styles.cardLink}
          >
            <span className={styles.cardNum}>{section.number}</span>
            <span className={styles.cardTitle}>{section.shortTitle}</span>
          </Link>
        ))}
      </div>

      <p className={`kicker ${styles.gridLabel}`}>Part II — Determination</p>
      <div className={styles.grid}>
        {engine.map((section) => (
          <Link
            key={section.slug}
            href={`/methodology/engine/${section.slug}`}
            className={styles.cardLink}
          >
            <span className={styles.cardNum}>{section.number}</span>
            <span className={styles.cardTitle}>{section.shortTitle}</span>
          </Link>
        ))}
      </div>

      <p className={`kicker ${styles.gridLabel}`}>Appendix</p>
      <div className={styles.grid}>
        <Link href="/methodology/example" className={styles.cardLink}>
          <span className={styles.cardNum}>II.9</span>
          <span className={styles.cardTitle}>Worked example — end to end</span>
        </Link>
        <Link href="/methodology/limitations" className={styles.cardLink}>
          <span className={styles.cardNum}>II.10</span>
          <span className={styles.cardTitle}>Limitations — what this engine cannot see</span>
        </Link>
      </div>
    </article>
  );
}
