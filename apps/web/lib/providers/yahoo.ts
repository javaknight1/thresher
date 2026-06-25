/**
 * YahooProvider — MarketDataProvider backed by yahoo-finance2 (design §2.1).
 *
 * Edge-compatible: no node-only APIs; yahoo-finance2 v3 uses fetch internally.
 * NEVER exercised in tests — tests must not hit the network. The only unit-
 * tested piece is the pure weekday-counting helper `countTradingDays`.
 */
import YahooFinance from 'yahoo-finance2';
import type { QuoteSummaryResult } from 'yahoo-finance2/modules/quoteSummary-iface';
import type { Bar, Timeframe } from '@thresher/engine';
import { WEB_CONFIG } from '../config';
import {
  ProviderError,
  type CompanyProfile,
  type EarningsQuarter,
  type MarketDataProvider,
} from '../contracts';

const DAY_MS = 86_400_000;

/** Coerce a maybe-undefined Yahoo number into a finite number or null. */
function num(x: number | null | undefined): number | null {
  return typeof x === 'number' && Number.isFinite(x) ? x : null;
}

/** Coerce a maybe-undefined/empty Yahoo string into a trimmed string or null. */
function str(x: string | null | undefined): string | null {
  const trimmed = x?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Heuristic match for "this symbol does not exist" errors. yahoo-finance2 has
 * no stable error taxonomy for this case; it surfaces as an HTTP 404
 * ("Not Found"), "No data found, symbol may be delisted", or quote-not-found
 * messages depending on the endpoint.
 */
const UNKNOWN_SYMBOL_PATTERN = /not found|no data found|delisted|invalid symbol|unknown symbol/i;

function toProviderError(symbol: string, err: unknown): ProviderError {
  const message = err instanceof Error ? err.message : String(err);
  if (UNKNOWN_SYMBOL_PATTERN.test(message)) {
    return new ProviderError('UNKNOWN_SYMBOL', `unknown symbol "${symbol}" (${message})`);
  }
  return new ProviderError('UNAVAILABLE', `market data unavailable for "${symbol}" (${message})`);
}

/**
 * TRADING days from `from` (exclusive) to `to` (inclusive), comparing calendar
 * days in UTC. Counts weekdays only — market holidays are IGNORED, a documented
 * approximation (contracts.ts): the count can overstate by the number of
 * holidays in the span, which at worst widens the earnings veto window by a
 * day or two. Acceptable for a safety veto. Returns 0 when `to` falls on or
 * before `from`'s calendar day.
 */
export function countTradingDays(from: Date, to: Date): number {
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  let count = 0;
  while (cursor.getTime() < end) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

export class YahooProvider implements MarketDataProvider {
  private readonly yf: InstanceType<typeof YahooFinance>;

  constructor() {
    this.yf = new YahooFinance();
  }

  /** OHLCV per WEB_CONFIG.provider.lookback. Throws ProviderError on failure. */
  async getBars(symbol: string, timeframe: Timeframe): Promise<Bar[]> {
    const { interval, days } = WEB_CONFIG.provider.lookback[timeframe];
    try {
      const result = await this.yf.chart(symbol, {
        period1: new Date(Date.now() - days * DAY_MS),
        interval,
        return: 'array',
      });
      const bars: Bar[] = [];
      for (const q of result.quotes) {
        // Yahoo pads sessions with null rows (halts, partial bars) — drop them.
        if (q.open == null || q.high == null || q.low == null || q.close == null) continue;
        bars.push({
          t: q.date.getTime(),
          o: q.open,
          h: q.high,
          l: q.low,
          c: q.close,
          v: q.volume ?? 0,
        });
      }
      if (bars.length === 0) {
        throw new ProviderError('UNAVAILABLE', `no usable bars returned for "${symbol}"`);
      }
      return bars;
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw toProviderError(symbol, err);
    }
  }

  /**
   * Trading days until the next earnings report, via quoteSummary
   * calendarEvents. Weekday counting only — holidays ignored (see
   * countTradingDays). Best-effort by design: past dates, no scheduled
   * earnings, or any provider error all yield null; earnings data must never
   * fail an analysis.
   */
  async getDaysToEarnings(symbol: string, now: Date = new Date()): Promise<number | null> {
    try {
      const summary = await this.yf.quoteSummary(symbol, { modules: ['calendarEvents'] });
      const dates = summary.calendarEvents?.earnings?.earningsDate ?? [];
      const next = dates
        .filter((d) => d.getTime() > now.getTime())
        .sort((a, b) => a.getTime() - b.getTime())[0];
      if (!next) return null;
      return countTradingDays(now, next);
    } catch {
      return null;
    }
  }

  /**
   * Company identity + fundamentals (display-only context — never reaches the
   * engine). The core quoteSummary call decides existence: an unknown symbol
   * throws UNKNOWN_SYMBOL. Peers come from a separate best-effort call that is
   * swallowed on failure, so a flaky recommendations endpoint never blanks the
   * panel.
   */
  async getProfile(symbol: string): Promise<CompanyProfile> {
    let summary: QuoteSummaryResult;
    try {
      summary = await this.yf.quoteSummary(symbol, {
        modules: [
          'price',
          'assetProfile',
          'summaryDetail',
          'defaultKeyStatistics',
          'financialData',
          'calendarEvents',
          'earningsHistory',
        ],
      });
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw toProviderError(symbol, err);
    }

    const price = summary.price;
    const profile = summary.assetProfile;
    const detail = summary.summaryDetail;
    const stats = summary.defaultKeyStatistics;
    const financial = summary.financialData;

    const nextEarnings = summary.calendarEvents?.earnings?.earningsDate?.[0] ?? null;
    const history: EarningsQuarter[] = (summary.earningsHistory?.history ?? [])
      .slice(-WEB_CONFIG.profile.maxEarningsQuarters)
      .reverse()
      .map((q) => ({
        quarter: q.quarter ? q.quarter.toISOString() : null,
        epsActual: num(q.epsActual),
        epsEstimate: num(q.epsEstimate),
        surprisePercent: num(q.surprisePercent),
      }));

    // Analyst block is null unless there is at least a mean target or coverage.
    const targetMean = num(financial?.targetMeanPrice);
    const numAnalysts = num(financial?.numberOfAnalystOpinions);
    const analyst =
      targetMean !== null || numAnalysts !== null
        ? {
            targetMean,
            targetHigh: num(financial?.targetHighPrice),
            targetLow: num(financial?.targetLowPrice),
            recommendation: str(financial?.recommendationKey),
            numberOfAnalysts: numAnalysts,
          }
        : null;

    let peers: string[] = [];
    try {
      const rec = await this.yf.recommendationsBySymbol(symbol);
      peers = (rec.recommendedSymbols ?? [])
        .map((r) => r.symbol)
        .filter((s): s is string => typeof s === 'string' && s.length > 0)
        .slice(0, WEB_CONFIG.profile.maxPeers);
    } catch {
      peers = [];
    }

    return {
      symbol: symbol.toUpperCase(),
      name: str(price?.longName) ?? str(price?.shortName),
      exchange: str(price?.exchangeName),
      sector: str(profile?.sector),
      industry: str(profile?.industry),
      description: str(profile?.longBusinessSummary),
      website: str(profile?.website),
      currency: str(price?.currency),
      marketCap: num(price?.marketCap),
      fundamentals: {
        trailingPE: num(detail?.trailingPE),
        forwardPE: num(detail?.forwardPE),
        trailingEps: num(stats?.trailingEps),
        forwardEps: num(stats?.forwardEps),
        beta: num(detail?.beta),
        dividendYield: num(detail?.dividendYield),
        pegRatio: num(stats?.pegRatio),
        priceToBook: num(stats?.priceToBook),
        fiftyTwoWeekHigh: num(detail?.fiftyTwoWeekHigh),
        fiftyTwoWeekLow: num(detail?.fiftyTwoWeekLow),
        averageVolume: num(detail?.averageVolume),
        sharesOutstanding: num(stats?.sharesOutstanding),
      },
      earnings: {
        nextDate: nextEarnings ? nextEarnings.toISOString() : null,
        history,
      },
      analyst,
      peers,
    };
  }
}
