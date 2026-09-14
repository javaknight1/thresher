'use client';

/**
 * Client-side follows store shared across the app (one fetch, many consumers)
 * via a module-level snapshot + useSyncExternalStore. The ★ button, the board's
 * "Following" tab, and the dashboard manager all read the same state, so a
 * toggle anywhere updates everywhere. Writes are optimistic and reconciled with
 * the server response; a rejected write (e.g. the follow cap) reverts.
 */
import { useCallback, useSyncExternalStore } from 'react';
import { normalizeSymbol } from './symbols';

export interface FollowsState {
  symbols: string[];
  max: number;
  loaded: boolean;
  error: string | null;
}

const EMPTY: FollowsState = { symbols: [], max: 20, loaded: false, error: null };
let state: FollowsState = EMPTY;
const subscribers = new Set<() => void>();

function emit(): void {
  for (const cb of subscribers) cb();
}
function set(next: Partial<FollowsState>): void {
  state = { ...state, ...next };
  emit();
}

let loadStarted = false;
async function ensureLoaded(): Promise<void> {
  if (loadStarted) return;
  loadStarted = true;
  try {
    const res = await fetch('/api/v1/follows', { cache: 'no-store' });
    if (res.ok) {
      const body = (await res.json()) as { symbols: string[]; max: number };
      set({ symbols: body.symbols, max: body.max, loaded: true });
    } else {
      // 401 (signed out) or error → treat as no follows, but mark loaded.
      set({ loaded: true });
    }
  } catch {
    set({ loaded: true });
  }
}

/** Add or remove a follow (optimistic; reverts on failure). */
export async function toggleFollow(symbol: string): Promise<{ ok: boolean; error?: string }> {
  const sym = normalizeSymbol(symbol);
  const following = state.symbols.includes(sym);
  const method = following ? 'DELETE' : 'POST';
  const prev = state.symbols;
  set({
    symbols: following ? prev.filter((s) => s !== sym) : [...prev, sym],
    error: null,
  });
  try {
    const res = await fetch('/api/v1/follows', {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ symbol: sym }),
      cache: 'no-store',
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      set({ symbols: prev, error: body?.message ?? 'Could not update follow.' });
      return { ok: false, error: body?.message };
    }
    const body = (await res.json()) as { symbols: string[]; max: number };
    set({ symbols: body.symbols, max: body.max, error: null });
    return { ok: true };
  } catch {
    set({ symbols: prev, error: 'Network error.' });
    return { ok: false, error: 'Network error.' };
  }
}

/** Seed a new user's starter watchlist (skips any already followed). */
export async function seedDefaultFollows(symbols: readonly string[]): Promise<void> {
  await ensureLoaded();
  for (const raw of symbols) {
    const sym = normalizeSymbol(raw);
    if (!state.symbols.includes(sym)) await toggleFollow(sym);
  }
}

function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  void ensureLoaded();
  return () => subscribers.delete(cb);
}
function getSnapshot(): FollowsState {
  return state;
}
// Server render (and initial hydration) shows the empty set — the real list
// arrives after mount, so there's no hydration mismatch.
function getServerSnapshot(): FollowsState {
  return EMPTY;
}

export function useFollows() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const isFollowing = useCallback(
    (symbol: string) => snapshot.symbols.includes(normalizeSymbol(symbol)),
    [snapshot.symbols],
  );
  return { ...snapshot, isFollowing, toggle: toggleFollow };
}
