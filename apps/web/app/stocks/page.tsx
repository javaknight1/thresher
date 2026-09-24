/**
 * /stocks — the equity-only board (what the Leaderboard was before it became the
 * combined stocks + crypto view). A ScanApp pinned to the 'equity' scope.
 */
import ScanApp from '../../components/ScanApp';

export const metadata = { title: 'Stocks — Thresher' };

export default function StocksPage() {
  return <ScanApp scope="equity" />;
}
