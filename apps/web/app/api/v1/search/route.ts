/**
 * GET /api/v1/search?q=nvid — symbol autocomplete (company name or ticker →
 * candidate symbols). Powers the search box's dropdown. Best-effort: the
 * provider swallows failures and returns []. Display-only — never the engine.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { SearchResponse } from '../../../../lib/api-types';
import { getProvider } from '../../../../lib/providers/select';

export const runtime = 'nodejs';

const HEADERS = { 'cache-control': 'no-store' } as const;
const MAX_QUERY = 40;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, MAX_QUERY);
  if (q.length < 1) {
    return NextResponse.json({ results: [] } satisfies SearchResponse, { headers: HEADERS });
  }
  const results = await getProvider().search(q);
  return NextResponse.json({ results } satisfies SearchResponse, { headers: HEADERS });
}
