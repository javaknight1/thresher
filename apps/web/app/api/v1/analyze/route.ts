/**
 * GET /api/v1/analyze?symbol=NVDA&timeframe=swing — design §8.
 *
 * HTTP shell only: validates the query, rate-limits BEFORE any provider work
 * (design §2.1 — the limit protects the free data source), then delegates to
 * runAnalysis and maps results/errors to status codes via ERROR_STATUS.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { Timeframe } from '@thresher/engine';
import { ERROR_STATUS } from '../../../../lib/api-types';
import type { ApiError } from '../../../../lib/api-types';
import { createBarCache } from '../../../../lib/cache';
import { createRateLimiter } from '../../../../lib/ratelimit';
import { getProvider } from '../../../../lib/providers/select';
import { runAnalysis } from '../../../../lib/analyze-service';

// Node runtime: yahoo-finance2 v3 ships only Deno-shimmed node builds (no
// edge-safe entry), so this route cannot compile for the edge runtime. The
// Cloudflare deploy therefore uses the OpenNext Workers adapter (nodejs_compat)
// rather than next-on-pages — see MANUAL.md.
export const runtime = 'nodejs';

/** Module-level: cache + limiter survive across requests within an isolate. */
const barCache = createBarCache();
const rateLimiter = createRateLimiter();

const SYMBOL_PATTERN = /^[A-Z][A-Z.-]{0,9}$/;
const TIMEFRAMES: readonly Timeframe[] = ['intraday', 'swing', 'position'];
const MS_PER_SECOND = 1_000;

/** Every response is uncacheable at the HTTP layer — freshness is the bar cache's job. */
const BASE_HEADERS = { 'cache-control': 'no-store' } as const;

function errorResponse(error: ApiError, extraHeaders?: Record<string, string>): NextResponse {
  return NextResponse.json(error, {
    status: ERROR_STATUS[error.error],
    headers: { ...BASE_HEADERS, ...extraHeaders },
  });
}

function isTimeframe(value: string): value is Timeframe {
  return (TIMEFRAMES as readonly string[]).includes(value);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const params = new URL(req.url).searchParams;

  // --- query validation (no provider work yet) ---
  const rawSymbol = params.get('symbol');
  if (!rawSymbol) {
    return errorResponse({
      error: 'INVALID_REQUEST',
      message: 'missing required query parameter "symbol"',
    });
  }
  const symbol = rawSymbol.toUpperCase();
  if (!SYMBOL_PATTERN.test(symbol)) {
    return errorResponse({
      error: 'INVALID_REQUEST',
      message: `invalid symbol "${rawSymbol}" — expected 1–10 characters: letters, dots, dashes`,
    });
  }

  const rawTimeframe = params.get('timeframe') || 'swing';
  if (!isTimeframe(rawTimeframe)) {
    return errorResponse({
      error: 'INVALID_REQUEST',
      message: `invalid timeframe "${rawTimeframe}" — expected intraday, swing, or position`,
    });
  }
  const timeframe: Timeframe = rawTimeframe;

  // --- rate limit BEFORE any provider work (design §2.1) ---
  const identity =
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'local';
  // Clerk lands in M2 — until then every caller is anonymous (20/hr tier).
  const authed = false;
  const limit = await rateLimiter.check(identity, authed);
  if (!limit.allowed) {
    const retryAfterSeconds = Math.max(
      0,
      Math.ceil((Date.parse(limit.resetAt) - Date.now()) / MS_PER_SECOND),
    );
    return errorResponse(
      {
        error: 'RATE_LIMITED',
        message: 'rate limit exceeded — try again after the window resets',
        resetAt: limit.resetAt,
      },
      { 'retry-after': String(retryAfterSeconds) },
    );
  }

  // --- analysis ---
  const result = await runAnalysis({
    symbol,
    timeframe,
    provider: getProvider(),
    cache: barCache,
  });

  if (!result.ok) {
    return errorResponse(result.error);
  }
  return NextResponse.json(result.body, { status: 200, headers: BASE_HEADERS });
}
