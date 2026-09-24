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

/** Which board: the equity Leaderboard or the crypto board. */
export type BoardScope = 'equity' | 'crypto';

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
