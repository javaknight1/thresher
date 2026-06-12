import type { Metadata } from 'next';
import { getLimitations } from '../../../lib/methodology';
import { MethodologyArticle } from '../section';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Limitations — Thresher methodology',
};

/** II.10, rendered verbatim from the methodology doc — the doc requires it. */
export default function LimitationsPage() {
  const section = getLimitations();

  return (
    <MethodologyArticle
      kicker={`Methodology · ${section.number}`}
      title={section.title}
      markdown={section.markdown}
    />
  );
}
