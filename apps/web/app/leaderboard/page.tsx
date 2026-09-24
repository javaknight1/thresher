/**
 * /leaderboard — the combined board: the best stock AND crypto setups ranked
 * together. A ScanApp in 'all' mode, which merges the two per-scope boards
 * client-side. Protected by middleware when Clerk is configured; open otherwise.
 */
import ScanApp from '../../components/ScanApp';

export const metadata = { title: 'Leaderboard — Thresher' };

export default function LeaderboardPage() {
  return <ScanApp scope="all" />;
}
