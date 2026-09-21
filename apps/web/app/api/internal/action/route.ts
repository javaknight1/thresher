/**
 * POST /api/internal/action — write actions for the /internal ops console
 * (tier E). Sign-in gated in proxy.ts. Node runtime (Yahoo + stores).
 *
 * Actions: scan (refresh all boards + capture earnings) · refresh (bust a
 * symbol's cached bars) · prune-universe (drop 0-follower symbols) · del (delete
 * an exact key). Destructive actions are confirmed client-side.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { Timeframe } from '@thresher/engine';
import { del, srem } from '../../../../lib/internal/admin';
import { createBarCache } from '../../../../lib/cache';
import { createScanStore } from '../../../../lib/scan-store';
import { createFollowStore } from '../../../../lib/follow-store';
import { createEarningsStore } from '../../../../lib/earnings-store';
import { getProvider } from '../../../../lib/providers/select';
import { runScan } from '../../../../lib/scan-service';
import { WEB_CONFIG } from '../../../../lib/config';

export const runtime = 'nodejs';

const TIMEFRAMES: readonly Timeframe[] = ['intraday', 'swing', 'position'];
const UNIVERSE_KEY = 'thresher:follows:symbols';

const barCache = createBarCache();
const boardStore = createScanStore();
const followStore = createFollowStore();
const earningsStore = createEarningsStore();

const json = (ok: boolean, message: string, status = 200) =>
  NextResponse.json({ ok, message }, { status, headers: { 'cache-control': 'no-store' } });

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { action?: string; symbol?: string; key?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  try {
    switch (body.action) {
      case 'scan': {
        const followed = await followStore.allSymbols();
        let rows = 0;
        for (const tf of TIMEFRAMES) {
          const board = await runScan({
            timeframe: tf,
            provider: getProvider(),
            cache: barCache,
            followed,
            earningsStore,
          });
          await boardStore.set(tf, board, WEB_CONFIG.cache.ttlSeconds[tf]);
          rows += board.rows.length;
        }
        return json(true, `scanned ${followed.length} follows + curated → ${rows} rows`);
      }

      case 'refresh': {
        const symbol = (body.symbol ?? '').toUpperCase().trim();
        if (!symbol) return json(false, 'symbol required', 400);
        const keys = TIMEFRAMES.map(
          (tf) => `ohlcv:${symbol}:${WEB_CONFIG.provider.lookback[tf].interval}`,
        );
        const n = await del(keys);
        return json(true, `busted ${n} cached bar key(s) for ${symbol}`);
      }

      case 'prune-universe': {
        const universe = await followStore.allSymbols();
        const drift: string[] = [];
        for (const s of universe) {
          if ((await followStore.followersOf(s)).length === 0) drift.push(s);
        }
        const n = drift.length ? await srem(UNIVERSE_KEY, drift) : 0;
        return json(true, drift.length ? `pruned ${n}: ${drift.join(', ')}` : 'no drift — nothing to prune');
      }

      case 'del': {
        const key = (body.key ?? '').trim();
        if (!key) return json(false, 'key required', 400);
        const n = await del([key]);
        return json(true, `deleted ${n} key(s)`);
      }

      default:
        return json(false, `unknown action "${body.action}"`, 400);
    }
  } catch (err) {
    return json(false, err instanceof Error ? err.message : String(err), 500);
  }
}
