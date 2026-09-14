/**
 * GET /api/v1/quote?symbols=NVDA,AAPL — cheap price snapshots (price + day
 * change + name) for the followed-stocks list. One batch call, capped at the
 * follow limit. Display-only; the engine is untouched.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { QuoteResponse } from '../../../../lib/api-types';
import { getProvider } from '../../../../lib/providers/select';
import { WEB_CONFIG } from '../../../../lib/config';

export const runtime = 'nodejs';

const HEADERS = { 'cache-control': 'no-store' } as const;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const raw = new URL(req.url).searchParams.get('symbols') ?? '';
  const symbols = [
    ...new Set(
      raw
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
    ),
  ].slice(0, WEB_CONFIG.follows.maxPerUser);

  if (symbols.length === 0) {
    return NextResponse.json({ quotes: [] } satisfies QuoteResponse, { headers: HEADERS });
  }
  const quotes = await getProvider().getQuotes(symbols);
  return NextResponse.json({ quotes } satisfies QuoteResponse, { headers: HEADERS });
}
