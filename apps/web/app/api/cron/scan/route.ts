/**
 * GET /api/cron/scan?timeframe=swing&key=SECRET — scheduled board refresh.
 *
 * The precompute job: recompute ONE timeframe's board and write it to the shared
 * store (Upstash), so page reads serve a warm board instantly (see the scan
 * route — reads never recompute). Secret-gated by CRON_SECRET (public route, but
 * useless without the key). One timeframe per call to stay under the Worker's
 * subrequest budget — the scheduler calls it once per candle size.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { Timeframe } from '@thresher/engine';
import { createBarCache } from '../../../../lib/cache';
import { createScanStore } from '../../../../lib/scan-store';
import { getProvider } from '../../../../lib/providers/select';
import { runScan } from '../../../../lib/scan-service';
import { WEB_CONFIG } from '../../../../lib/config';

export const runtime = 'nodejs';

const barCache = createBarCache();
const boardStore = createScanStore();
const TIMEFRAMES: readonly Timeframe[] = ['intraday', 'swing', 'position'];

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 });
  }
  const params = new URL(req.url).searchParams;
  if (params.get('key') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const rawTimeframe = params.get('timeframe') ?? '';
  if (!(TIMEFRAMES as readonly string[]).includes(rawTimeframe)) {
    return NextResponse.json({ error: 'invalid timeframe' }, { status: 400 });
  }
  const timeframe = rawTimeframe as Timeframe;

  const board = await runScan({ timeframe, provider: getProvider(), cache: barCache });
  await boardStore.set(timeframe, board, WEB_CONFIG.cache.ttlSeconds[timeframe]);
  return NextResponse.json(
    { ok: true, timeframe, emitted: board.emitted, universeSize: board.universeSize, asOf: board.asOf },
    { headers: { 'cache-control': 'no-store' } },
  );
}
