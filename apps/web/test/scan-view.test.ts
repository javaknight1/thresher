import { describe, expect, it } from 'vitest';
import type { ScanRow } from '../lib/api-types';
import { applyView, DEFAULT_VIEW } from '../lib/scan-view';

function row(symbol: string, direction: 'long' | 'short', confidence: number, rr: number): ScanRow {
  return {
    symbol,
    direction,
    confidence,
    rr,
    qualityRank: (confidence / 100) * rr,
    price: 100,
    entry: 100,
    stop: direction === 'long' ? 95 : 105,
    target: direction === 'long' ? 110 : 90,
    rewardPct: 10,
    riskPct: 5,
    stopBasis: 'ATR',
    targetBasis: 'pivot',
    driver: `${symbol} driver`,
    story: `${symbol} full story.`,
  };
}

const ROWS: ScanRow[] = [
  row('AAA', 'long', 80, 2.0), // q 1.60
  row('BBB', 'short', 90, 3.0), // q 2.70
  row('CCC', 'long', 50, 1.5), // q 0.75
  row('DDD', 'short', 60, 4.0), // q 2.40
];

describe('applyView', () => {
  it('defaults to no filter, sorted by quality desc', () => {
    const out = applyView(ROWS, DEFAULT_VIEW);
    expect(out.map((r) => r.symbol)).toEqual(['BBB', 'DDD', 'AAA', 'CCC']);
  });

  it('filters by direction', () => {
    const out = applyView(ROWS, { ...DEFAULT_VIEW, direction: 'long' });
    expect(out.map((r) => r.symbol)).toEqual(['AAA', 'CCC']);
  });

  it('filters by min R:R and min confidence', () => {
    // minRR 3 keeps BBB (rr3, q2.70) and DDD (rr4, q2.40); default sort = quality desc.
    expect(applyView(ROWS, { ...DEFAULT_VIEW, minRR: 3 }).map((r) => r.symbol)).toEqual([
      'BBB',
      'DDD',
    ]);
    expect(applyView(ROWS, { ...DEFAULT_VIEW, minConfidence: 80 }).map((r) => r.symbol)).toEqual([
      'BBB',
      'AAA',
    ]);
  });

  it('sorts by rr and by confidence', () => {
    expect(applyView(ROWS, { ...DEFAULT_VIEW, sort: 'rr' }).map((r) => r.symbol)).toEqual([
      'DDD',
      'BBB',
      'AAA',
      'CCC',
    ]);
    expect(applyView(ROWS, { ...DEFAULT_VIEW, sort: 'confidence' }).map((r) => r.symbol)).toEqual([
      'BBB',
      'AAA',
      'DDD',
      'CCC',
    ]);
  });

  it('does not mutate the input array', () => {
    const before = ROWS.map((r) => r.symbol);
    applyView(ROWS, { ...DEFAULT_VIEW, sort: 'rr' });
    expect(ROWS.map((r) => r.symbol)).toEqual(before);
  });
});
