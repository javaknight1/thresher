'use client';

/**
 * Client helpers for reading the scan boards — shared by the Leaderboard
 * (ScanApp) and the dashboard watchlist (FollowedList), which both fetch the
 * per-timeframe boards and reduce them to a best-setup-per-symbol view.
 */
import type { Timeframe } from '@thresher/engine';
import type { ScanResponse, ScanRow } from './api-types';
import { WEB_CONFIG } from './config';

export const TF_VIEWS: readonly Timeframe[] = ['intraday', 'swing', 'position'];

/** Wire-level board scope — one precomputed board per scope in the store. */
export type BoardScope = 'equity' | 'crypto';

/**
 * UI-level board mode. The Leaderboard is `'all'` (stocks + crypto merged
 * client-side from the two per-scope boards); the Stocks and Crypto tabs pin a
 * single scope. `'all'` never hits the wire directly — it fans out to both scopes.
 */
export type BoardMode = 'all' | BoardScope;

/** The wire scopes a UI mode reads from. */
export function scopesForMode(mode: BoardMode): readonly BoardScope[] {
  return mode === 'all' ? (['equity', 'crypto'] as const) : [mode];
}

export type BoardFetch = { board: ScanResponse | null; status: number };

/** Fetch one timeframe's board. `force` bypasses the cached board (re-scan). */
export async function fetchBoard(
  tf: Timeframe,
  force = false,
  scope: BoardScope = 'equity',
): Promise<BoardFetch> {
  const params = new URLSearchParams({ timeframe: tf });
  if (force) params.set('refresh', '1');
  if (scope === 'crypto') params.set('scope', 'crypto');
  try {
    const res = await fetch(`/api/v1/scan?${params.toString()}`, { cache: 'no-store' });
    if (!res.ok) return { board: null, status: res.status };
    return { board: (await res.json()) as ScanResponse, status: 200 };
  } catch {
    return { board: null, status: 0 };
  }
}

/**
 * Read-only snapshot of all cached boards in one request (GET /api/v1/boards).
 * For consumers that only need a read (e.g. the watchlist trade lines) — cheaper
 * than three per-timeframe fetches. Returns [] on failure or a cold cache.
 */
export async function fetchAllBoards(): Promise<ScanResponse[]> {
  try {
    const res = await fetch('/api/v1/boards', { cache: 'no-store' });
    if (!res.ok) return [];
    const body = (await res.json()) as { boards?: ScanResponse[] };
    return body.boards ?? [];
  } catch {
    return [];
  }
}

/** Outcome of a resilient fetch: the board (if any) + why it might be stale. */
export type ResilientBoard = {
  board: ScanResponse | null;
  /** true when a forced refresh failed and we served the cached board instead */
  fellBack: boolean;
  /** true when the (forced) recompute was rate-limited / quota-capped */
  rateLimited: boolean;
};

/**
 * Force a fresh board; if the recompute fails (a cold scan can 5xx/time out
 * under a burst, or hit the rate limit), fall back to the last cached (Upstash)
 * board so the aggregate views always have all three timeframes — otherwise a
 * dropped timeframe changes the merge on every refresh (the "different results
 * each reload" bug). Reports whether it fell back / was rate-limited.
 */
export async function fetchBoardResilient(
  tf: Timeframe,
  force: boolean,
  scope: BoardScope = 'equity',
): Promise<ResilientBoard> {
  const fresh = await fetchBoard(tf, force, scope);
  const rateLimited = fresh.status === 429;
  if (fresh.board || !force) {
    return { board: fresh.board, fellBack: false, rateLimited };
  }
  const cached = await fetchBoard(tf, false, scope);
  return { board: cached.board, fellBack: cached.board !== null, rateLimited };
}

/**
 * One timeframe's board for a UI mode. For a single scope this is just
 * `fetchBoardResilient`; for `'all'` it fetches both scopes' boards and merges
 * their rows into one board for the timeframe (counts summed). Equity and crypto
 * symbols never collide, so no dedup is needed. Returns the board plus whether
 * any underlying fetch fell back / was rate-limited.
 */
export async function fetchModeBoard(
  tf: Timeframe,
  force: boolean,
  mode: BoardMode,
): Promise<ResilientBoard> {
  const scopes = scopesForMode(mode);
  const results = await Promise.all(scopes.map((s) => fetchBoardResilient(tf, force, s)));
  const boards = results.map((r) => r.board).filter((b): b is ScanResponse => b !== null);
  const fellBack = results.some((r) => r.fellBack);
  const rateLimited = results.some((r) => r.rateLimited);
  if (boards.length === 0) return { board: null, fellBack, rateLimited };
  if (boards.length === 1) return { board: boards[0], fellBack, rateLimited };
  const merged: ScanResponse = {
    timeframe: tf,
    asOf: boards.reduce((latest, b) => (b.asOf > latest ? b.asOf : latest), boards[0].asOf),
    universeSize: boards.reduce((s, b) => s + b.universeSize, 0),
    emitted: boards.reduce((s, b) => s + b.emitted, 0),
    refused: boards.reduce((s, b) => s + b.refused, 0),
    skipped: boards.reduce((s, b) => s + b.skipped, 0),
    rows: boards.flatMap((b) => b.rows),
  };
  return { board: merged, fellBack, rateLimited };
}

/**
 * Best (highest-score) setup per symbol across a set of boards, each row tagged
 * with the timeframe it came from. The basis for both the Top shortlist and the
 * watchlist trade lines.
 */
export function bestBySymbol(boards: readonly ScanResponse[]): Map<string, ScanRow> {
  const map = new Map<string, ScanRow>();
  for (const b of boards) {
    for (const row of b.rows) {
      const cur = map.get(row.symbol);
      if (!cur || row.score > cur.score) map.set(row.symbol, { ...row, timeframe: b.timeframe });
    }
  }
  return map;
}

/** Aggregate boards into one Top-N shortlist (best setup per symbol, sorted). */
export function mergeTop(boards: ScanResponse[]): ScanResponse {
  const rows = [...bestBySymbol(boards).values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, WEB_CONFIG.scan.topN);
  return {
    timeframe: 'swing',
    asOf: boards.reduce((latest, b) => (b.asOf > latest ? b.asOf : latest), boards[0].asOf),
    universeSize: boards.reduce((s, b) => s + b.universeSize, 0),
    emitted: boards.reduce((s, b) => s + b.emitted, 0),
    refused: boards.reduce((s, b) => s + b.refused, 0),
    skipped: boards.reduce((s, b) => s + b.skipped, 0),
    rows,
  };
}
