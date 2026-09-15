import { Suspense } from 'react';
import type { Metadata } from 'next';
import AnalyzeApp from '../../components/AnalyzeApp';

const TF_LABEL: Record<string, string> = {
  intraday: 'Hourly',
  swing: 'Daily',
  position: 'Weekly',
};

/**
 * Rich link previews (Open Graph / Twitter) built from the ?symbol=&timeframe=
 * options, so a shared Analyze link shows a proper title + description instead
 * of a bare URL. (A dynamic preview *image* is a later stage; for now platforms
 * fall back to a text/summary card.)
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ symbol?: string | string[]; timeframe?: string | string[] }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const symbol = typeof sp.symbol === 'string' ? sp.symbol.toUpperCase() : null;
  const tfKey = typeof sp.timeframe === 'string' ? sp.timeframe : '';
  const tfLabel = TF_LABEL[tfKey] ?? 'Daily';

  const title = symbol ? `${symbol} — ${tfLabel} setup · Thresher` : 'Analyze a ticker · Thresher';
  const description = symbol
    ? `A defined-risk trade plan for ${symbol} (${tfLabel}) — entry, stop, target, and the reasoning behind them. Not financial advice.`
    : 'Enter a ticker for a complete, defined-risk trade plan — entry, stop, target, and the reasoning — or an honest no-trade.';

  return {
    title,
    description,
    openGraph: { title, description, type: 'website', siteName: 'Thresher' },
    twitter: { card: 'summary', title, description },
  };
}

// AnalyzeApp reads ?symbol=&timeframe= via useSearchParams, which requires a
// Suspense boundary above it in the App Router.
export default function AnalyzeRoute() {
  return (
    <Suspense>
      <AnalyzeApp />
    </Suspense>
  );
}
