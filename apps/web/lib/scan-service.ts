/**
 * Scan service — the testable core of GET /api/v1/scan (design §6.3).
 *
 * Ranks a bounded candidate universe (curated liquid base ∪ today's movers) at
 * one timeframe by running the SAME pure engine the Analyze page uses, per
 * symbol, via runAnalysis. Only gate-passing setups make the board; refusals
 * and skips (too-new / unknown / unavailable) collapse into counts. Ranking is
 * the doc's quality rank (C/100)×RR. Tests drive this with the MockProvider —
 * Yahoo is never exercised in tests (CLAUDE.md).
 */
import type { Timeframe } from '@thresher/engine';
import type { ScanResponse, ScanRow } from './api-types';
import type { BarCache, MarketDataProvider } from './contracts';
import { runAnalysis } from './analyze-service';
import { setupScore } from './setup-score';
import { WEB_CONFIG } from './config';

const SYMBOL_PATTERN = /^[A-Z][A-Z.-]{0,9}$/;

export interface RunScanInput {
  timeframe: Timeframe;
  provider: MarketDataProvider;
  cache: BarCache;
  /** injectable clock for deterministic tests; defaults to wall-clock */
  now?: () => Date;
  /** injectable universe for deterministic tests; defaults to buildUniverse */
  universe?: readonly string[];
}

/** First sentence of the engine story, as the one-line driver (design §6.3). */
function firstSentence(story: string): string {
  const trimmed = story.trim();
  const end = trimmed.search(/\.\s|\.$/);
  return end === -1 ? trimmed : trimmed.slice(0, end + 1);
}

/**
 * Candidate universe = curated base (listed first) ∪ provider movers, upper-
 * cased, validated, deduped, and capped at WEB_CONFIG.scan.maxUniverse. Movers
 * are best-effort: a failure just yields the curated list alone.
 */
export async function buildUniverse(provider: MarketDataProvider): Promise<string[]> {
  let movers: string[] = [];
  try {
    movers = await provider.getMovers();
  } catch {
    movers = [];
  }
  const seen = new Set<string>();
  const universe: string[] = [];
  for (const raw of [...WEB_CONFIG.scan.curated, ...movers]) {
    const symbol = raw.toUpperCase();
    if (!SYMBOL_PATTERN.test(symbol) || seen.has(symbol)) continue;
    seen.add(symbol);
    universe.push(symbol);
    if (universe.length >= WEB_CONFIG.scan.maxUniverse) break;
  }
  return universe;
}

/** Run an async mapper over items with a bounded number in flight at once. */
async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function runScan(input: RunScanInput): Promise<ScanResponse> {
  const { provider, cache, timeframe } = input;
  const now = input.now ?? (() => new Date());
  const universe = input.universe ?? (await buildUniverse(provider));

  const results = await mapLimit(universe, WEB_CONFIG.scan.concurrency, (symbol) =>
    runAnalysis({ symbol, timeframe, provider, cache, now }),
  );

  let emitted = 0;
  let refused = 0;
  let skipped = 0;
  const rows: ScanRow[] = [];

  for (const result of results) {
    // Skipped: unknown symbol, data unavailable, or (partial) too-new listing.
    if (!result.ok || 'status' in result.body) {
      skipped++;
      continue;
    }
    const body = result.body;
    // Refused: no qualifying setup (a gate failed) — collapse into the count.
    if (body.refusal !== null || body.plan === null || body.direction === 'none') {
      refused++;
      continue;
    }
    emitted++;
    const confidence = body.confidence.score;
    const plan = body.plan;
    const rr = plan.rr;
    rows.push({
      symbol: body.symbol,
      direction: body.direction,
      confidence,
      confidenceBucket: body.confidence.bucket,
      rr,
      score: setupScore({
        ev: plan.ev.value,
        confidence,
        rr,
        earningsInWindow: body.flags.earningsInWindow,
        overheadWarning: plan.overheadWarning,
      }),
      qualityRank: (confidence / 100) * rr,
      price: body.price,
      entry: plan.entry,
      stop: plan.stop,
      target: plan.target,
      rewardPct: plan.rewardPct,
      riskPct: plan.riskPct,
      stopBasis: plan.stopBasis,
      targetBasis: plan.targetBasis,
      driver: firstSentence(body.story),
      story: body.story,
    });
  }

  rows.sort((a, b) => b.score - a.score);

  return {
    timeframe,
    asOf: now().toISOString(),
    universeSize: universe.length,
    emitted,
    refused,
    skipped,
    rows: rows.slice(0, WEB_CONFIG.scan.topN),
  };
}
