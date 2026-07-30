import { Suspense } from 'react';
import AnalyzeApp from '../../components/AnalyzeApp';

// AnalyzeApp reads ?symbol=&timeframe= via useSearchParams, which requires a
// Suspense boundary above it in the App Router.
export default function AnalyzeRoute() {
  return (
    <Suspense>
      <AnalyzeApp />
    </Suspense>
  );
}
