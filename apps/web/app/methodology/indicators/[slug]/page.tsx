import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSection, listSlugs } from '../../../../lib/methodology';
import { MethodologyArticle } from '../../section';

export const dynamic = 'force-static';
export const dynamicParams = false;

type Params = Promise<{ slug: string }>;

export function generateStaticParams(): { slug: string }[] {
  return listSlugs('indicators').map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const section = getSection('indicators', slug);
  return { title: section ? `${section.shortTitle} — Thresher methodology` : 'Methodology — Thresher' };
}

export default async function IndicatorPage({ params }: { params: Params }) {
  const { slug } = await params;
  const section = getSection('indicators', slug);
  if (!section) notFound();

  return (
    <MethodologyArticle
      kicker={`Methodology · Indicators · ${section.number}`}
      title={section.title}
      markdown={section.markdown}
    />
  );
}
