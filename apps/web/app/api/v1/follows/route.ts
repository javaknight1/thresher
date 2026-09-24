/**
 * /api/v1/follows — the caller's followed-symbol set (design: demand-driven
 * universe). Following a symbol guarantees it gets scanned + cached, and is the
 * basis for the notification fan-out.
 *
 *   GET    → { symbols, max }
 *   POST   { symbol }  → add (idempotent, capped at maxPerUser)
 *   DELETE { symbol }  → remove (idempotent)
 *
 * Identity: the Clerk userId when signed in; in open mode (no Clerk keys — CI /
 * e2e / zero-env) it falls back to the request IP so the flow still works. When
 * Clerk IS configured, an unauthenticated caller is rejected (must sign in to
 * follow) — the route is already behind the middleware's auth.protect(), this
 * is defense in depth.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { FollowsResponse } from '../../../../lib/api-types';
import { createFollowStore } from '../../../../lib/follow-store';
import { isValidSymbol, normalizeSymbol } from '../../../../lib/symbols';
import { requestIdentity } from '../../../../lib/auth-server';
import { authEnabled } from '../../../../lib/auth';
import { WEB_CONFIG } from '../../../../lib/config';

export const runtime = 'nodejs';

// Two independent scopes: equity (capped) and crypto (unlimited). See follow-store.
const equityStore = createFollowStore('follows');
const cryptoStore = createFollowStore('cryptofollows');
const MAX = WEB_CONFIG.follows.maxPerUser;
const HEADERS = { 'cache-control': 'no-store' } as const;

/** Pick the store + cap for the request's scope (`?scope=crypto` → unlimited). */
function scopeOf(req: Request): { store: ReturnType<typeof createFollowStore>; max: number | null } {
  const scope = new URL(req.url).searchParams.get('scope');
  return scope === 'crypto' ? { store: cryptoStore, max: null } : { store: equityStore, max: MAX };
}

/** Resolve the follow identity, or null when auth is on but the caller is anon. */
async function resolveIdentity(req: Request): Promise<string | null> {
  const { identity, authed } = await requestIdentity(req);
  if (authEnabled() && !authed) return null;
  return identity;
}

function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: 'UNAUTHENTICATED', message: 'Sign in to follow symbols.' },
    { status: 401, headers: HEADERS },
  );
}

function ok(symbols: string[], max: number | null, status = 200): NextResponse {
  const body: FollowsResponse = { symbols, max };
  return NextResponse.json(body, { status, headers: HEADERS });
}

async function readSymbol(req: Request): Promise<string | null> {
  const body = (await req.json().catch(() => null)) as { symbol?: unknown } | null;
  if (!body || typeof body.symbol !== 'string') return null;
  const sym = normalizeSymbol(body.symbol);
  return isValidSymbol(sym) ? sym : null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const identity = await resolveIdentity(req);
  if (!identity) return unauthorized();
  const { store, max } = scopeOf(req);
  return ok(await store.list(identity), max);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const identity = await resolveIdentity(req);
  if (!identity) return unauthorized();
  const { store, max } = scopeOf(req);

  const symbol = await readSymbol(req);
  if (!symbol) {
    return NextResponse.json(
      { error: 'INVALID_REQUEST', message: 'Provide a valid ticker symbol.' },
      { status: 400, headers: HEADERS },
    );
  }

  // Enforce the per-user cap (equity only; crypto is unlimited, max === null) —
  // but never reject a symbol that's already followed (idempotent add), so
  // re-following at the cap isn't a spurious error.
  if (max !== null) {
    const current = await store.list(identity);
    if (!current.includes(symbol) && current.length >= max) {
      return NextResponse.json(
        {
          error: 'FOLLOW_LIMIT',
          message: `You can follow up to ${max} symbols. Unfollow one to add another.`,
          symbols: current,
          max,
        },
        { status: 422, headers: HEADERS },
      );
    }
  }

  await store.add(identity, symbol);
  return ok(await store.list(identity), max, 201);
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const identity = await resolveIdentity(req);
  if (!identity) return unauthorized();
  const { store, max } = scopeOf(req);

  const symbol = await readSymbol(req);
  if (!symbol) {
    return NextResponse.json(
      { error: 'INVALID_REQUEST', message: 'Provide a valid ticker symbol.' },
      { status: 400, headers: HEADERS },
    );
  }

  await store.remove(identity, symbol);
  return ok(await store.list(identity), max);
}
