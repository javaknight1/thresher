import type { Metadata } from 'next';
import Link from 'next/link';
import { getExample } from '../../../lib/methodology';
import { MethodologyArticle } from '../section';
import styles from '../methodology.module.css';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Worked example — Thresher methodology',
};

export default function ExamplePage() {
  const section = getExample();

  return (
    <MethodologyArticle
      kicker={`Methodology · ${section.number}`}
      title={section.title}
      markdown={section.markdown}
    >
      {/* This page shows a derived trade plan, so the disclaimer block renders
          here too (CLAUDE.md product rules; wording is methodology II.10 item 7). */}
      <aside className={styles.disclaimer} data-testid="disclaimer">
        <strong>Nothing here is financial advice.</strong> The engine reports the technical
        structure and the arithmetic of a defined-risk setup. The decision, and the risk, belong
        to the user. See{' '}
        <Link href="/methodology/limitations">what this engine cannot see</Link>.
      </aside>
    </MethodologyArticle>
  );
}
