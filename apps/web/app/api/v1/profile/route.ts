/**
 * GET /api/v1/profile?symbol=NVDA — display-only company fundamentals.
 *
 * Separate from /api/v1/analyze so the fundamentals fetch loads independently
 * and never blocks or breaks the trade plan. Same HTTP shell pattern: validate,
 * rate-limit (its own budget so it doesn't eat the analyze allowance), delegate.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ERROR_STATUS } from '../../../../lib/api-types';
import type { ApiError } from '../../../../lib/api-types';
import { createProfileCache } from '../../../../lib/profile-cache';
import { createRateLimiter } from '../../../../lib/ratelimit';
import { getProvider } from '../../../../lib/providers/select';
import { runProfile } from '../../../../lib/profile-service';

// Node runtime: yahoo-finance2 has no edge-safe build (see analyze/route.ts).
export const runtime = 'nodejs';

const profileCache = createProfileCache();
const rateLimiter = createRateLimiter();

const SYMBOL_PATTERN = /^[A-Z][A-Z.-]{0,9}$/;
const MS_PER_SECOND = 1_000;
const BASE_HEADERS = { 'cache-control': 'no-store' } as const;

function errorResponse(error: ApiError, extraHeaders?: Record<string, string>): NextResponse {
  return NextResponse.json(error, {
    status: ERROR_STATUS[error.error],
    headers: { ...BASE_HEADERS, ...extraHeaders },
  });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const params = new URL(req.url).searchParams;

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

  // Separate rate-limit budget from analyze (the `profile:` prefix gives this
  // endpoint its own bucket, so loading both on one page view isn't double-spent).
  const ip =
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'local';
  const limit = await rateLimiter.check(`profile:${ip}`, false);
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

  const result = await runProfile({ symbol, provider: getProvider(), cache: profileCache });
  if (!result.ok) {
    return errorResponse(result.error);
  }
  return NextResponse.json(result.body, { status: 200, headers: BASE_HEADERS });
}
