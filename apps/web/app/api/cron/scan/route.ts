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
import { createEarningsStore } from '../../../../lib/earnings-store';
import { createScanStore } from '../../../../lib/scan-store';
import { createFollowStore } from '../../../../lib/follow-store';
import { getProvider } from '../../../../lib/providers/select';
import { runScan } from '../../../../lib/scan-service';
import { WEB_CONFIG } from '../../../../lib/config';

export const runtime = 'nodejs';

const barCache = createBarCache();
const earningsStore = createEarningsStore();
// Per-scope stores, keyed so the equity and crypto boards never overwrite each
// other (mirrors the reader route). Crypto follows live in their own namespace.
const boardStores = {
  equity: createScanStore('equity'),
  crypto: createScanStore('crypto'),
} as const;
const followStores = {
  equity: createFollowStore('follows'),
  crypto: createFollowStore('cryptofollows'),
} as const;
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
  const scope = params.get('scope') === 'crypto' ? 'crypto' : 'equity';

  const startedAt = Date.now();
  // Track how far we got so a failure says *what* broke, not just "500".
  let stage: 'follows' | 'scan' | 'store' = 'follows';
  let universeSize = 0;
  try {
    const followed = await followStores[scope].allSymbols().catch(() => []);

    stage = 'scan';
    let board;
    if (scope === 'crypto') {
      // Crypto universe = crypto follows ∪ curated coins (follows first), capped
      // for the subrequest budget. No earnings (G5 is off for crypto).
      const universe = [
        ...new Set([...followed, ...WEB_CONFIG.crypto.curatedCoins].map((s) => s.toUpperCase())),
      ].slice(0, WEB_CONFIG.crypto.maxScanUniverse);
      board = await runScan({ timeframe, provider: getProvider(), cache: barCache, universe });
    } else {
      board = await runScan({
        timeframe,
        provider: getProvider(),
        cache: barCache,
        followed,
        earningsStore,
      });
    }
    universeSize = board.universeSize;

    stage = 'store';
    await boardStores[scope].set(timeframe, board, WEB_CONFIG.cache.ttlSeconds[timeframe]);

    return NextResponse.json(
      {
        ok: true,
        scope,
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
      `[cron/scan] ${scope}/${timeframe} failed during "${stage}" after ${Date.now() - startedAt}ms: ${name}: ${message}`,
      err instanceof Error ? err.stack : undefined,
    );
    // …and in the HTTP body so the scheduler's log shows the cause, not just 500.
    return NextResponse.json(
      {
        ok: false,
        scope,
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
