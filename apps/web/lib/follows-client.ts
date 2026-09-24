'use client';

/**
 * Client-side follows store, shared across the app (one fetch, many consumers)
 * via a module-level snapshot + useSyncExternalStore. Two independent SCOPES —
 * `equity` (capped) and `crypto` (unlimited) — each keep their own snapshot and
 * hit `/api/v1/follows[?scope=crypto]`. The ★ button, the board's "Following"
 * tab, and the dashboard manager all read the same per-scope state, so a toggle
 * anywhere updates everywhere. Writes are optimistic and reconciled with the
 * server; a rejected write (e.g. the equity cap) reverts.
 */
import { useCallback, useSyncExternalStore } from 'react';
import { normalizeSymbol } from './symbols';

export type FollowScope = 'equity' | 'crypto';

export interface FollowsState {
  symbols: string[];
  /** per-user cap; null = unlimited (crypto) */
  max: number | null;
  loaded: boolean;
  error: string | null;
}

const EMPTY: FollowsState = { symbols: [], max: 20, loaded: false, error: null };
const EMPTY_CRYPTO: FollowsState = { ...EMPTY, max: null };

interface Client {
  state: FollowsState;
  subscribers: Set<() => void>;
  loadStarted: boolean;
}
const clients: Record<FollowScope, Client> = {
  equity: { state: EMPTY, subscribers: new Set(), loadStarted: false },
  crypto: { state: EMPTY_CRYPTO, subscribers: new Set(), loadStarted: false },
};

const apiUrl = (scope: FollowScope): string =>
  scope === 'crypto' ? '/api/v1/follows?scope=crypto' : '/api/v1/follows';

function set(scope: FollowScope, next: Partial<FollowsState>): void {
  const c = clients[scope];
  c.state = { ...c.state, ...next };
  for (const cb of c.subscribers) cb();
}

async function ensureLoaded(scope: FollowScope): Promise<void> {
  const c = clients[scope];
  if (c.loadStarted) return;
  c.loadStarted = true;
  try {
    const res = await fetch(apiUrl(scope), { cache: 'no-store' });
    if (res.ok) {
      const body = (await res.json()) as { symbols: string[]; max: number | null };
      set(scope, { symbols: body.symbols, max: body.max, loaded: true });
    } else {
      set(scope, { loaded: true });
    }
  } catch {
    set(scope, { loaded: true });
  }
}

/** Add or remove a follow (optimistic; reverts on failure). */
export async function toggleFollow(
  symbol: string,
  scope: FollowScope = 'equity',
): Promise<{ ok: boolean; error?: string }> {
  const c = clients[scope];
  const sym = normalizeSymbol(symbol);
  const following = c.state.symbols.includes(sym);
  const method = following ? 'DELETE' : 'POST';
  const prev = c.state.symbols;
  set(scope, {
    symbols: following ? prev.filter((s) => s !== sym) : [...prev, sym],
    error: null,
  });
  try {
    const res = await fetch(apiUrl(scope), {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ symbol: sym }),
      cache: 'no-store',
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      set(scope, { symbols: prev, error: body?.message ?? 'Could not update follow.' });
      return { ok: false, error: body?.message };
    }
    const body = (await res.json()) as { symbols: string[]; max: number | null };
    set(scope, { symbols: body.symbols, max: body.max, error: null });
    return { ok: true };
  } catch {
    set(scope, { symbols: prev, error: 'Network error.' });
    return { ok: false, error: 'Network error.' };
  }
}

/** Seed a new user's starter watchlist (skips any already followed). */
export async function seedDefaultFollows(
  symbols: readonly string[],
  scope: FollowScope = 'equity',
): Promise<void> {
  await ensureLoaded(scope);
  for (const raw of symbols) {
    const sym = normalizeSymbol(raw);
    if (!clients[scope].state.symbols.includes(sym)) await toggleFollow(sym, scope);
  }
}

// Stable per-scope store fns (created once → useSyncExternalStore won't resubscribe each render).
const subscribeFns: Record<FollowScope, (cb: () => void) => () => void> = {
  equity: (cb) => subscribeScope('equity', cb),
  crypto: (cb) => subscribeScope('crypto', cb),
};
const snapshotFns: Record<FollowScope, () => FollowsState> = {
  equity: () => clients.equity.state,
  crypto: () => clients.crypto.state,
};
const serverFns: Record<FollowScope, () => FollowsState> = {
  equity: () => EMPTY,
  crypto: () => EMPTY_CRYPTO,
};
function subscribeScope(scope: FollowScope, cb: () => void): () => void {
  const c = clients[scope];
  c.subscribers.add(cb);
  void ensureLoaded(scope);
  return () => c.subscribers.delete(cb);
}

export function useFollows(scope: FollowScope = 'equity') {
  const snapshot = useSyncExternalStore(subscribeFns[scope], snapshotFns[scope], serverFns[scope]);
  const isFollowing = useCallback(
    (symbol: string) => snapshot.symbols.includes(normalizeSymbol(symbol)),
    [snapshot.symbols],
  );
  const toggle = useCallback((symbol: string) => toggleFollow(symbol, scope), [scope]);
  return { ...snapshot, isFollowing, toggle };
}
