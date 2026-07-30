/**
 * Pure client-side view transforms for the Scan board: filter + sort the rows a
 * scan returned. This never changes the scan itself (the emitted/refused counts
 * still describe the whole scan) — it only shapes what the table shows.
 */
import type { ScanRow } from './api-types';

export type DirectionFilter = 'all' | 'long' | 'short';
export type SortKey = 'score' | 'quality' | 'rr' | 'confidence';

export interface ScanView {
  direction: DirectionFilter;
  /** minimum reward:risk to show (0 = no floor) */
  minRR: number;
  /** minimum confidence to show (0 = no floor) */
  minConfidence: number;
  sort: SortKey;
}

export const DEFAULT_VIEW: ScanView = {
  direction: 'all',
  minRR: 0,
  minConfidence: 0,
  sort: 'score',
};

const SORT_VALUE: Record<SortKey, (r: ScanRow) => number> = {
  score: (r) => r.score,
  quality: (r) => r.qualityRank,
  rr: (r) => r.rr,
  confidence: (r) => r.confidence,
};

/** Filter then sort (descending) a copy of the rows — input is not mutated. */
export function applyView(rows: readonly ScanRow[], view: ScanView): ScanRow[] {
  const value = SORT_VALUE[view.sort];
  return rows
    .filter(
      (r) =>
        (view.direction === 'all' || r.direction === view.direction) &&
        r.rr >= view.minRR &&
        r.confidence >= view.minConfidence,
    )
    .slice()
    .sort((a, b) => value(b) - value(a));
}
