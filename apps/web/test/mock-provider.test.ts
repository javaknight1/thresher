import { describe, expect, it } from 'vitest';
import { analyze, DEFAULT_CONFIG, type Context, type Timeframe } from '@thresher/engine';
import { MockProvider } from '../lib/providers/mock';
import { ProviderError } from '../lib/contracts';
import { checkGuardrails } from '../lib/guardrails';
import { WEB_CONFIG } from '../lib/config';

const TIMEFRAMES: Timeframe[] = ['intraday', 'swing', 'position'];

function ctx(symbol: string, timeframe: Timeframe): Context {
  return { symbol, timeframe, tradingDaysToEarnings: null };
}

describe('MockProvider.getBars', () => {
  const provider = new MockProvider();

  it('returns ~300 bars — comfortably above the engine minimum', async () => {
    const bars = await provider.getBars('MOCKLONG', 'swing');
    expect(bars.length).toBe(300);
  });

  it('is deterministic: same symbol+timeframe → identical series', async () => {
    const a = await provider.getBars('ANYTHING', 'swing');
    const b = await provider.getBars('ANYTHING', 'swing');
    expect(a).toEqual(b);
  });

  it('varies by symbol and by timeframe', async () => {
    const a = await provider.getBars('AAA', 'swing');
    const b = await provider.getBars('BBB', 'swing');
    const c = await provider.getBars('AAA', 'position');
    expect(a).not.toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('produces valid OHLC bars with increasing timestamps', async () => {
    const bars = await provider.getBars('MOCKCHOP', 'intraday');
    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i];
      expect(bar.h).toBeGreaterThanOrEqual(Math.max(bar.o, bar.c));
      expect(bar.l).toBeLessThanOrEqual(Math.min(bar.o, bar.c));
      expect(bar.v).toBeGreaterThan(0);
      if (i > 0) expect(bar.t).toBeGreaterThan(bars[i - 1].t);
    }
  });

  it('throws ProviderError(UNKNOWN_SYMBOL) for MOCKUNKNOWN', async () => {
    const err = await provider.getBars('MOCKUNKNOWN', 'swing').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).code).toBe('UNKNOWN_SYMBOL');
  });

  it('every non-MOCKCHEAP series passes guardrails on every timeframe', async () => {
    for (const symbol of ['MOCKLONG', 'MOCKCHOP', 'MOCKEARNINGS', 'NVDA', 'ZZZZ']) {
      for (const tf of TIMEFRAMES) {
        const bars = await provider.getBars(symbol, tf);
        expect(checkGuardrails(bars, tf), `${symbol}/${tf}`).toEqual({ ok: true });
        expect(Math.min(...bars.map((b) => b.c))).toBeGreaterThanOrEqual(10);
      }
    }
  });

  it('MOCKCHEAP trades around $1 and trips the price guardrail', async () => {
    const bars = await provider.getBars('MOCKCHEAP', 'swing');
    const last = bars[bars.length - 1].c;
    expect(last).toBeLessThan(WEB_CONFIG.guardrails.minPrice);
    const result = checkGuardrails(bars, 'swing');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('floor');
  });
});

describe('MockProvider + real engine', () => {
  const provider = new MockProvider();

  it('MOCKLONG on swing: the engine emits a LONG plan', async () => {
    const bars = await provider.getBars('MOCKLONG', 'swing');
    const result = analyze(bars, DEFAULT_CONFIG, ctx('MOCKLONG', 'swing'));
    expect(result.direction).toBe('long');
    expect(result.plan).not.toBeNull();
    expect(result.refusal).toBeNull();
    // tuned with margin: composite well past the threshold, confidence well past the gate
    expect(result.composite).toBeGreaterThan(DEFAULT_CONFIG.direction.threshold);
    expect(result.confidence.score).toBeGreaterThan(DEFAULT_CONFIG.gates.minConfidence);
  });

  it('MOCKCHOP on swing: the engine refuses', async () => {
    const bars = await provider.getBars('MOCKCHOP', 'swing');
    const result = analyze(bars, DEFAULT_CONFIG, ctx('MOCKCHOP', 'swing'));
    expect(result.refusal).not.toBeNull();
    expect(result.plan).toBeNull();
  });
});

describe('MockProvider.getDaysToEarnings', () => {
  const provider = new MockProvider();

  it('returns 1 for MOCKEARNINGS', async () => {
    await expect(provider.getDaysToEarnings('MOCKEARNINGS')).resolves.toBe(1);
  });

  it('returns null for everything else', async () => {
    await expect(provider.getDaysToEarnings('MOCKLONG')).resolves.toBeNull();
    await expect(provider.getDaysToEarnings('NVDA')).resolves.toBeNull();
  });
});

describe('MockProvider.getProfile', () => {
  const provider = new MockProvider();

  it('returns a deterministic, fully-shaped profile', async () => {
    const a = await provider.getProfile('MOCKLONG');
    const b = await provider.getProfile('mocklong'); // case-insensitive
    expect(a).toEqual(b);
    expect(a.symbol).toBe('MOCKLONG');
    expect(a.name).toBeTruthy();
    expect(a.sector).toBeTruthy();
    expect(a.peers.length).toBeGreaterThan(0);
    expect(a.earnings.history.length).toBeGreaterThan(0);
    expect(a.analyst).not.toBeNull();
  });

  it('throws UNKNOWN_SYMBOL for MOCKUNKNOWN', async () => {
    await expect(provider.getProfile('MOCKUNKNOWN')).rejects.toThrow(/unknown symbol/i);
  });
});
