/**
 * GET /api/v1/boards — the cached boards for all three candle sizes in one
 * response (read-only; never recomputes or rate-limits). Lets a consumer that
 * just needs a read-only snapshot (e.g. the dashboard watchlist's trade lines)
 * make one request instead of three. Missing (never-warmed) timeframes are
 * simply omitted. Freshness is the cron's job — the per-timeframe /scan route
 * is what recomputes / force-refreshes.
 */
import { NextResponse } from 'next/server';
import type { Timeframe } from '@thresher/engine';
import type { ScanResponse } from '../../../../lib/api-types';
import { createScanStore } from '../../../../lib/scan-store';

export const runtime = 'nodejs';

const boardStore = createScanStore();
const TIMEFRAMES: readonly Timeframe[] = ['intraday', 'swing', 'position'];
const HEADERS = { 'cache-control': 'no-store' } as const;

export async function GET(): Promise<NextResponse> {
  const stored = await Promise.all(TIMEFRAMES.map((tf) => boardStore.get(tf)));
  const boards: ScanResponse[] = stored
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .map((s) => s.value);
  return NextResponse.json({ boards }, { headers: HEADERS });
}
