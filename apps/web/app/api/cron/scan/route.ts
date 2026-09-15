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
import { createFollowStore } from '../../../../lib/follow-store';
import { getProvider } from '../../../../lib/providers/select';
import { runScan } from '../../../../lib/scan-service';
import { WEB_CONFIG } from '../../../../lib/config';

export const runtime = 'nodejs';

const barCache = createBarCache();
const boardStore = createScanStore();
const followStore = createFollowStore();
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

  const startedAt = Date.now();
  // Track how far we got so a failure says *what* broke, not just "500".
  let stage: 'follows' | 'scan' | 'store' = 'follows';
  let universeSize = 0;
  try {
    const followed = await followStore.allSymbols().catch(() => []);

    stage = 'scan';
    const board = await runScan({ timeframe, provider: getProvider(), cache: barCache, followed });
    universeSize = board.universeSize;

    stage = 'store';
    await boardStore.set(timeframe, board, WEB_CONFIG.cache.ttlSeconds[timeframe]);

    return NextResponse.json(
      {
        ok: true,
        timeframe,
        emitted: board.emitted,
        refused: board.refused,
        skipped: board.skipped,
        universeSize: board.universeSize,
        asOf: board.asOf,
        ms: Date.now() - startedAt,
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const name = err instanceof Error ? err.name : 'Error';
    // Surfaces in the Cloudflare Worker logs (stack included there).
    console.error(
      `[cron/scan] ${timeframe} failed during "${stage}" after ${Date.now() - startedAt}ms: ${name}: ${message}`,
      err instanceof Error ? err.stack : undefined,
    );
    // …and in the HTTP body so the scheduler's log shows the cause, not just 500.
    return NextResponse.json(
      {
        ok: false,
        timeframe,
        stage,
        error: `${name}: ${message}`,
        universeSize,
        ms: Date.now() - startedAt,
        hint:
          stage === 'scan'
            ? 'The scan fan-out likely hit the Cloudflare free-tier subrequest/CPU limit — see COSTS.md (Workers Paid) or reduce scan.maxUniverse.'
            : stage === 'store'
              ? 'Writing the board to the store failed — check the Upstash runtime env vars on the Worker.'
              : 'Reading the followed universe failed — check the Supabase / follow-store configuration.',
      },
      { status: 500, headers: { 'cache-control': 'no-store' } },
    );
  }
}
