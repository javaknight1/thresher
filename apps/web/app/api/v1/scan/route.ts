/**
 * GET /api/v1/scan?timeframe=swing — the ranked "top setups" board (design §6.3).
 *
 * Expensive by nature (it fans out to the provider across the universe), so:
 *   1. Serve a cached board immediately when fresh — cheap, no rate-limit spend.
 *   2. Only the recompute path is rate-limited (its own `scan:` bucket) — the
 *      limit protects the free data source, per design §2.1.
 * The result cache is per-isolate/in-memory (zero-env, personal-use). Scaling
 * the universe / sharing the board is the graduation to Cloudflare Cron +
 * Upstash precompute — see the scan config comment.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { Timeframe } from '@thresher/engine';
import { ERROR_STATUS } from '../../../../lib/api-types';
import type { ApiError, ScanResponse } from '../../../../lib/api-types';
import { createBarCache } from '../../../../lib/cache';
import { createRateLimiter } from '../../../../lib/ratelimit';
import { getProvider } from '../../../../lib/providers/select';
import { runScan } from '../../../../lib/scan-service';
import { WEB_CONFIG } from '../../../../lib/config';

// Node runtime: same reason as the analyze route (yahoo-finance2 needs Node).
export const runtime = 'nodejs';

const barCache = createBarCache();
const rateLimiter = createRateLimiter();

const TIMEFRAMES: readonly Timeframe[] = ['intraday', 'swing', 'position'];
const MS_PER_SECOND = 1_000;
const BASE_HEADERS = { 'cache-control': 'no-store' } as const;

/** Per-isolate board cache: last computed ScanResponse per timeframe. */
const boardCache = new Map<Timeframe, { value: ScanResponse; storedAt: number }>();

function isTimeframe(value: string): value is Timeframe {
  return (TIMEFRAMES as readonly string[]).includes(value);
}

function errorResponse(error: ApiError, extraHeaders?: Record<string, string>): NextResponse {
  return NextResponse.json(error, {
    status: ERROR_STATUS[error.error],
    headers: { ...BASE_HEADERS, ...extraHeaders },
  });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const params = new URL(req.url).searchParams;

  const rawTimeframe = params.get('timeframe') || 'swing';
  if (!isTimeframe(rawTimeframe)) {
    return errorResponse({
      error: 'INVALID_REQUEST',
      message: `invalid timeframe "${rawTimeframe}" — expected intraday, swing, or position`,
    });
  }
  const timeframe: Timeframe = rawTimeframe;

  // 1. Fresh cached board → serve immediately (no provider work, no limit
  // spend), UNLESS the caller forced a refresh (still rate-limited below).
  const force = params.get('refresh') === '1';
  const ttlSeconds = WEB_CONFIG.cache.ttlSeconds[timeframe];
  const cached = boardCache.get(timeframe);
  if (!force && cached && (Date.now() - cached.storedAt) / MS_PER_SECOND <= ttlSeconds) {
    return NextResponse.json(cached.value, { status: 200, headers: BASE_HEADERS });
  }

  // 2. Recompute path is rate-limited (protects the data source, design §2.1).
  const identity =
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'local';
  const limit = await rateLimiter.check(`scan:${identity}`, false);
  if (!limit.allowed) {
    // Stale board beats a hard failure: serve the last one if we have it.
    if (cached) {
      return NextResponse.json(cached.value, { status: 200, headers: BASE_HEADERS });
    }
    const retryAfterSeconds = Math.max(
      0,
      Math.ceil((Date.parse(limit.resetAt) - Date.now()) / MS_PER_SECOND),
    );
    return errorResponse(
      {
        error: 'RATE_LIMITED',
        message: 'scan rate limit exceeded — try again after the window resets',
        resetAt: limit.resetAt,
      },
      { 'retry-after': String(retryAfterSeconds) },
    );
  }

  const board = await runScan({ timeframe, provider: getProvider(), cache: barCache });
  boardCache.set(timeframe, { value: board, storedAt: Date.now() });
  return NextResponse.json(board, { status: 200, headers: BASE_HEADERS });
}
