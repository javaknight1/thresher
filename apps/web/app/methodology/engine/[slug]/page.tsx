import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSection, listSlugs } from '../../../../lib/methodology';
import { MethodologyArticle } from '../../section';

export const dynamic = 'force-static';
export const dynamicParams = false;

type Params = Promise<{ slug: string }>;

export function generateStaticParams(): { slug: string }[] {
  return listSlugs('engine').map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const section = getSection('engine', slug);
  return { title: section ? `${section.shortTitle} — Thresher methodology` : 'Methodology — Thresher' };
}

export default async function EnginePage({ params }: { params: Params }) {
  const { slug } = await params;
  const section = getSection('engine', slug);
  if (!section) notFound();

  return (
    <MethodologyArticle
      kicker={`Methodology · Engine · ${section.number}`}
      title={section.title}
      markdown={section.markdown}
    />
  );
}
